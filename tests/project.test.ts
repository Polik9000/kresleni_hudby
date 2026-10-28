import { describe, expect, it } from 'vitest'
import { DEFAULT_STYLE, parseProject } from '../src/shared/project'

const file = (layers: unknown[], extra: object = {}): string =>
  JSON.stringify({ format: 'kresleni-hudby', version: 3, audio: null, layers, ...extra })

const layer = (over: object = {}): object => ({
  id: 'a', name: 'V', visible: true, style: {}, strokes: [], fireworks: [], ...over
})

describe('odolnost načítání projektu', () => {
  it('neplatný JSON a cizí obsah odmítne výjimkou', () => {
    expect(() => parseProject('{nejde')).toThrow()
    expect(() => parseProject('null')).toThrow()
    expect(() => parseProject('[]')).toThrow()
    expect(() => parseProject('42')).toThrow()
  })

  it('bez vrstev nebo s nesmyslem místo vrstev vytvoří prázdnou vrstvu', () => {
    expect(parseProject(file([])).layers).toHaveLength(1)
    expect(parseProject(file([], { layers: 'x' })).layers).toHaveLength(1)
    expect(parseProject(file([null, 5, 'a'])).layers).toHaveLength(1)
  })

  it('doplní chybějící pole vrstvy', () => {
    const [l] = parseProject(file([{}])).layers
    expect(l.id).toBeTruthy()
    expect(l.name).toBe('Vrstva 1')
    expect(l.visible).toBe(true)
    expect(l.offset).toBe(0)
    expect(l.style).toEqual(DEFAULT_STYLE)
    expect(l.strokes).toEqual([])
    expect(l.fireworks).toEqual([])
  })

  it('zachová zbytek vrstev, když je jedna poškozená, a rozliší shodná id', () => {
    const loaded = parseProject(file([layer({ id: 'x', strokes: [[1, 2, 3]] }), null, layer({ id: 'x' })]))
    expect(loaded.layers).toHaveLength(2)
    expect(loaded.layers[0].strokes).toHaveLength(1)
    expect(loaded.layers[0].id).not.toBe(loaded.layers[1].id)
  })

  it('styl s hodnotami špatného typu nahradí výchozími', () => {
    const [l] = parseProject(file([layer({ style: { width: 'tlusty', glow: null, lineColor: 7, widthMode: 'x', fadeSeconds: 2 } })])).layers
    expect(l.style.width).toBe(DEFAULT_STYLE.width)
    expect(l.style.glow).toBe(DEFAULT_STYLE.glow)
    expect(l.style.lineColor).toBe(DEFAULT_STYLE.lineColor)
    expect(l.style.widthMode).toBe(DEFAULT_STYLE.widthMode)
    expect(l.style.fadeSeconds).toBe(2)
  })

  it('body s NaN nebo textem vynechá, ostatní zůstanou', () => {
    const flat = [1, 2, 0, 'a', 2, 0.1, 3, null, 0.2, 4, 5, 0.3]
    const [l] = parseProject(file([layer({ strokes: [flat] })])).layers
    expect(l.strokes[0].points).toEqual([{ x: 1, y: 2, t: 0 }, { x: 4, y: 5, t: 0.3 }])
  })

  it('prázdný tah a tah bez platných bodů zahodí', () => {
    const [l] = parseProject(file([layer({ strokes: [[], [1, 2], 'x', null, ['a', 'b', 'c'], [1, 2, 3]] })])).layers
    expect(l.strokes).toHaveLength(1)
  })

  it('lichou délku plochého pole ořízne na celé trojice', () => {
    const [l] = parseProject(file([layer({ strokes: [[1, 2, 3, 4, 5, 6, 7, 8]] })])).layers
    expect(l.strokes[0].points).toHaveLength(2)
  })

  it('křivku, která po vyřazení bodů nesedí, zahodí a tah nechá obyčejný', () => {
    const curve = { nodes: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1], params: [0, 1] }
    const ok = parseProject(file([layer({ strokes: [[0, 0, 0, 1, 1, 1]], curves: { 0: curve } })])).layers[0]
    expect(ok.strokes[0].curve).toBeDefined()
    const bad = parseProject(file([layer({ strokes: [[0, 0, 0, 'x', 1, 1]], curves: { 0: curve } })])).layers[0]
    expect(bad.strokes[0].curve).toBeUndefined()
  })

  it('ohňostroj bez seedu dostane stálý seed, poškozený zahodí', () => {
    const json = file([layer({ fireworks: [[100, 200, 1.5], [1, 2], 'x', [NaN, 1, 1, 1], [5, 5, 'a', 3], [10, 20, 2, 99]] })])
    const fws = parseProject(json).layers[0].fireworks
    expect(fws).toHaveLength(2)
    expect(Number.isInteger(fws[0].seed)).toBe(true)
    expect(fws[0].seed).toBeGreaterThanOrEqual(0)
    expect(parseProject(json).layers[0].fireworks[0].seed).toBe(fws[0].seed)
    expect(fws[1]).toEqual({ x: 10, y: 20, t: 2, seed: 99 })
  })

  it('nesmyslná cesta k audiu a nastavení exportu spadnou na výchozí', () => {
    const loaded = parseProject(file([], { audio: { path: 5 }, export: 'x' }))
    expect(loaded.audioPath).toBeNull()
    expect(loaded.exportSettings.fps).toBe(30)
  })
})
