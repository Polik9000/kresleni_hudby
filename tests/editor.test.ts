import { beforeEach, describe, expect, it } from 'vitest'
import { createLayer } from '../src/shared/project'
import type { FireworkEvent, Layer, Stroke } from '../src/shared/types'
import { applyCurve, fitCurve } from '../src/renderer/src/curve'
import { Editor, type EditorHost } from '../src/renderer/src/editor'
import type { TimeWindow } from '../src/renderer/src/timeWindow'

/** Dosah kliknutí v logických px, jako v aplikaci při 100% zobrazení. */
const R = 10

/** Stav pro Zpět stejně jako v `main.ts`: pole tahů a ohňostrojů, ne kopie objektů. */
interface Snapshot {
  strokes: Stroke[]
  fireworks: FireworkEvent[]
}

/** Zmrazí prvek do hloubky — jakákoli změna na místě pak v testu vyhodí výjimku. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

/** Přímka bez křivky, 61 bodů od (100, 500) do (700, 500), časy 1–2 s. */
function line(): Stroke {
  return {
    points: Array.from({ length: 61 }, (_, i) => ({ x: 100 + i * 10, y: 500, t: 1 + i / 60 }))
  }
}

/** Vlnovka už převedená na křivku (víc uzlů), časy 1–3 s. */
function wave(): Stroke {
  const points = Array.from({ length: 121 }, (_, i) => ({
    x: 100 + i * 10,
    y: 500 + 150 * Math.sin(i / 10),
    t: 1 + i / 60
  }))
  return applyCurve({ points }, fitCurve(points))
}

const firework = (): FireworkEvent => ({ x: 1500, y: 300, t: 1.5, seed: 12345, density: 0.2 })

let layer: Layer
let time: number
let win: TimeWindow
let undoStack: Snapshot[]
let changes: number
let editor: Editor

beforeEach(() => {
  layer = createLayer('Test')
  layer.style.smoothing = 0
  time = 1.5
  // Výchozí okno jako v aplikaci: zpět doba mizení vrstvy, dopředu 1 s.
  win = { back: layer.style.fadeSeconds, ahead: 1 }
  undoStack = []
  changes = 0
  const host: EditorHost = {
    layer: () => layer,
    time: () => time,
    timeWindow: () => win,
    beginChange: () => undoStack.push({ strokes: layer.strokes.slice(), fireworks: layer.fireworks.slice() }),
    changed: () => changes++,
    selectionChanged: () => {}
  }
  editor = new Editor(host)
})

/** Krok Zpět jako `restore` v `main.ts` — vrstvě se vrátí uložená pole. */
function undo(): void {
  const state = undoStack.pop()!
  layer.strokes = state.strokes
  layer.fireworks = state.fireworks
}

function add(stroke: Stroke): Stroke {
  layer.strokes.push(deepFreeze(stroke))
  return stroke
}

function addFirework(fw: FireworkEvent): FireworkEvent {
  layer.fireworks.push(deepFreeze(fw))
  return fw
}

function click(x: number, y: number, shiftKey = false): void {
  editor.pointerDown({ x, y }, { shiftKey }, R)
  editor.pointerUp()
}

function drag(from: { x: number; y: number }, dx: number, dy: number, alt = false, shiftKey = false): void {
  editor.pointerDown(from, { shiftKey }, R)
  // Víc kroků jako skutečná myš — výsledek se počítá vždy od začátku tažení.
  editor.pointerMove({ x: from.x + dx / 2, y: from.y + dy / 2 }, alt)
  editor.pointerMove({ x: from.x + dx, y: from.y + dy }, alt)
  editor.pointerUp()
}

const shiftedTimes = (stroke: Stroke, shift: number): number[] => stroke.points.map((p) => p.t + shift)

