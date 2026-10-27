import type { CurveNode, Stroke, StrokeCurve } from '../../shared/types'

/**
 * Tah jako editovatelná křivka: nahrané body se proloží kubickými Bézierovými oblouky
 * (Schneiderův algoritmus) a každý bod si zapamatuje, kde na křivce leží (`params`).
 * Po úpravě uzlů se body dopočítají znovu na stejných místech křivky, takže časování
 * kreslení zůstává přesně takové, jak bylo nahráno.
 */

interface P {
  x: number
  y: number
}
type Bezier = [P, P, P, P]

/** Největší povolená odchylka křivky od nahraných bodů (logické px). */
const FIT_TOLERANCE = 3
const REFIT_ITERATIONS = 4

const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y })
const add = (a: P, b: P): P => ({ x: a.x + b.x, y: a.y + b.y })
const mul = (a: P, k: number): P => ({ x: a.x * k, y: a.y * k })
const dot = (a: P, b: P): number => a.x * b.x + a.y * b.y
const length = (a: P): number => Math.hypot(a.x, a.y)

function bezierAt(b: Bezier, u: number): P {
  const v = 1 - u
  const b0 = v * v * v
  const b1 = 3 * u * v * v
  const b2 = 3 * u * u * v
  const b3 = u * u * u
  return {
    x: b0 * b[0].x + b1 * b[1].x + b2 * b[2].x + b3 * b[3].x,
    y: b0 * b[0].y + b1 * b[1].y + b2 * b[2].y + b3 * b[3].y
  }
}

const makeNode = (at: P, handleIn: P, handleOut: P): CurveNode => ({
  x: at.x,
  y: at.y,
  inX: handleIn.x,
  inY: handleIn.y,
  outX: handleOut.x,
  outY: handleOut.y
})

