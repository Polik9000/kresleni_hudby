import type { LayerStyle, Stroke, StrokePoint } from '../../../shared/types'
import { dimmed, type Rgb } from './color'

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Rychlost (logické px/s), při které dynamická čára dosáhne minimální tloušťky. */
const FAST_SPEED = 2600
/** Časová konstanta vyhlazení rychlosti — bez ní by tloušťka poskakovala. */
const SPEED_SMOOTHING = 0.09
const MIN_WIDTH_RATIO = 0.18

/** Index posledního bodu s t <= time, nebo -1. */
export function lastIndexAtOrBefore(points: StrokePoint[], time: number): number {
  let lo = 0
  let hi = points.length - 1
  let result = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (points[mid].t <= time) {
      result = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return result
}

interface WidthCache {
  mode: string
  width: number
  widths: number[]
  smoothedSpeed: number
}

const widthCache = new WeakMap<Stroke, WidthCache>()

/**
 * Tloušťka čáry v každém bodě tahu. Dynamický režim: pomalý pohyb = tlustá čára, rychlý = tenká.
 * Výsledek se cachuje a při nahrávání jen doplňuje o nové body.
 */
export function strokeWidths(stroke: Stroke, style: LayerStyle): number[] {
  const { points } = stroke
  let cache = widthCache.get(stroke)
  if (!cache || cache.mode !== style.widthMode || cache.width !== style.width || cache.widths.length > points.length) {
    cache = { mode: style.widthMode, width: style.width, widths: [], smoothedSpeed: 0 }
    widthCache.set(stroke, cache)
  }
  const { widths } = cache
  for (let i = widths.length; i < points.length; i++) {
    if (style.widthMode === 'fixed') {
      widths.push(style.width)
      continue
    }
    if (i > 0) {
      const a = points[i - 1]
      const b = points[i]
      const dt = Math.max(b.t - a.t, 1e-3)
      const speed = Math.hypot(b.x - a.x, b.y - a.y) / dt
      cache.smoothedSpeed += (speed - cache.smoothedSpeed) * (1 - Math.exp(-dt / SPEED_SMOOTHING))
    }
    const k = Math.min(cache.smoothedSpeed / FAST_SPEED, 1)
    const eased = k * (2 - k)
    widths.push(style.width * (1 - (1 - MIN_WIDTH_RATIO) * eased))
  }
  return widths
}

/** Poloviční šířka vyhlazovacího okna (s) při vyhlazení = 1. */
const MAX_SMOOTHING_WINDOW = 0.14

interface SmoothCache {
  smoothing: number
  xs: number[]
  ys: number[]
}

const smoothCache = new WeakMap<Stroke, SmoothCache>()

/**
 * Vyhlazené polohy bodů tahu (zaznamenaná data se nemění — vyhlazení jde kdykoli přenastavit).
 * Každý bod je vážený průměr sousedů v časovém okně; u konců tahu se okno symetricky zužuje,
 * takže začátek i konec (a při kreslení hrot pod kurzorem) zůstávají přesně na místě.
 */
export function smoothedPositions(stroke: Stroke, smoothing: number): { xs: number[]; ys: number[] } {
  const { points } = stroke
  const n = points.length
  let cache = smoothCache.get(stroke)
  if (!cache || cache.smoothing !== smoothing || cache.xs.length > n) {
    cache = { smoothing, xs: [], ys: [] }
    smoothCache.set(stroke, cache)
  }
  const { xs, ys } = cache
  const known = xs.length
  if (known === n) return cache

  const window = smoothing * MAX_SMOOTHING_WINDOW
  // Při nahrávání přibývají body na konci: přepočítat stačí ty, kterým konec tahu zužoval okno.
  let from = known
  if (known > 0) {
    const previousEnd = points[known - 1].t
    while (from > 0 && points[from - 1].t + window > previousEnd) from--
  }
  const startTime = points[0].t
  const endTime = points[n - 1].t
  for (let i = from; i < n; i++) {
    const p = points[i]
    const half = Math.min(window, p.t - startTime, endTime - p.t)
    let sumX = p.x
    let sumY = p.y
    let sumW = 1
    if (half > 1e-6) {
      for (let j = i - 1; j >= 0; j--) {
        const w = 1 - (p.t - points[j].t) / half
        if (w <= 0) break
        sumX += points[j].x * w
        sumY += points[j].y * w
        sumW += w
      }
      for (let j = i + 1; j < n; j++) {
        const w = 1 - (points[j].t - p.t) / half
        if (w <= 0) break
        sumX += points[j].x * w
        sumY += points[j].y * w
        sumW += w
      }
    }
    xs[i] = sumX / sumW
    ys[i] = sumY / sumW
  }
  return cache
}

/** Polohy bodů tak, jak se kreslí. Tah převedený na křivku je hladký sám a už se nevyhlazuje. */
export function strokePositions(stroke: Stroke, style: LayerStyle): { xs: number[]; ys: number[] } {
  return smoothedPositions(stroke, stroke.curve ? 0 : style.smoothing)
}

// Pracovní pole viditelného úseku — sdílená, aby se při každém snímku nealokovalo.
const vx: number[] = []
const vy: number[] = []
const vIntensity: number[] = []
const vWidth: number[] = []

/**
 * Vykreslí tah ve stavu v čase `time`: jen body starší než `time` a mladší než doba mizení,
 * s intenzitou klesající podle stáří. Čistá funkce času — stejný výsledek v náhledu i exportu.
 * Vrací true, pokud bylo něco vykresleno.
 */
export function drawStroke(ctx: Ctx2D, stroke: Stroke, style: LayerStyle, color: Rgb, time: number): boolean {
  const { points } = stroke
  const n = points.length
  if (n === 0 || points[0].t > time) return false
  const fade = Math.max(style.fadeSeconds, 0.05)
  if (points[n - 1].t + fade <= time) return false

  const head = lastIndexAtOrBefore(points, time)
  // Jeden bod před hranou mizení navíc, aby konec stopy plynule dojel do nuly.
  const first = Math.max(lastIndexAtOrBefore(points, time - fade), 0)
  const widths = strokeWidths(stroke, style)
  const { xs, ys } = strokePositions(stroke, style)

  let m = 0
  for (let i = first; i <= head; i++) {
    vx[m] = xs[i]
    vy[m] = ys[i]
    vIntensity[m] = Math.min(Math.max(1 - (time - points[i].t) / fade, 0), 1)
    vWidth[m] = widths[i]
    m++
  }
  // Mezi dvěma zaznamenanými body se hrot čáry interpoluje (plynulý pohyb i při 30 fps exportu).
  if (head < n - 1) {
    const a = points[head]
    const b = points[head + 1]
    const f = (time - a.t) / Math.max(b.t - a.t, 1e-6)
    if (f > 0) {
      vx[m] = xs[head] + (xs[head + 1] - xs[head]) * f
      vy[m] = ys[head] + (ys[head + 1] - ys[head]) * f
      vIntensity[m] = 1
      vWidth[m] = widths[head] + (widths[head + 1] - widths[head]) * f
      m++
    }
  }

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (m === 1) {
    if (vIntensity[0] <= 0) return false
    ctx.fillStyle = dimmed(color, vIntensity[0])
    ctx.beginPath()
    ctx.arc(vx[0], vy[0], vWidth[0] / 2, 0, Math.PI * 2)
    ctx.fill()
    return true
  }

  // Křivka se kreslí po kouscích (každý má vlastní intenzitu a tloušťku): kvadratické
  // oblouky mezi středy sousedních úseček, řídicí bod = zaznamenaný bod. Výsledek je hladký.
  let prevX = vx[0]
  let prevY = vy[0]
  for (let j = 1; j < m; j++) {
    const last = j === m - 1
    const endX = last ? vx[j] : (vx[j] + vx[j + 1]) / 2
    const endY = last ? vy[j] : (vy[j] + vy[j + 1]) / 2
    if (vIntensity[j] > 0) {
      ctx.strokeStyle = dimmed(color, vIntensity[j])
      ctx.lineWidth = vWidth[j]
      ctx.beginPath()
      ctx.moveTo(prevX, prevY)
      if (last) ctx.lineTo(endX, endY)
      else ctx.quadraticCurveTo(vx[j], vy[j], endX, endY)
      ctx.stroke()
    }
    prevX = endX
    prevY = endY
  }
  return true
}
