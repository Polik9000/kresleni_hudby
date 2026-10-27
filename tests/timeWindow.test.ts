import { describe, expect, it } from 'vitest'
import type { StrokePoint } from '../src/shared/types'
import { applyCurve, fitCurve, nodeTimes } from '../src/renderer/src/curve'
import { inWindow, strokeWindow } from '../src/renderer/src/timeWindow'

/** 61 bodů s časy 1–2 s (krok 1/60 s). */
const points: StrokePoint[] = Array.from({ length: 61 }, (_, i) => ({ x: 100 + i * 10, y: 500, t: 1 + i / 60 }))

describe('časové okno — výřez tahu', () => {
  it('tah celý v okně vrátí všechny body', () => {
    expect(strokeWindow(points, 0, 1.5, { back: 5, ahead: 1 })).toEqual({ from: 0, to: 60 })
  })

  it('tah částečně v okně vrátí jen souvislý úsek bodů v okně', () => {
    // Okno 1,29–1,71 s: body 18 (1,30 s) až 42 (1,70 s).
    expect(strokeWindow(points, 0, 1.5, { back: 0.21, ahead: 0.21 })).toEqual({ from: 18, to: 42 })
    // Okno zasahuje jen do začátku tahu.
    expect(strokeWindow(points, 0, 0.5, { back: 0, ahead: 0.6 })).toEqual({ from: 0, to: 6 })
  })

  it('body přesně na okrajích okna do něj patří', () => {
    const coarse = [0, 1, 2, 3].map((t) => ({ x: t, y: 0, t }))
    expect(strokeWindow(coarse, 0, 2, { back: 1, ahead: 0 })).toEqual({ from: 1, to: 2 })
  })

  it('tah mimo okno (před ním, za ním i s oknem mezi dvěma body) vrátí null', () => {
    expect(strokeWindow(points, 0, 10, { back: 5, ahead: 1 })).toBeNull()
    expect(strokeWindow(points, 0, -1, { back: 5, ahead: 1 })).toBeNull()
    const sparse = [
      { x: 0, y: 0, t: 0 },
      { x: 10, y: 0, t: 3 }
    ]
    expect(strokeWindow(sparse, 0, 1.5, { back: 0.5, ahead: 0.5 })).toBeNull()
  })

  it('posun vrstvy (offset) se k časům bodů přičte', () => {
    const win = { back: 0.21, ahead: 0.21 }
    // Vrstva posunutá o 2 s: tah hraje v čase skladby 3–4 s.
    expect(strokeWindow(points, 2, 3.5, win)).toEqual(strokeWindow(points, 0, 1.5, win))
    expect(strokeWindow(points, 2, 1.5, { back: 5, ahead: 1 })).toBeNull()
    // Záporný posun: tah hraje v čase 0–1 s.
    expect(strokeWindow(points, -1, 0.5, { back: 5, ahead: 1 })).toEqual({ from: 0, to: 60 })
    expect(strokeWindow(points, -1, 3, { back: 1.5, ahead: 1 })).toBeNull()
  })

  it('ohňostroj (jeden čas) je v okně podle stejného pravidla', () => {
    expect(inWindow(1.5, 0, 2, { back: 0.5, ahead: 1 })).toBe(true)
    expect(inWindow(1.5, 0, 2, { back: 0.4, ahead: 1 })).toBe(false)
    expect(inWindow(1.5, 0, 0.5, { back: 0, ahead: 1 })).toBe(true)
    expect(inWindow(1.5, 2, 2, { back: 0.5, ahead: 1 })).toBe(false)
    expect(inWindow(1.5, 2, 3, { back: 0.5, ahead: 1 })).toBe(true)
  })
})

describe('časy uzlů křivky', () => {
  it('přímka má uzly na začátku a na konci tahu', () => {
    expect(nodeTimes({ points }, fitCurve(points))).toEqual([1, 2])
  })

  it('každý uzel vlnovky má čas bodu, na kterém leží', () => {
    const wavePoints = Array.from({ length: 121 }, (_, i) => ({
      x: 100 + i * 10,
      y: 500 + 150 * Math.sin(i / 10),
      t: 1 + i / 60
    }))
    const stroke = applyCurve({ points: wavePoints }, fitCurve(wavePoints))
    const curve = stroke.curve!
    const times = nodeTimes(stroke, curve)
    expect(times).toHaveLength(curve.nodes.length)
    expect(curve.nodes.length).toBeGreaterThan(2)
    times.forEach((t, i) => {
      const j = stroke.points.findIndex((p) => p.t === t)
      expect(curve.params[j]).toBeCloseTo(i, 9)
      expect(stroke.points[j].x).toBeCloseTo(curve.nodes[i].x, 6)
      expect(stroke.points[j].y).toBeCloseTo(curve.nodes[i].y, 6)
    })
  })
})
