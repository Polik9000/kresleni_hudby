import type { FireworkEvent, Layer, Stroke, StrokeCurve } from '../../shared/types'
import { applyCurve, fitCurve, moveHandle, moveNode, sliceStroke, translateCurve } from './curve'
import { FIREWORK_LIFETIME } from './render/fireworks'
import { smoothedPositions, strokePositions } from './render/stroke'

export interface EditorHost {
  /** Aktivní vrstva — upravuje se jen ta. */
  layer(): Layer
  /** Aktuální čas ve vlastním čase aktivní vrstvy. */
  time(): number
  /** Zavolá se těsně před první změnou dat (krok pro Zpět). */
  beginChange(): void
  /** Zavolá se po dokončené změně dat. */
  changed(): void
  selectionChanged(): void
}

interface Pos {
  x: number
  y: number
}

type Selection =
  /** `node`: vybraný uzel; `rangeEnd`: druhý konec úseku vybraného Shift+klikem. */
  | { kind: 'stroke'; stroke: Stroke; node: number | null; rangeEnd: number | null }
  | { kind: 'firework'; firework: FireworkEvent }

type Drag = { start: Pos; moved: boolean } & (
  | { kind: 'node'; origin: Stroke; curve: StrokeCurve; index: number }
  | { kind: 'handle'; origin: Stroke; curve: StrokeCurve; index: number; which: 'in' | 'out' }
  | { kind: 'stroke'; origin: Stroke }
  | { kind: 'firework'; origin: FireworkEvent }
)

type Clip = { kind: 'stroke'; stroke: Stroke } | { kind: 'firework'; firework: FireworkEvent }

/** Jak dlouho před svým začátkem je tah nebo ohňostroj v režimu úprav už vidět (s). */
const LEAD_SECONDS = 1
/** Nahrané body se před proložením křivkou vyhladí aspoň takto, jinak by z roztřesení vznikly desítky uzlů. */
const MIN_FIT_SMOOTHING = 0.25
const ACCENT = '#4db8ff'

const distance = (a: Pos, b: Pos): number => Math.hypot(a.x - b.x, a.y - b.y)

function distanceToSegment(p: Pos, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  const f = lengthSq > 0 ? Math.min(Math.max(((p.x - ax) * dx + (p.y - ay) * dy) / lengthSq, 0), 1) : 0
  return Math.hypot(p.x - (ax + dx * f), p.y - (ay + dy * f))
}

/**
 * Režim úprav: výběr tahu nebo ohňostroje na plátně, tažení celého prvku, uzlů křivky a jejich
 * táhel, kopírování a vkládání. Každá úprava nahradí prvek ve vrstvě novým objektem — starý
 * zůstává nedotčený ve stavech pro Zpět a cache vykreslení (podle objektu tahu) se sama zneplatní.
 */
export class Editor {
  private selection: Selection | null = null
  private drag: Drag | null = null
  private clip: Clip | null = null
  /** Křivky dopočítané jen pro zobrazení uzlů; do tahu se zapíšou až první úpravou tvaru. */
  private readonly fitted = new WeakMap<Stroke, { smoothing: number; curve: StrokeCurve }>()

  constructor(private readonly host: EditorHost) {}

  get hasSelection(): boolean {
    return this.selection !== null
  }

  get hasClipboard(): boolean {
    return this.clip !== null
  }

  clear(): void {
    this.drag = null
    if (!this.selection) return
    this.selection = null
    this.host.selectionChanged()
  }

  describe(): string {
    const sel = this.selection
    if (!sel) return 'Nic není vybráno — klikni na čáru nebo ohňostroj.'
    if (sel.kind === 'firework') return 'Vybrán ohňostroj.'
    const nodes = this.curveOf(sel.stroke).nodes.length
    if (sel.node !== null && sel.rangeEnd !== null) {
      return `Vybrán úsek čáry mezi uzly ${Math.min(sel.node, sel.rangeEnd) + 1} a ${Math.max(sel.node, sel.rangeEnd) + 1} z ${nodes}.`
    }
    return sel.node !== null ? `Vybrán uzel ${sel.node + 1} z ${nodes}.` : `Vybrána čára (${nodes} uzlů).`
  }

  /** Začátek vybraného prvku ve vlastním čase vrstvy, null bez výběru. */
  selectedStart(): number | null {
    const sel = this.selection
    if (!sel) return null
    return sel.kind === 'firework' ? sel.firework.t : sel.stroke.points[0].t
  }