describe('režim úprav — výběr a přesun', () => {
  it('klik čáru jen vybere: data se nezmění a nevznikne krok pro Zpět', () => {
    const original = add(line())
    click(400, 503)
    expect(editor.hasSelection).toBe(true)
    expect(editor.describe()).toBe('Vybrána čára (2 uzlů).')
    // Pohyb pod půl pixelu se nepočítá jako tažení.
    editor.pointerDown({ x: 400, y: 500 }, { shiftKey: false }, R)
    editor.pointerMove({ x: 400.3, y: 500 }, false)
    editor.pointerUp()
    expect(layer.strokes[0]).toBe(original)
    expect(undoStack).toHaveLength(0)
    expect(changes).toBe(0)
  })

  it('klik do prázdna výběr zruší', () => {
    add(line())
    click(400, 500)
    click(400, 800)
    expect(editor.hasSelection).toBe(false)
  })

  it('tažení čáry ji nahradí posunutou kopií, křivku nevytvoří a jde vrátit', () => {
    const original = add(line())
    drag({ x: 400, y: 500 }, 30, -20)
    const moved = layer.strokes[0]
    expect(moved).not.toBe(original)
    expect(moved.curve).toBeUndefined()
    expect(moved.points).toEqual(original.points.map((p) => ({ x: p.x + 30, y: p.y - 20, t: p.t })))
    expect(undoStack).toHaveLength(1)
    expect(changes).toBe(1)
    undo()
    expect(layer.strokes).toEqual([original])
    expect(layer.strokes[0]).toBe(original)
  })

  it('tažení křivky posune body i všechny uzly s táhly', () => {
    const original = add(wave())
    const p = original.points[30]
    drag(p, -15, 40)
    const moved = layer.strokes[0]
    expect(moved).not.toBe(original)
    expect(moved.curve!.nodes).toEqual(
      original.curve!.nodes.map((n) => ({
        x: n.x - 15,
        y: n.y + 40,
        inX: n.inX - 15,
        inY: n.inY + 40,
        outX: n.outX - 15,
        outY: n.outY + 40
      }))
    )
    expect(moved.curve!.params).toEqual(original.curve!.params)
    moved.points.forEach((q, i) => {
      expect(q.x).toBeCloseTo(original.points[i].x - 15, 9)
      expect(q.y).toBeCloseTo(original.points[i].y + 40, 9)
      expect(q.t).toBe(original.points[i].t)
    })
  })

  it('tažení ohňostroje ho nahradí posunutou kopií se stejným seedem a jde vrátit', () => {
    const original = addFirework(firework())
    drag({ x: 1502, y: 298 }, -100, 50)
    expect(editor.describe()).toBe('Vybrán ohňostroj.')
    const moved = layer.fireworks[0]
    expect(moved).not.toBe(original)
    expect(moved).toEqual({ ...original, x: 1400, y: 350 })
    undo()
    expect(layer.fireworks[0]).toBe(original)
  })

  it('ohňostroj mimo čas kolem přehrávací hlavy nejde vybrat', () => {
    addFirework(firework())
    time = 10
    click(1500, 300)
    expect(editor.hasSelection).toBe(false)
  })
})

