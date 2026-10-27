import type { Layer } from '../../shared/types'
import type { TimeWindow } from './timeWindow'

export interface TimelineSource {
  /** Délka celé osy v sekundách. */
  duration(): number
  time(): number
  /** Obrys waveformu pro úsek `from`–`to` v sekundách. */
  peaks(columns: number, from: number, to: number): Float32Array | null
  layers(): Layer[]
  activeLayer(): Layer
  /** Časové okno režimu úprav kolem přehrávací hlavy; null mimo režim úprav. */
  editWindow(): TimeWindow | null
}

export interface TimelineHandlers {
  onSeek(time: number): void
  /** Tažení pruhu vrstvy se Shiftem: nový posun vrstvy v sekundách. */
  onLayerOffset(layer: Layer, offset: number): void
  /** Tažení okraje pásma časového okna: nová délka „zpět“ nebo „dopředu“ v sekundách. */
  onEditWindow(edge: 'back' | 'ahead', seconds: number): void
}

/** Výška waveformu a pruhu jedné vrstvy v CSS px; pruhy dohromady nepřerostou `MAX_LANES_HEIGHT`. */
const WAVE_HEIGHT = 54
const LANE_HEIGHT = 14
const MAX_LANES_HEIGHT = 112
/** Nejkratší úsek skladby (s), na který jde osu přiblížit. */
const MIN_SPAN = 2
/** Jak blízko okraje pásma časového okna (CSS px) ho jde chytit. */
const EDGE_GRAB = 6

/**
 * Časová osa: waveform, pod ním pruh se značkami obsahu pro každou vrstvu, přehrávací hlava.
 * Kliknutím/tažením se přetáčí, tažením pruhu vrstvy se Shiftem se vrstva posouvá v čase.
 * Osu jde přiblížit (kolečko, `zoomBy`); při přehrávání se výřez posouvá za přehrávací hlavou.
 */