  /** Posune vybraný prvek v čase tak, aby začínal v `time`. */
  setSelectedStart(time: number): void {
    const sel = this.selection
    const start = this.selectedStart()
    if (!sel || start === null || time === start) return
    const shift = time - start
    this.host.beginChange()
    if (sel.kind === 'firework') {
      this.replaceFirework({ ...sel.firework, t: time })
    } else {
      this.replaceStroke({ ...sel.stroke, points: sel.stroke.points.map((p) => ({ ...p, t: p.t + shift })) })
    }
    this.host.changed()
  }

  deleteSelected(): void {
    const sel = this.selection
    if (!sel) return
    const layer = this.host.layer()
    this.host.beginChange()
    if (sel.kind === 'firework') layer.fireworks.splice(layer.fireworks.indexOf(sel.firework), 1)
    else layer.strokes.splice(layer.strokes.indexOf(sel.stroke), 1)
    this.selection = null
    this.drag = null
    this.host.changed()
    this.host.selectionChanged()
  }

  /** Zkopíruje vybraný prvek; u čáry s vybraným úsekem mezi dvěma uzly jen ten úsek. */
  copy(): boolean {
    const sel = this.selection
    if (!sel) return false
    if (sel.kind === 'firework') {
      this.clip = { kind: 'firework', firework: { ...sel.firework, t: 0 } }
    } else {
      let stroke = sel.stroke
      if (sel.node !== null && sel.rangeEnd !== null) {
        const from = Math.min(sel.node, sel.rangeEnd)
        const to = Math.max(sel.node, sel.rangeEnd)
        stroke = sliceStroke(stroke, this.curveOf(stroke), from, to, stroke.curve !== undefined)
      }
      const start = stroke.points[0].t
      // Časy ve schránce jsou od nuly; při vložení se přičte čas přehrávací hlavy.
      this.clip = { kind: 'stroke', stroke: this.cloneStroke(stroke, -start) }
    }
    this.host.selectionChanged()
    return true
  }

  /** Vloží obsah schránky do aktivní vrstvy tak, aby začínal v aktuálním čase, a vybere ho. */
  paste(): boolean {
    const clip = this.clip
    if (!clip) return false
    const layer = this.host.layer()
    const time = this.host.time()
    this.host.beginChange()
    if (clip.kind === 'firework') {
      const firework = { ...clip.firework, t: time }
      layer.fireworks.push(firework)
      this.selection = { kind: 'firework', firework }
    } else {
      const stroke = this.cloneStroke(clip.stroke, time)
      layer.strokes.push(stroke)
      this.selection = { kind: 'stroke', stroke, node: null, rangeEnd: null }
    }
    this.host.changed()
    this.host.selectionChanged()
    return true
  }

  /** `radius`: dosah kliknutí v logických px (odpovídá ~10 px na obrazovce). */
  pointerDown(pos: Pos, mods: { shiftKey: boolean }, radius: number): void {
    this.validate()
    const layer = this.host.layer()
    const sel = this.selection
    const drag = { start: pos, moved: false }

    if (sel?.kind === 'stroke') {
      const curve = this.curveOf(sel.stroke)
      if (sel.node !== null && !mods.shiftKey) {
        for (const which of ['in', 'out'] as const) {
          const handle = this.handlePosition(curve, sel.node, which)
          if (handle && distance(pos, handle) <= radius) {
            this.drag = { ...drag, kind: 'handle', origin: sel.stroke, curve, index: sel.node, which }
            return
          }
        }
      }
      let nearest = -1
      let nearestDistance = radius
      curve.nodes.forEach((node, i) => {
        const d = distance(pos, node)
        if (d <= nearestDistance) {
          nearest = i
          nearestDistance = d
        }
      })
      if (nearest >= 0) {
        if (mods.shiftKey && sel.node !== null) {
          sel.rangeEnd = nearest === sel.node ? null : nearest
        } else {
          sel.node = nearest
          sel.rangeEnd = null
          this.drag = { ...drag, kind: 'node', origin: sel.stroke, curve, index: nearest }
        }
        this.host.selectionChanged()
        return
      }
    }

    let firework: FireworkEvent | null = null
    let best = radius * 1.5
    for (const fw of this.visibleFireworks()) {
      const d = distance(pos, fw)
      if (d <= best) {
        firework = fw
        best = d
      }
    }
    if (firework) {
      this.selection = { kind: 'firework', firework }
      this.drag = { ...drag, kind: 'firework', origin: firework }
      this.host.selectionChanged()
      return
    }

    let stroke: Stroke | null = null
    best = Infinity
    for (const candidate of this.visibleStrokes()) {
      const d = this.distanceToStroke(pos, candidate, layer)
      if (d <= Math.max(radius, layer.style.width / 2) && d < best) {
        stroke = candidate
        best = d
      }
    }
    if (stroke) {
      if (sel?.kind !== 'stroke' || sel.stroke !== stroke) {
        this.selection = { kind: 'stroke', stroke, node: null, rangeEnd: null }
      }
      this.drag = { ...drag, kind: 'stroke', origin: stroke }
    } else {
      this.selection = null
    }
    this.host.selectionChanged()
  }

