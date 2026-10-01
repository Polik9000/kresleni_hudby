import { describe, expect, it } from 'vitest'
import { createProject, parseProject, projectContentEnd, serializeProject } from '../src/shared/project'
import type { Stroke } from '../src/shared/types'
import { mulberry32 } from '../src/renderer/src/render/fireworks'
import { lastIndexAtOrBefore, smoothedPositions, strokeWidths } from '../src/renderer/src/render/stroke'

describe('projektový soubor', () => {
  it('uložení a načtení zachová vrstvu, tahy, ohňostroje i nastavení', () => {
    const project = createProject()
    project.audioPath = 'C:\\hudba\\skladba.mp3'
    const layer = project.layers[0]
    layer.name = 'Housle'
    layer.style.lineColor = '#ff0000'
    layer.style.widthMode = 'dynamic'
    layer.style.fadeSeconds = 7.5
    layer.strokes.push({ points: [{ x: 10.5, y: 20, t: 1.25 }, { x: 300, y: 400.4, t: 1.5 }] })
    layer.fireworks.push({ x: 960, y: 540, t: 3.2, seed: 4000000000 })

    const loaded = parseProject(serializeProject(project))
    expect(loaded).toEqual(project)
  })

  it('odmítne cizí soubor a novější verzi formátu', () => {
    expect(() => parseProject('{"format":"neco-jineho","version":1}')).toThrow()
    expect(() => parseProject('{"format":"kresleni-hudby","version":99}')).toThrow()
  })

  it('doplní výchozí hodnoty stylu chybějící ve starším souboru', () => {
    const json = JSON.stringify({
      format: 'kresleni-hudby',
      version: 1,
      audio: null,
      layers: [{ id: 'a', name: 'A', visible: true, style: { lineColor: '#123456' }, strokes: [], fireworks: [] }]
    })
    const { style } = parseProject(json).layers[0]
    expect(style.lineColor).toBe('#123456')
    expect(style.fadeSeconds).toBe(5)
  })

  it('konec obsahu zahrnuje dobu mizení poslední stopy', () => {
    const project = createProject()
    project.layers[0].strokes.push({ points: [{ x: 0, y: 0, t: 10 }, { x: 5, y: 5, t: 12 }] })
    expect(projectContentEnd(project)).toBe(17)
  })
})

describe('vykreslování tahu', () => {
  const stroke: Stroke = {
    points: [0, 1, 2, 3, 4].map((i) => ({ x: i * 10, y: 0, t: i * 0.5 }))
  }

  it('najde poslední bod před daným časem', () => {
    expect(lastIndexAtOrBefore(stroke.points, -1)).toBe(-1)
    expect(lastIndexAtOrBefore(stroke.points, 0)).toBe(0)
    expect(lastIndexAtOrBefore(stroke.points, 1.2)).toBe(2)
    expect(lastIndexAtOrBefore(stroke.points, 99)).toBe(4)
  })

  it('fixní režim dává všude stejnou tloušťku', () => {
    const style = { ...createProject().layers[0].style, width: 12 }
    expect(strokeWidths(stroke, style)).toEqual([12, 12, 12, 12, 12])
  })

  it('dynamický režim: rychlý pohyb je tenčí než pomalý', () => {
    const style = { ...createProject().layers[0].style, widthMode: 'dynamic' as const, width: 20 }
    const make = (pxPerSecond: number): Stroke => ({
      points: Array.from({ length: 60 }, (_, i) => ({ x: (i * pxPerSecond) / 100, y: 0, t: i / 100 }))
    })
    const slow = strokeWidths(make(50), style).at(-1)!
    const fast = strokeWidths(make(4000), style).at(-1)!
    expect(slow).toBeGreaterThan(18)
    expect(fast).toBeLessThan(6)
    expect(fast).toBeGreaterThan(0)
  })

  it('tloušťky se při nahrávání doplňují o nové body', () => {
    const style = { ...createProject().layers[0].style, widthMode: 'dynamic' as const }
    const growing: Stroke = { points: [{ x: 0, y: 0, t: 0 }] }
    expect(strokeWidths(growing, style)).toHaveLength(1)
    growing.points.push({ x: 50, y: 0, t: 0.01 })
    expect(strokeWidths(growing, style)).toHaveLength(2)
  })
})

describe('vyhlazení čáry', () => {
  // Vodorovný tah s roztřesením ±6 px ve svislém směru.
  const jagged = (count: number): Stroke => ({
    points: Array.from({ length: count }, (_, i) => ({ x: i * 4, y: 500 + (i % 2 === 0 ? 6 : -6), t: i * 0.008 }))
  })
  const roughness = (ys: number[]): number => Math.max(...ys.slice(20, -20).map((y) => Math.abs(y - 500)))

  it('odstraní roztřesení, ale konce tahu nechá na místě', () => {
    const stroke = jagged(200)
    const { xs, ys } = smoothedPositions(stroke, 0.5)
    expect(roughness(ys)).toBeLessThan(1)
    expect([xs[0], ys[0]]).toEqual([stroke.points[0].x, stroke.points[0].y])
    expect([xs[199], ys[199]]).toEqual([stroke.points[199].x, stroke.points[199].y])
  })

  it('nulové vyhlazení vrací přesně zaznamenané body', () => {
    const stroke = jagged(50)
    const { xs, ys } = smoothedPositions(stroke, 0)
    expect(xs).toEqual(stroke.points.map((p) => p.x))
    expect(ys).toEqual(stroke.points.map((p) => p.y))
  })

  it('postupné doplňování při nahrávání dá stejný výsledek jako výpočet najednou', () => {
    const full = jagged(120)
    const growing: Stroke = { points: [] }
    for (const p of full.points) {
      growing.points.push(p)
      smoothedPositions(growing, 0.7)
    }
    const expected = smoothedPositions(full, 0.7)
    const actual = smoothedPositions(growing, 0.7)
    actual.ys.forEach((y, i) => expect(y).toBeCloseTo(expected.ys[i], 9))
    actual.xs.forEach((x, i) => expect(x).toBeCloseTo(expected.xs[i], 9))
  })
})

describe('ohňostroj', () => {
  it('stejný seed dává stejnou posloupnost (náhled = export)', () => {
    const a = mulberry32(12345)
    const b = mulberry32(12345)
    const first = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(first)
    expect(first.every((v) => v >= 0 && v < 1)).toBe(true)
    expect(mulberry32(54321)()).not.toBe(first[0])
  })
})