describe('režim úprav — uzly a táhla', () => {
  it('tažení uzlu převede čáru na křivku; body zůstanou se svými časy', () => {
    const original = add(line())
    click(400, 500)
    // Přímka má dva uzly — na koncích.
    drag({ x: 700, y: 500 }, 0, 100)
    const edited = layer.strokes[0]
    expect(edited).not.toBe(original)
    expect(edited.curve!.nodes).toHaveLength(2)
    expect(edited.curve!.nodes[1]).toMatchObject({ x: 700, y: 600 })
    expect(edited.points.map((p) => p.t)).toEqual(original.points.map((p) => p.t))
    expect(edited.points[0]).toMatchObject({ x: 100, y: 500 })
    expect(edited.points[60].x).toBeCloseTo(700, 9)
    expect(edited.points[60].y).toBeCloseTo(600, 9)
    expect(editor.describe()).toBe('Vybrán uzel 2 z 2.')
    undo()
    expect(layer.strokes[0]).toBe(original)
  })

  it('tažení uzlu křivky posune jen ten uzel s jeho táhly', () => {
    const original = add(wave())
    const nodes = original.curve!.nodes
    expect(nodes.length).toBeGreaterThanOrEqual(4)
    click(nodes[0].x, nodes[0].y)
    drag(nodes[2], 20, -30)
    const edited = layer.strokes[0].curve!.nodes
    expect(edited[2]).toEqual({
      x: nodes[2].x + 20,
      y: nodes[2].y - 30,
      inX: nodes[2].inX + 20,
      inY: nodes[2].inY - 30,
      outX: nodes[2].outX + 20,
      outY: nodes[2].outY - 30
    })
    edited.forEach((n, i) => i !== 2 && expect(n).toEqual(nodes[i]))
    expect(layer.strokes[0].points.map((p) => p.t)).toEqual(original.points.map((p) => p.t))
  })

  it('tažení táhla otočí protější táhlo do protisměru a nechá mu délku', () => {
    const original = add(wave())
    const node = original.curve!.nodes[2]
    click(node.x, node.y)
    click(node.x, node.y)
    expect(editor.describe()).toMatch(/^Vybrán uzel 3 z/)
    drag({ x: node.outX, y: node.outY }, 0, 25)
    const edited = layer.strokes[0].curve!.nodes[2]
    expect(edited.x).toBe(node.x)
    expect(edited.y).toBe(node.y)
    expect(edited.outX).toBeCloseTo(node.outX, 9)
    expect(edited.outY).toBeCloseTo(node.outY + 25, 9)
    const outDir = { x: edited.outX - node.x, y: edited.outY - node.y }
    const inDir = { x: edited.inX - node.x, y: edited.inY - node.y }
    // Protisměr: vektorový součin nulový, skalární záporný.
    expect(outDir.x * inDir.y - outDir.y * inDir.x).toBeCloseTo(0, 6)
    expect(outDir.x * inDir.x + outDir.y * inDir.y).toBeLessThan(0)
    expect(Math.hypot(inDir.x, inDir.y)).toBeCloseTo(Math.hypot(node.inX - node.x, node.inY - node.y), 6)
    expect(layer.strokes[0]).not.toBe(original)
  })

  it('tažení táhla s Alt protější táhlo nechá — v uzlu vznikne roh', () => {
    const original = add(wave())
    const node = original.curve!.nodes[2]
    click(node.x, node.y)
    click(node.x, node.y)
    drag({ x: node.inX, y: node.inY }, -10, 30, true)
    const edited = layer.strokes[0].curve!.nodes[2]
    expect(edited.inX).toBeCloseTo(node.inX - 10, 9)
    expect(edited.inY).toBeCloseTo(node.inY + 30, 9)
    expect(edited.outX).toBe(node.outX)
    expect(edited.outY).toBe(node.outY)
    undo()
    expect(layer.strokes[0]).toBe(original)
  })
})