  /** `breakTangent` (Alt): táhlo se pohne samo, protější zůstane — v uzlu vznikne roh. */
  pointerMove(pos: Pos, breakTangent: boolean): void {
    const drag = this.drag
    if (!drag) return
    if (!drag.moved) {
      // Pouhý klik (výběr) nemá čáru o zlomek pixelu posunout ani ji převést na křivku.
      if (distance(pos, drag.start) < 0.5) return
      drag.moved = true
      this.host.beginChange()
    }
    const dx = pos.x - drag.start.x
    const dy = pos.y - drag.start.y
    if (drag.kind === 'firework') {
      this.replaceFirework({ ...drag.origin, x: drag.origin.x + dx, y: drag.origin.y + dy })
    } else if (drag.kind === 'stroke') {
      const { origin } = drag
      const moved: Stroke = { points: origin.points.map((p) => ({ x: p.x + dx, y: p.y + dy, t: p.t })) }
      if (origin.curve) moved.curve = translateCurve(origin.curve, dx, dy)
      this.replaceStroke(moved)
    } else if (drag.kind === 'node') {
      this.replaceStroke(applyCurve(drag.origin, moveNode(drag.curve, drag.index, dx, dy)))
    } else {
      const handle = this.handlePosition(drag.curve, drag.index, drag.which)!
      const curve = moveHandle(drag.curve, drag.index, drag.which, handle.x + dx, handle.y + dy, !breakTangent)
      this.replaceStroke(applyCurve(drag.origin, curve))
    }
  }

  pointerUp(): void {
    const moved = this.drag?.moved
    this.drag = null
    if (moved) this.host.changed()
  }

  /**
   * Nakreslí přes náhled obrysy čar, uzly, táhla a značky ohňostrojů.
   * `scale`: pixely canvasu na logický px; `unit`: logické px na 1 px obrazovky.
   */
  draw(ctx: CanvasRenderingContext2D, scale: number, unit: number): void {
    this.validate()
    const layer = this.host.layer()
    const sel = this.selection
    ctx.save()
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const stroke of this.visibleStrokes()) {
      const selected = sel?.kind === 'stroke' && sel.stroke === stroke
      const { xs, ys } = strokePositions(stroke, layer.style)
      ctx.strokeStyle = selected ? '#fff' : 'rgba(255,255,255,0.4)'
      ctx.lineWidth = (selected ? 1.5 : 1) * unit
      ctx.beginPath()
      ctx.moveTo(xs[0], ys[0])
      for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(xs[i], ys[i])
      ctx.stroke()
    }

    for (const fw of this.visibleFireworks()) {
      const selected = sel?.kind === 'firework' && sel.firework === fw
      const r = 9 * unit
      ctx.strokeStyle = selected ? '#fff' : layer.style.fireworkColor
      ctx.lineWidth = (selected ? 2 : 1.5) * unit
      ctx.beginPath()
      ctx.arc(fw.x, fw.y, r, 0, Math.PI * 2)
      ctx.moveTo(fw.x - r * 0.5, fw.y)
      ctx.lineTo(fw.x + r * 0.5, fw.y)
      ctx.moveTo(fw.x, fw.y - r * 0.5)
      ctx.lineTo(fw.x, fw.y + r * 0.5)
      ctx.stroke()
    }