/** Proloží body křivkou. Uzly leží vždy přesně na některém z bodů. */
export function fitCurve(points: P[], tolerance = FIT_TOLERANCE): StrokeCurve {
  const n = points.length
  if (n === 0) return { nodes: [], params: [] }
  if (n === 1) return { nodes: [makeNode(points[0], points[0], points[0])], params: [0] }

  const errorSq = tolerance * tolerance
  const segments: { bezier: Bezier; first: number; us: number[] }[] = []

  /** Směr od bodu `at` k nejbližšímu dalšímu bodu, který s ním nesplývá. */
  const tangent = (at: number, step: number, stop: number): P => {
    for (let i = at + step; step > 0 ? i <= stop : i >= stop; i += step) {
      const d = sub(points[i], points[at])
      const len = length(d)
      if (len > 1e-6) return mul(d, 1 / len)
    }
    return { x: step, y: 0 }
  }

  const chordParams = (first: number, last: number): number[] => {
    const us = [0]
    for (let i = first + 1; i <= last; i++) us.push(us[us.length - 1] + length(sub(points[i], points[i - 1])))
    const total = us[us.length - 1]
    return us.map((u, j) => (total > 1e-9 ? u / total : j / (last - first)))
  }

  /** Nejlepší oblouk (metoda nejmenších čtverců) pro dané parametry bodů a směry na koncích. */
  const generate = (first: number, last: number, us: number[], t1: P, t2: P): Bezier => {
    const p0 = points[first]
    const p3 = points[last]
    let c00 = 0
    let c01 = 0
    let c11 = 0
    let x0 = 0
    let x1 = 0
    for (let i = first; i <= last; i++) {
      const u = us[i - first]
      const v = 1 - u
      const a0 = mul(t1, 3 * u * v * v)
      const a1 = mul(t2, 3 * u * u * v)
      c00 += dot(a0, a0)
      c01 += dot(a0, a1)
      c11 += dot(a1, a1)
      const ends = add(mul(p0, v * v * v + 3 * u * v * v), mul(p3, 3 * u * u * v + u * u * u))
      const rest = sub(points[i], ends)
      x0 += dot(a0, rest)
      x1 += dot(a1, rest)
    }
    const det = c00 * c11 - c01 * c01
    let alpha1 = Math.abs(det) < 1e-12 ? 0 : (x0 * c11 - x1 * c01) / det
    let alpha2 = Math.abs(det) < 1e-12 ? 0 : (c00 * x1 - c01 * x0) / det
    const chord = length(sub(p3, p0))
    // Nesmyslné (záporné, nulové) délky táhel nahradí bezpečná třetina tětivy.
    if (alpha1 < 1e-6 * chord || alpha2 < 1e-6 * chord) alpha1 = alpha2 = chord / 3
    return [p0, add(p0, mul(t1, alpha1)), add(p3, mul(t2, alpha2)), p3]
  }

  const maxError = (first: number, last: number, bezier: Bezier, us: number[]): { error: number; split: number } => {
    let error = 0
    let split = (first + last) >> 1
    for (let i = first + 1; i < last; i++) {
      const d = sub(bezierAt(bezier, us[i - first]), points[i])
      const distSq = dot(d, d)
      if (distSq > error) {
        error = distSq
        split = i
      }
    }
    return { error, split }
  }

  /** Jeden krok Newtonovy metody: posune parametr každého bodu blíž k jeho průmětu na oblouk. */
  const reparameterize = (first: number, last: number, bezier: Bezier, us: number[]): number[] =>
    us.map((u, j) => {
      if (j === 0 || j === last - first) return u
      const v = 1 - u
      const [p0, p1, p2, p3] = bezier
      const d1 = add(
        add(mul(sub(p1, p0), 3 * v * v), mul(sub(p2, p1), 6 * v * u)),
        mul(sub(p3, p2), 3 * u * u)
      )
      const d2 = add(
        mul(add(sub(p2, mul(p1, 2)), p0), 6 * v),
        mul(add(sub(p3, mul(p2, 2)), p1), 6 * u)
      )
      const diff = sub(bezierAt(bezier, u), points[first + j])
      const denominator = dot(d1, d1) + dot(diff, d2)
      if (Math.abs(denominator) < 1e-12) return u
      return Math.min(Math.max(u - dot(diff, d1) / denominator, 0), 1)
    })

  const fit = (first: number, last: number, t1: P, t2: P): void => {
    if (last - first === 1) {
      const third = length(sub(points[last], points[first])) / 3
      const bezier: Bezier = [
        points[first],
        add(points[first], mul(t1, third)),
        add(points[last], mul(t2, third)),
        points[last]
      ]
      segments.push({ bezier, first, us: [0, 1] })
      return
    }
    let us = chordParams(first, last)
    let bezier = generate(first, last, us, t1, t2)
    let { error, split } = maxError(first, last, bezier, us)
    // Skoro vyhovující oblouk se zkusí doladit, než se úsek rozdělí.
    for (let i = 0; i < REFIT_ITERATIONS && error >= errorSq && error < errorSq * 16; i++) {
      us = reparameterize(first, last, bezier, us)
      bezier = generate(first, last, us, t1, t2)
      ;({ error, split } = maxError(first, last, bezier, us))
    }
    if (error < errorSq) {
      segments.push({ bezier, first, us })
      return
    }
    // Rozdělit v nejhorším bodě; oba oblouky tam mají společnou tečnu, takže napojení je hladké.
    let center = sub(points[split - 1], points[split + 1])
    const centerLength = length(center)
    center = centerLength > 1e-6 ? mul(center, 1 / centerLength) : tangent(split, -1, first)
    fit(first, split, t1, center)
    fit(split, last, mul(center, -1), t2)
  }

  fit(0, n - 1, tangent(0, 1, n - 1), tangent(n - 1, -1, 0))

  const nodes = segments.map((s, k) =>
    makeNode(s.bezier[0], k === 0 ? s.bezier[0] : segments[k - 1].bezier[2], s.bezier[1])
  )
  const lastBezier = segments[segments.length - 1].bezier
  nodes.push(makeNode(lastBezier[3], lastBezier[2], lastBezier[3]))
  const params = new Array<number>(n)
  segments.forEach((s, k) => s.us.forEach((u, j) => (params[s.first + j] = k + u)))
  return { nodes, params }
}