describe('režim úprav — schránka', () => {
  it('kopie čáry se vloží na místo přehrávací hlavy jako nezávislý tah a jde vrátit', () => {
    const original = add(wave())
    click(original.points[30].x, original.points[30].y)
    expect(editor.copy()).toBe(true)
    expect(editor.hasClipboard).toBe(true)
    time = 5
    expect(editor.paste()).toBe(true)
    expect(layer.strokes).toHaveLength(2)
    const pasted = layer.strokes[1]
    expect(pasted).not.toBe(original)
    expect(pasted.points.map((p) => [p.x, p.y])).toEqual(original.points.map((p) => [p.x, p.y]))
    pasted.points.forEach((p, i) => expect(p.t).toBeCloseTo(shiftedTimes(original, 4)[i], 9))
    expect(pasted.curve).toEqual(original.curve)
    expect(pasted.curve!.nodes[0]).not.toBe(original.curve!.nodes[0])
    // Vložený tah je hned vybraný.
    expect(editor.selectedStart()).toBeCloseTo(5, 9)
    // Druhé vložení dá další samostatný objekt.
    time = 8
    editor.paste()
    expect(layer.strokes).toHaveLength(3)
    expect(layer.strokes[2].points[0].t).toBeCloseTo(8, 9)
    expect(layer.strokes[2].points).not.toBe(pasted.points)
    undo()
    undo()
    expect(layer.strokes).toEqual([original])
  })

  it('úsek mezi dvěma uzly (Shift+klik) se zkopíruje sám, od nuly v čase', () => {
    const original = add(wave())
    const { nodes, params } = original.curve!
    click(nodes[0].x, nodes[0].y)
    click(nodes[1].x, nodes[1].y)
    click(nodes[3].x, nodes[3].y, true)
    expect(editor.describe()).toBe(`Vybrán úsek čáry mezi uzly 2 a 4 z ${nodes.length}.`)
    // Shift+klik nic netáhne ani nemění.
    expect(undoStack).toHaveLength(0)
    expect(layer.strokes[0]).toBe(original)

    editor.copy()
    time = 6
    editor.paste()
    const pasted = layer.strokes[1]
    const inRange = original.points.filter((_, i) => params[i] >= 1 - 1e-9 && params[i] <= 3 + 1e-9)
    expect(pasted.points.map((p) => [p.x, p.y])).toEqual(inRange.map((p) => [p.x, p.y]))
    expect(pasted.points[0].t).toBeCloseTo(6, 9)
    pasted.points.forEach((p, i) => expect(p.t - pasted.points[0].t).toBeCloseTo(inRange[i].t - inRange[0].t, 9))
    expect(pasted.curve!.nodes).toEqual(nodes.slice(1, 4))
    expect(pasted.curve!.params[0]).toBe(0)
    expect(pasted.curve!.params[pasted.curve!.params.length - 1]).toBeCloseTo(2, 9)
    expect(layer.strokes[0]).toBe(original)
  })

  it('Shift+klik na týž uzel výběr úseku zruší', () => {
    const original = add(wave())
    const { nodes } = original.curve!
    click(nodes[0].x, nodes[0].y)
    click(nodes[1].x, nodes[1].y)
    click(nodes[3].x, nodes[3].y, true)
    click(nodes[1].x, nodes[1].y, true)
    expect(editor.describe()).toBe(`Vybrán uzel 2 z ${nodes.length}.`)
  })

  it('ohňostroj se vloží na místo přehrávací hlavy se stejným seedem a hustotou', () => {
    const original = addFirework(firework())
    click(1500, 300)
    editor.copy()
    time = 7
    editor.paste()
    expect(layer.fireworks).toEqual([original, { ...original, t: 7 }])
    expect(layer.fireworks[1]).not.toBe(original)
    expect(editor.selectedStart()).toBe(7)
    undo()
    expect(layer.fireworks).toEqual([original])
  })

  it('bez výběru se nic nezkopíruje a prázdná schránka nic nevloží', () => {
    add(line())
    expect(editor.copy()).toBe(false)
    expect(editor.paste()).toBe(false)
    expect(undoStack).toHaveLength(0)
  })
})

describe('režim úprav — posun v čase a mazání', () => {
  it('„Začátek (s)“ posune všechny body čáry, polohy nechá', () => {
    const original = add(wave())
    click(original.points[30].x, original.points[30].y)
    expect(editor.selectedStart()).toBe(1)
    editor.setSelectedStart(3.5)
    const shifted = layer.strokes[0]
    expect(shifted).not.toBe(original)
    expect(shifted.curve).toBe(original.curve)
    shifted.points.forEach((p, i) => {
      expect(p.t).toBeCloseTo(original.points[i].t + 2.5, 9)
      expect([p.x, p.y]).toEqual([original.points[i].x, original.points[i].y])
    })
    expect(editor.selectedStart()).toBeCloseTo(3.5, 9)
    undo()
    expect(layer.strokes[0]).toBe(original)
  })

  it('„Začátek (s)“ posune ohňostroj; stejná hodnota nic nezmění', () => {
    const original = addFirework(firework())
    click(1500, 300)
    editor.setSelectedStart(1.5)
    expect(undoStack).toHaveLength(0)
    editor.setSelectedStart(-0.5)
    expect(layer.fireworks[0]).toEqual({ ...original, t: -0.5 })
    expect(layer.fireworks[0]).not.toBe(original)
    undo()
    expect(layer.fireworks[0]).toBe(original)
  })

  it('Delete smaže vybranou čáru i ohňostroj a Zpět je vrátí', () => {
    const keep = add({ points: [{ x: 100, y: 900, t: 1 }, { x: 600, y: 900, t: 2 }] })
    const stroke = add(line())
    const fw = addFirework(firework())
    click(400, 500)
    editor.deleteSelected()
    expect(layer.strokes).toEqual([keep])
    expect(editor.hasSelection).toBe(false)
    click(1500, 300)
    editor.deleteSelected()
    expect(layer.fireworks).toEqual([])
    undo()
    expect(layer.fireworks).toEqual([fw])
    undo()
    expect(layer.strokes).toEqual([keep, stroke])
    expect(layer.strokes[1]).toBe(stroke)
  })

  it('po kroku Zpět se zaniklý výběr zahodí — Delete pak nesmaže jiný prvek', () => {
    const first = add(line())
    const second = add({ points: [{ x: 100, y: 900, t: 1 }, { x: 600, y: 900, t: 2 }] })
    drag({ x: 400, y: 500 }, 0, 50)
    undo()
    // Výběr ukazuje na posunutou kopii, která už ve vrstvě není.
    editor.deleteSelected()
    expect(layer.strokes).toEqual([first, second])
    editor.setSelectedStart(4)
    expect(layer.strokes).toEqual([first, second])
    expect(editor.copy()).toBe(false)
  })
})