    if (sel?.kind === 'stroke') {
      const curve = this.curveOf(sel.stroke)
      const { node, rangeEnd } = sel
      if (node !== null) {
        ctx.strokeStyle = ACCENT
        ctx.fillStyle = '#fff'
        ctx.lineWidth = unit
        for (const which of ['in', 'out'] as const) {
          const handle = this.handlePosition(curve, node, which)
          if (!handle) continue
          ctx.beginPath()
          ctx.moveTo(curve.nodes[node].x, curve.nodes[node].y)
          ctx.lineTo(handle.x, handle.y)
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(handle.x, handle.y, 4 * unit, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        }
      }
      const half = 3.5 * unit
      const low = node === null ? -1 : Math.min(node, rangeEnd ?? node)
      const high = node === null ? -1 : Math.max(node, rangeEnd ?? node)
      ctx.lineWidth = unit
      curve.nodes.forEach((n, i) => {
        ctx.fillStyle = i >= low && i <= high ? ACCENT : '#0b0c0f'
        ctx.strokeStyle = '#fff'
        ctx.fillRect(n.x - half, n.y - half, half * 2, half * 2)
        ctx.strokeRect(n.x - half, n.y - half, half * 2, half * 2)
      })
    }
    ctx.restore()
  }

  /** Výběr mohl zaniknout jinde (Zpět, přepnutí vrstvy, nový projekt). */
  private validate(): void {
    const sel = this.selection
    if (!sel) return
    const layer = this.host.layer()
    const alive = sel.kind === 'firework' ? layer.fireworks.includes(sel.firework) : layer.strokes.includes(sel.stroke)
    if (alive) return
    this.selection = null
    this.drag = null
    this.host.selectionChanged()
  }

  private curveOf(stroke: Stroke): StrokeCurve {
    if (stroke.curve) return stroke.curve
    const smoothing = Math.max(this.host.layer().style.smoothing, MIN_FIT_SMOOTHING)
    let entry = this.fitted.get(stroke)
    if (!entry || entry.smoothing !== smoothing) {
      const { xs, ys } = smoothedPositions(stroke, smoothing)
      entry = { smoothing, curve: fitCurve(stroke.points.map((_, i) => ({ x: xs[i], y: ys[i] }))) }
      this.fitted.set(stroke, entry)
    }
    return entry.curve
  }

  /** Poloha táhla; první uzel nemá vstupní a poslední výstupní. */
  private handlePosition(curve: StrokeCurve, index: number, which: 'in' | 'out'): Pos | null {
    const node = curve.nodes[index]
    if (which === 'in') return index > 0 ? { x: node.inX, y: node.inY } : null
    return index < curve.nodes.length - 1 ? { x: node.outX, y: node.outY } : null
  }

  private visibleStrokes(): Stroke[] {
    const layer = this.host.layer()
    const time = this.host.time()
    const sel = this.selection
    return layer.strokes.filter((stroke) => {
      if (sel?.kind === 'stroke' && sel.stroke === stroke) return true
      const { points } = stroke
      return time >= points[0].t - LEAD_SECONDS && time <= points[points.length - 1].t + layer.style.fadeSeconds
    })
  }

  private visibleFireworks(): FireworkEvent[] {
    const time = this.host.time()
    const sel = this.selection
    return this.host
      .layer()
      .fireworks.filter(
        (fw) =>
          (sel?.kind === 'firework' && sel.firework === fw) ||
          (time >= fw.t - LEAD_SECONDS && time <= fw.t + FIREWORK_LIFETIME)
      )
  }

  private distanceToStroke(pos: Pos, stroke: Stroke, layer: Layer): number {
    const { xs, ys } = strokePositions(stroke, layer.style)
    const n = stroke.points.length
    if (n === 1) return Math.hypot(pos.x - xs[0], pos.y - ys[0])
    let best = Infinity
    for (let i = 1; i < n; i++) best = Math.min(best, distanceToSegment(pos, xs[i - 1], ys[i - 1], xs[i], ys[i]))
    return best
  }

  private cloneStroke(stroke: Stroke, timeShift: number): Stroke {
    const clone: Stroke = { points: stroke.points.map((p) => ({ x: p.x, y: p.y, t: p.t + timeShift })) }
    if (stroke.curve) {
      clone.curve = { nodes: stroke.curve.nodes.map((node) => ({ ...node })), params: stroke.curve.params.slice() }
    }
    return clone
  }

  /** Nahradí vybraný tah ve vrstvě novým objektem a výběr na něj přenese. */
  private replaceStroke(next: Stroke): void {
    const sel = this.selection
    if (sel?.kind !== 'stroke') return
    const { strokes } = this.host.layer()
    strokes[strokes.indexOf(sel.stroke)] = next
    sel.stroke = next
  }

  private replaceFirework(next: FireworkEvent): void {
    const sel = this.selection
    if (sel?.kind !== 'firework') return
    const { fireworks } = this.host.layer()
    fireworks[fireworks.indexOf(sel.firework)] = next
    sel.firework = next
  }
}