export class Timeline {
  private readonly ctx: CanvasRenderingContext2D
  private readonly background = document.createElement('canvas')
  private backgroundDirty = true
  /** Výřez, pro který je pozadí vykreslené. */
  private backgroundView = ''
  private lanes = 0
  private zoom = 1
  private viewStart = 0
  private lastTime = 0
  private drag: { layer: Layer; startX: number; startOffset: number } | null = null
  private edgeDrag: 'back' | 'ahead' | null = null

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly source: TimelineSource,
    handlers: TimelineHandlers
  ) {
    this.ctx = canvas.getContext('2d')!
    new ResizeObserver(() => this.resize()).observe(canvas)
    this.updateHeight()
    this.resize()

    const timeAt = (e: PointerEvent): number => {
      const rect = canvas.getBoundingClientRect()
      const f = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
      const { start, span } = this.view()
      return start + f * span
    }
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      canvas.setPointerCapture(e.pointerId)
      const layer = e.shiftKey ? this.layerAt(e) : null
      if (layer) {
        this.drag = { layer, startX: e.clientX, startOffset: layer.offset }
        return
      }
      this.edgeDrag = e.shiftKey ? null : this.edgeAt(e)
      if (!this.edgeDrag) handlers.onSeek(timeAt(e))
    })
    canvas.addEventListener('pointermove', (e) => {
      if (!canvas.hasPointerCapture(e.pointerId)) {
        canvas.style.cursor = this.edgeAt(e) ? 'ew-resize' : ''
        return
      }
      if (this.edgeDrag) {
        const offset = timeAt(e) - this.source.time()
        handlers.onEditWindow(this.edgeDrag, Math.max(this.edgeDrag === 'back' ? -offset : offset, 0))
      } else if (this.drag) {
        const seconds = ((e.clientX - this.drag.startX) / canvas.getBoundingClientRect().width) * this.view().span
        handlers.onLayerOffset(this.drag.layer, this.drag.startOffset + seconds)
      } else {
        handlers.onSeek(timeAt(e))
      }
    })
    const endDrag = (): void => {
      this.drag = null
      this.edgeDrag = null
    }
    canvas.addEventListener('pointerup', endDrag)
    canvas.addEventListener('pointercancel', endDrag)

    // Kolečko přibližuje kolem místa pod kurzorem; se Shiftem (nebo vodorovné posouvání touchpadem) výřez posouvá.
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        const rect = canvas.getBoundingClientRect()
        const { start, span } = this.view()
        if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY
          this.viewStart = start + (delta / rect.width) * span
        } else {
          this.zoomBy(Math.exp(-e.deltaY * 0.0025), start + ((e.clientX - rect.left) / rect.width) * span)
        }
      },
      { passive: false }
    )
  }

  get zoomLevel(): number {
    return this.zoom
  }

  /** Přiblíží (`factor` > 1) nebo oddálí osu; čas `anchor` zůstane na místě (výchozí: přehrávací hlava). */
  zoomBy(factor: number, anchor?: number): void {
    const before = this.view()
    const time = this.source.time()
    const visible = time >= before.start && time <= before.start + before.span
    const at = anchor ?? (visible ? time : before.start + before.span / 2)
    const fraction = (at - before.start) / before.span
    this.zoom *= factor
    this.viewStart = at - fraction * this.view().span
  }

  resetZoom(): void {
    this.zoom = 1
  }

  /** Viditelný úsek osy; přiblížení i začátek výřezu přitom srovná do platných mezí. */
  private view(): { start: number; span: number } {
    const duration = this.source.duration()
    this.zoom = Math.min(Math.max(this.zoom, 1), Math.max(duration / MIN_SPAN, 1))
    const span = duration / this.zoom
    this.viewStart = Math.min(Math.max(this.viewStart, 0), duration - span)
    return { start: this.viewStart, span }
  }

  /** Zavolat po změně audia, nahraného obsahu nebo vrstev. */
  invalidate(): void {
    this.backgroundDirty = true
  }

  draw(): void {
    const { ctx, canvas } = this
    this.updateHeight()
    const time = this.source.time()
    let { start, span } = this.view()
    // Hlava se pohnula (přehrávání, skok na začátek) a vyjela z výřezu — výřez přeskočí za ní.
    if (time !== this.lastTime && (time < start - 1e-6 || time > start + span + 1e-6)) {
      this.viewStart = time - span * 0.05
      ;({ start, span } = this.view())
    }
    this.lastTime = time
    const viewKey = `${this.source.duration()}|${start}|${span}`
    if (this.backgroundDirty || viewKey !== this.backgroundView) {
      this.drawBackground(start, span)
      this.backgroundView = viewKey
    }
    ctx.drawImage(this.background, 0, 0)

    // Pásmo časového okna režimu úprav jede s přehrávací hlavou.
    const win = this.source.editWindow()
    if (win) {
      const left = ((time - win.back - start) / span) * canvas.width
      const right = ((time + win.ahead - start) / span) * canvas.width
      ctx.fillStyle = 'rgba(77, 184, 255, 0.16)'
      ctx.fillRect(left, 0, right - left, canvas.height)
      ctx.fillStyle = '#4db8ff'
      ctx.fillRect(Math.round(left) - 1, 0, 2, canvas.height)
      ctx.fillRect(Math.round(right) - 1, 0, 2, canvas.height)
    }

    const x = Math.round(((time - start) / span) * canvas.width)
    ctx.fillStyle = '#fff'
    ctx.fillRect(x - 1, 0, 2, canvas.height)
  }

  private lanesHeight(): number {
    return Math.min(this.lanes * LANE_HEIGHT, MAX_LANES_HEIGHT)
  }

  /** Výška osy roste s počtem vrstev; změnu velikosti canvasu pak dořeší ResizeObserver. */
  private updateHeight(): void {
    const lanes = this.source.layers().length
    if (lanes === this.lanes) return
    this.lanes = lanes
    this.canvas.style.height = `${WAVE_HEIGHT + this.lanesHeight()}px`
    this.backgroundDirty = true
  }

  /** Okraj pásma časového okna pod ukazatelem (null mimo režim úprav nebo mimo okraj). */
  private edgeAt(e: PointerEvent): 'back' | 'ahead' | null {
    const win = this.source.editWindow()
    if (!win) return null
    const rect = this.canvas.getBoundingClientRect()
    const { start, span } = this.view()
    const time = this.source.time()
    const toX = (t: number): number => rect.left + ((t - start) / span) * rect.width
    const back = Math.abs(e.clientX - toX(time - win.back))
    const ahead = Math.abs(e.clientX - toX(time + win.ahead))
    if (Math.min(back, ahead) > EDGE_GRAB) return null
    return back < ahead ? 'back' : 'ahead'
  }

  /** Vrstva, jejíž pruh leží pod ukazatelem (null nad waveformem). */
  private layerAt(e: PointerEvent): Layer | null {
    const rect = this.canvas.getBoundingClientRect()
    const y = e.clientY - rect.top - WAVE_HEIGHT
    if (y < 0) return null
    const layers = this.source.layers()
    const index = Math.min(Math.floor((y / this.lanesHeight()) * layers.length), layers.length - 1)
    return layers[index] ?? null
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

  private drawBackground(start: number, span: number): void {
    const { width, height } = this.canvas
    this.background.width = width
    this.background.height = height
    const g = this.background.getContext('2d')!
    g.fillStyle = '#14161b'
    g.fillRect(0, 0, width, height)

    // Spodní část patří pruhům vrstev, zbytek waveformu.
    const layers = this.source.layers()
    const waveHeight = Math.round((height * WAVE_HEIGHT) / (WAVE_HEIGHT + this.lanesHeight()))
    const laneHeight = (height - waveHeight) / Math.max(layers.length, 1)
    const peaks = this.source.peaks(width, start, start + span)
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

    const toX = (t: number): number => ((t - start) / span) * width
    const active = this.source.activeLayer()
    layers.forEach((layer, index) => {
      const top = waveHeight + index * laneHeight
      g.globalAlpha = 1
      g.fillStyle = layer === active ? '#262b36' : '#1a1d24'
      g.fillRect(0, top + 1, width, laneHeight - 1)
      // Skrytá vrstva zůstává na ose vidět, jen ztlumeně.
      g.globalAlpha = layer.visible ? 1 : 0.3
      g.fillStyle = layer.style.lineColor
      for (const stroke of layer.strokes) {
        const from = toX(stroke.points[0].t + layer.offset)
        const to = toX(stroke.points[stroke.points.length - 1].t + layer.offset)
        g.fillRect(from, top + 3, Math.max(to - from, 1), laneHeight - 5)
      }
      g.fillStyle = layer.style.fireworkColor
      for (const fw of layer.fireworks) g.fillRect(toX(fw.t + layer.offset) - 1, top + 1, 2, laneHeight - 1)
    })
    g.globalAlpha = 1

    // Při přiblížení ukazuje proužek nahoře, kterou část skladby výřez zabírá.
    if (this.zoom > 1) {
      const duration = this.source.duration()
      g.fillStyle = '#4db8ff'
      g.fillRect((start / duration) * width, 0, Math.max((span / duration) * width, 2), Math.max(Math.round(height / 28), 2))
    }

    this.backgroundDirty = false
  }
}
