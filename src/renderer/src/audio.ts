/**
 * Přehrávání audia přes Web Audio API. Hodiny AudioContextu slouží jako jediný zdroj času
 * pro nahrávání i náhled — vizuál se tak nemůže vůči zvuku rozejít.
 * Bez načteného audia běží transport jako tiché hodiny (jde kreslit i bez hudby).
 */
export class AudioEngine {
  private readonly ctx = new AudioContext({ latencyHint: 'interactive' })
  private readonly gain = this.ctx.createGain()
  private buffer: AudioBuffer | null = null
  private source: AudioBufferSourceNode | null = null
  private startedAt = 0
  private offset = 0
  private isPlaying = false

  /** Voláno, když přehrávání samo dojede na konec skladby. */
  onEnded: (() => void) | null = null

  constructor() {
    this.gain.connect(this.ctx.destination)
  }

  get hasAudio(): boolean {
    return this.buffer !== null
  }

  get playing(): boolean {
    return this.isPlaying
  }

  /** Délka skladby; bez audia nekonečno (tiché hodiny nemají konec). */
  get duration(): number {
    return this.buffer ? this.buffer.duration : Infinity
  }

  /** Aktuální pozice ve skladbě v sekundách — to, co uživatel právě slyší. */
  get time(): number {
    if (!this.isPlaying) return this.offset
    // currentTime předbíhá reproduktory o výstupní latenci; bez korekce by záznam byl posunutý.
    const latency = Number.isFinite(this.ctx.outputLatency) ? this.ctx.outputLatency : 0
    const elapsed = Math.max(this.ctx.currentTime - this.startedAt - latency, 0)
    return Math.min(this.offset + elapsed, this.duration)
  }

  set volume(value: number) {
    this.gain.gain.value = value
  }

  async load(data: ArrayBuffer): Promise<void> {
    const buffer = await this.ctx.decodeAudioData(data)
    this.pause()
    this.buffer = buffer
    this.offset = 0
  }

  unload(): void {
    this.pause()
    this.buffer = null
    this.offset = 0
  }

  /** Špičky signálu pro kreslení waveformu: pro každý sloupec [min, max]. */
  /** Obrys waveformu (min, max na sloupec) pro úsek skladby `from`–`to` v sekundách. */
  peaks(columns: number, from = 0, to = this.duration): Float32Array | null {
    if (!this.buffer) return null
    const out = new Float32Array(columns * 2)
    const channels: Float32Array[] = []
    for (let c = 0; c < this.buffer.numberOfChannels; c++) channels.push(this.buffer.getChannelData(c))
    const firstSample = from * this.buffer.sampleRate
    const samplesPerColumn = ((to - from) * this.buffer.sampleRate) / columns
    // Nemusí se číst každý vzorek — pro obrys waveformu stačí řidší krok.
    const step = Math.max(1, Math.floor(samplesPerColumn / 256))
    for (let col = 0; col < columns; col++) {
      const begin = Math.max(Math.floor(firstSample + col * samplesPerColumn), 0)
      // Při velkém přiblížení připadá na sloupec méně než jeden vzorek — vždy se přečte aspoň jeden.
      const end = Math.min(Math.max(Math.floor(firstSample + (col + 1) * samplesPerColumn), begin + 1), this.buffer.length)
      let min = 0
      let max = 0
      for (const data of channels) {
        for (let i = begin; i < end; i += step) {
          const v = data[i]
          if (v < min) min = v
          else if (v > max) max = v
        }
      }
      out[col * 2] = min
      out[col * 2 + 1] = max
    }
    return out
  }

  async play(): Promise<void> {
    if (this.isPlaying) return
    if (this.ctx.state !== 'running') await this.ctx.resume()
    if (this.buffer) {
      if (this.offset >= this.buffer.duration - 0.01) this.offset = 0
      const source = this.ctx.createBufferSource()
      source.buffer = this.buffer
      source.connect(this.gain)
      source.onended = () => {
        if (this.source !== source) return
        this.source = null
        this.isPlaying = false
        this.offset = this.duration
        this.onEnded?.()
      }
      source.start(0, this.offset)
      this.source = source
    }
    this.startedAt = this.ctx.currentTime
    this.isPlaying = true
  }

  pause(): void {
    if (!this.isPlaying) return
    this.offset = this.time
    this.isPlaying = false
    this.stopSource()
  }

  seek(time: number): void {
    const target = Math.min(Math.max(time, 0), this.buffer ? this.buffer.duration : Number.MAX_VALUE)
    const wasPlaying = this.isPlaying
    this.isPlaying = false
    this.stopSource()
    this.offset = target
    if (wasPlaying) void this.play()
  }

  private stopSource(): void {
    const source = this.source
    this.source = null
    if (source) {
      source.onended = null
      source.stop()
      source.disconnect()
    }
  }
}