describe('režim úprav — časové okno', () => {
  // Přímka je mezi x = 100 a 700 v čase 1–2 s; okno 1,29–1,71 s z ní nechá x ≈ 280–520.
  const narrow = (): void => {
    win = { back: 0.21, ahead: 0.21 }
  }

  it('klik na část čáry mimo okno nic nevybere, na část v okně ano', () => {
    add(line())
    narrow()
    click(150, 500)
    expect(editor.hasSelection).toBe(false)
    click(650, 500)
    expect(editor.hasSelection).toBe(false)
    click(400, 500)
    expect(editor.describe()).toBe('Vybrána čára (2 uzlů).')
  })

  it('uzel mimo okno nejde chytit ani táhnout', () => {
    const original = add(line())
    narrow()
    click(400, 500)
    // Uzel 1 leží na začátku čáry (1 s), tedy mimo okno: klik tam výběr zruší a tažení nic nezmění.
    drag({ x: 100, y: 500 }, 0, 40)
    expect(editor.hasSelection).toBe(false)
    expect(layer.strokes[0]).toBe(original)
    expect(undoStack).toHaveLength(0)
    // Se širokým oknem jde týž uzel chytit.
    win = { back: 5, ahead: 1 }
    click(400, 500)
    click(100, 500)
    expect(editor.describe()).toBe('Vybrán uzel 1 z 2.')
  })

  it('táhlo uzlu mimo okno nejde chytit', () => {
    const original = add(wave())
    const node = original.curve!.nodes[2]
    click(node.x, node.y)
    click(node.x, node.y)
    expect(editor.describe()).toMatch(/^Vybrán uzel 3 z/)
    // Okno posunuté za konec vlnovky (1–3 s): uzel i jeho táhla zmizí.
    time = 4
    win = { back: 0.5, ahead: 1 }
    drag({ x: node.outX, y: node.outY }, 0, 25)
    expect(layer.strokes[0]).toBe(original)
    expect(undoStack).toHaveLength(0)
  })

  it('vybraná čára mimo okno zůstává vybraná — Delete i Ctrl+C fungují', () => {
    const stroke = add(line())
    click(400, 500)
    time = 10
    expect(editor.hasSelection).toBe(true)
    expect(editor.describe()).toBe('Vybrána čára (2 uzlů).')
    expect(editor.copy()).toBe(true)
    editor.deleteSelected()
    expect(layer.strokes).toEqual([])
    undo()
    expect(layer.strokes).toEqual([stroke])
  })

  it('ohňostroj jde vybrat, jen když jeho čas leží v okně', () => {
    addFirework(firework())
    time = 2
    win = { back: 0.4, ahead: 1 }
    click(1500, 300)
    expect(editor.hasSelection).toBe(false)
    win = { back: 0.5, ahead: 1 }
    click(1500, 300)
    expect(editor.describe()).toBe('Vybrán ohňostroj.')
  })
})