/** Bod křivky pro parametr „číslo oblouku + poloha v něm 0–1“. */
export function curvePoint(curve: StrokeCurve, param: number): P {
  const { nodes } = curve
  if (nodes.length < 2) return { x: nodes[0].x, y: nodes[0].y }
  const segment = Math.min(Math.max(Math.floor(param), 0), nodes.length - 2)
  const a = nodes[segment]
  const b = nodes[segment + 1]
  return bezierAt([a, { x: a.outX, y: a.outY }, { x: b.inX, y: b.inY }, b], param - segment)
}

/**
 * Čas každého uzlu: čas prvního bodu, který na křivce leží v uzlu nebo za ním. Uzel `i` je
 * na parametru `i` a parametry bodů neklesají.
 */
export function nodeTimes(stroke: Stroke, curve: StrokeCurve): number[] {
  const { points } = stroke
  const times: number[] = []
  let j = 0
  for (let i = 0; i < curve.nodes.length; i++) {
    while (j < points.length - 1 && curve.params[j] < i - 1e-9) j++
    times.push(points[j].t)
  }
  return times
}

/** Nový tah s body dopočítanými z křivky; časy bodů zůstávají. */
export function applyCurve(stroke: Stroke, curve: StrokeCurve): Stroke {
  return {
    points: stroke.points.map((p, i) => ({ ...curvePoint(curve, curve.params[i]), t: p.t })),
    curve
  }
}

const shiftNode = (node: CurveNode, dx: number, dy: number): CurveNode => ({
  x: node.x + dx,
  y: node.y + dy,
  inX: node.inX + dx,
  inY: node.inY + dy,
  outX: node.outX + dx,
  outY: node.outY + dy
})

/** Posune uzel i s jeho táhly. */
export function moveNode(curve: StrokeCurve, index: number, dx: number, dy: number): StrokeCurve {
  return { ...curve, nodes: curve.nodes.map((node, i) => (i === index ? shiftNode(node, dx, dy) : node)) }
}

export function translateCurve(curve: StrokeCurve, dx: number, dy: number): StrokeCurve {
  return { ...curve, nodes: curve.nodes.map((node) => shiftNode(node, dx, dy)) }
}

/**
 * Přesune jedno táhlo uzlu. `mirror`: protější táhlo se natočí do protisměru (hladký průchod
 * uzlem) a svou délku si nechá; bez něj vznikne v uzlu roh.
 */
export function moveHandle(
  curve: StrokeCurve,
  index: number,
  which: 'in' | 'out',
  x: number,
  y: number,
  mirror: boolean
): StrokeCurve {
  const node = { ...curve.nodes[index] }
  if (which === 'in') [node.inX, node.inY] = [x, y]
  else [node.outX, node.outY] = [x, y]
  const reach = Math.hypot(x - node.x, y - node.y)
  if (mirror && reach > 1e-6) {
    const ux = (x - node.x) / reach
    const uy = (y - node.y) / reach
    if (which === 'in') {
      const opposite = Math.hypot(node.outX - node.x, node.outY - node.y)
      ;[node.outX, node.outY] = [node.x - ux * opposite, node.y - uy * opposite]
    } else {
      const opposite = Math.hypot(node.inX - node.x, node.inY - node.y)
      ;[node.inX, node.inY] = [node.x - ux * opposite, node.y - uy * opposite]
    }
  }
  return { ...curve, nodes: curve.nodes.map((n, i) => (i === index ? node : n)) }
}

/**
 * Část tahu mezi uzly `from` a `to` (včetně) jako samostatný tah. `keepCurve` = výsledek je
 * opět křivka; jinak jen výřez bodů (pro tah, který ještě převedený není).
 */
export function sliceStroke(stroke: Stroke, curve: StrokeCurve, from: number, to: number, keepCurve: boolean): Stroke {
  const points: Stroke['points'] = []
  const params: number[] = []
  stroke.points.forEach((p, i) => {
    const param = curve.params[i]
    if (param < from - 1e-9 || param > to + 1e-9) return
    points.push({ ...p })
    params.push(Math.min(Math.max(param - from, 0), to - from))
  })
  if (!keepCurve) return { points }
  return { points, curve: { nodes: curve.nodes.slice(from, to + 1).map((node) => ({ ...node })), params } }
}
