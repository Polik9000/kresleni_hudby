import type { Layer } from '../../shared/types'

export interface TimelineSource {
  /** Délka zobrazeného rozsahu v sekundách. */
  duration(): number
  time(): number
  peaks(columns: number): Float32Array | null
  layers(): Layer[]
}

/** Časová osa: waveform, značky nahraného obsahu, přehrávací hlava; kliknutím/tažením se přetáčí. */
export class Timeline {
  private readonly ctx: CanvasRenderingContext2D
  private readonly background = document.createElement('canvas')
  private backgroundDirty = true
  private backgroundDuration = 0

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly source: TimelineSource,
    onSeek: (time: number) => void
  ) {
    this.ctx = canvas.getContext('2d')!
    new ResizeObserver(() => this.resize()).observe(canvas)
    this.resize()

    const seekFromEvent = (e: PointerEvent): void => {
      const rect = canvas.getBoundingClientRect()
      const f = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
      onSeek(f * this.source.duration())
    }
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      canvas.setPointerCapture(e.pointerId)
      seekFromEvent(e)
    })
    canvas.addEventListener('pointermove', (e) => {
      if (canvas.hasPointerCapture(e.pointerId)) seekFromEvent(e)
    })
  }

  /** Zavolat po změně audia nebo nahraného obsahu. */
  invalidate(): void {
    this.backgroundDirty = true
  }

  draw(): void {
    const { ctx, canvas } = this
    const duration = this.source.duration()
    if (this.backgroundDirty || duration !== this.backgroundDuration) this.drawBackground(duration)
    ctx.drawImage(this.background, 0, 0)

    const x = Math.round((this.source.time() / duration) * canvas.width)
    ctx.fillStyle = '#fff'
    ctx.fillRect(x - 1, 0, 2, canvas.height)
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1
    const width = Math.max(Math.round(this.canvas.clientWidth * dpr), 1)
    const height = Math.max(Math.round(this.canvas.clientHeight * dpr), 1)
    if (this.canvas.width === width && this.canvas.height === height) return
    this.canvas.width = width
    this.canvas.height = height
    this.backgroundDirty = true
  }

  private drawBackground(duration: number): void {
    const { width, height } = this.canvas
    this.background.width = width
    this.background.height = height
    const g = this.background.getContext('2d')!
    g.fillStyle = '#14161b'
    g.fillRect(0, 0, width, height)

    // Spodní pruh patří značkám obsahu, zbytek waveformu.
    const markerHeight = Math.round(height * 0.26)
    const waveHeight = height - markerHeight
    const peaks = this.source.peaks(width)
    if (peaks) {
      const mid = waveHeight / 2
      g.fillStyle = '#4a5368'
      for (let x = 0; x < width; x++) {
        const top = mid - peaks[x * 2 + 1] * mid
        const bottom = mid - peaks[x * 2] * mid
        g.fillRect(x, top, 1, Math.max(bottom - top, 1))
      }
    } else {
      g.fillStyle = '#2a2e38'
      g.fillRect(0, waveHeight / 2, width, 1)
    }

    const toX = (t: number): number => (t / duration) * width
    for (const layer of this.source.layers()) {
      if (!layer.visible) continue
      g.fillStyle = layer.style.lineColor
      for (const stroke of layer.strokes) {
        const from = toX(stroke.points[0].t)
        const to = toX(stroke.points[stroke.points.length - 1].t)
        g.fillRect(from, waveHeight + 2, Math.max(to - from, 1), markerHeight - 4)
      }
      g.fillStyle = layer.style.fireworkColor
      for (const fw of layer.fireworks) g.fillRect(toX(fw.t) - 1, waveHeight - 4, 2, markerHeight + 4)
    }

    this.backgroundDirty = false
    this.backgroundDuration = duration
  }
}
