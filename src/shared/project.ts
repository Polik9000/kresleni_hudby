import {
  EXPORT_FORMATS,
  EXPORT_FPS,
  EXPORT_RESOLUTIONS,
  type ExportSettings,
  type FireworkEvent,
  type Layer,
  type LayerStyle,
  type Project,
  type Stroke,
  type StrokeCurve,
  type StrokePoint
} from './types'

export const PROJECT_FORMAT = 'kresleni-hudby'
/**
 * Verze 2: posun vrstvy v čase (`offset`) a formát exportu. Verze 3: křivky tahů (`curves`).
 * Starší soubory se načtou s výchozími hodnotami.
 */
export const PROJECT_VERSION = 3
export const PROJECT_EXTENSION = 'khproj'

export const DEFAULT_STYLE: LayerStyle = {
  lineColor: '#4db8ff',
  fireworkColor: '#ffc24d',
  widthMode: 'fixed',
  width: 8,
  smoothing: 0.5,
  fadeSeconds: 5,
  glow: 0.6,
  fireworkSize: 1
}

export const DEFAULT_EXPORT: ExportSettings = { width: 1920, height: 1080, fps: 30, format: 'mp4-h264' }

/** Barvy čáry pro nově přidávané vrstvy, aby se od sebe na první pohled lišily. */
export const LAYER_COLORS = ['#4db8ff', '#ff5c8a', '#7dff8a', '#ffc24d', '#b68cff', '#4dffe1']

export function createLayer(name: string): Layer {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name,
    visible: true,
    offset: 0,
    style: { ...DEFAULT_STYLE },
    strokes: [],
    fireworks: []
  }
}

export function createProject(): Project {
  return { audioPath: null, layers: [createLayer('Vrstva 1')], exportSettings: { ...DEFAULT_EXPORT } }
}

/** Čas, kdy z plátna zmizí poslední zaznamenaný prvek. */
export function projectContentEnd(project: Project): number {
  let end = 0
  for (const layer of project.layers) {
    for (const stroke of layer.strokes) {
      const last = stroke.points[stroke.points.length - 1]
      if (last) end = Math.max(end, last.t + layer.offset + layer.style.fadeSeconds)
    }
    for (const fw of layer.fireworks) end = Math.max(end, fw.t + layer.offset + 3)
  }
  return end
}

// ---------- Souborový formát ----------
// Body tahu se ukládají jako plochá pole [x, y, t, x, y, t, …] — o řád menší soubor než pole objektů.

interface FileLayer {
  id: string
  name: string
  visible: boolean
  offset?: number
  style: LayerStyle
  strokes: number[][]
  /** Křivky tahů podle indexu tahu; uzly jako plochá pole [x, y, inX, inY, outX, outY, …]. */
  curves?: Record<string, FileCurve>
  fireworks: number[][]
}

interface FileCurve {
  nodes: number[]
  params: number[]
}

export interface FileProject {
  format: string
  version: number
  /** `relativePath` (vůči projektovému souboru) doplňuje hlavní proces při ukládání. */
  audio: { path: string; relativePath: string } | null
  export: ExportSettings
  layers: FileLayer[]
}

const round = (value: number, digits: number): number => {
  const f = 10 ** digits
  return Math.round(value * f) / f
}

export function serializeProject(project: Project): string {
  const file: FileProject = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    audio: project.audioPath ? { path: project.audioPath, relativePath: '' } : null,
    export: project.exportSettings,
    layers: project.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      offset: round(layer.offset, 4),
      style: layer.style,
      strokes: layer.strokes.map((s) => s.points.flatMap((p) => [round(p.x, 1), round(p.y, 1), round(p.t, 4)])),
      curves: packCurves(layer.strokes),
      // Pátá položka (hustota) jen u prořídlých ohňostrojů.
      fireworks: layer.fireworks.map((f) => {
        const flat = [round(f.x, 1), round(f.y, 1), round(f.t, 4), f.seed]
        if (f.density !== undefined && f.density < 1) flat.push(round(f.density, 3))
        return flat
      })
    }))
  }
  return JSON.stringify(file)
}

export function parseProject(json: string): Project {
  const file = JSON.parse(json) as Partial<FileProject> | null
  if (!isRecord(file) || file.format !== PROJECT_FORMAT) throw new Error('Soubor není projekt Kreslení hudby.')
  if (typeof file.version !== 'number' || file.version > PROJECT_VERSION) {
    throw new Error('Projekt byl vytvořen novější verzí aplikace.')
  }
  // Poškozená vrstva nebo položka se přeskočí, aby se zbytek projektu dal načíst.
  const rawLayers = Array.isArray(file.layers) ? file.layers.filter(isRecord) : []
  const usedIds = new Set<string>()
  const layers: Layer[] = rawLayers.map((layer, index) => {
    let id = typeof layer.id === 'string' && layer.id ? layer.id : Math.random().toString(36).slice(2, 10)
    while (usedIds.has(id)) id += '_'
    usedIds.add(id)
    const strokes = Array.isArray(layer.strokes) ? layer.strokes : []
    const curves = isRecord(layer.curves) ? layer.curves : {}
    return {
      id,
      name: typeof layer.name === 'string' ? layer.name : `Vrstva ${index + 1}`,
      visible: layer.visible !== false,
      offset: typeof layer.offset === 'number' && Number.isFinite(layer.offset) ? layer.offset : 0,
      style: sanitizeStyle(layer.style),
      strokes: strokes
        .map((flat, i) => unpackStroke(flat, curves[i]))
        .filter((s) => s.points.length > 0),
      fireworks: (Array.isArray(layer.fireworks) ? layer.fireworks : [])
        .map(unpackFirework)
        .filter((f): f is FireworkEvent => f !== null)
    }
  })
  if (layers.length === 0) layers.push(createLayer('Vrstva 1'))
  return {
    audioPath: typeof file.audio?.path === 'string' ? file.audio.path : null,
    layers,
    exportSettings: sanitizeExport(isRecord(file.export) ? file.export : undefined)
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Z uloženého stylu se vezmou jen hodnoty správného typu, zbytek doplní výchozí. */
function sanitizeStyle(saved: unknown): LayerStyle {
  const style: LayerStyle = { ...DEFAULT_STYLE }
  if (!isRecord(saved)) return style
  const target = style as unknown as Record<string, unknown>
  for (const key of Object.keys(DEFAULT_STYLE) as (keyof LayerStyle)[]) {
    const value = saved[key]
    const fallback = DEFAULT_STYLE[key]
    if (typeof fallback === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === 'string') {
      target[key] = value
    }
  }
  if (style.widthMode !== 'fixed' && style.widthMode !== 'dynamic') style.widthMode = DEFAULT_STYLE.widthMode
  return style
}

/** Neznámé hodnoty (ručně upravený soubor, formát z jiné verze) se nahradí výchozími. */
function sanitizeExport(saved: Partial<ExportSettings> | undefined): ExportSettings {
  const merged = { ...DEFAULT_EXPORT, ...saved }
  const resolution = EXPORT_RESOLUTIONS.find((r) => r.width === merged.width && r.height === merged.height)
  return {
    width: resolution ? merged.width : DEFAULT_EXPORT.width,
    height: resolution ? merged.height : DEFAULT_EXPORT.height,
    fps: (EXPORT_FPS as readonly number[]).includes(merged.fps) ? merged.fps : DEFAULT_EXPORT.fps,
    format: merged.format in EXPORT_FORMATS ? merged.format : DEFAULT_EXPORT.format
  }
}

function packCurves(strokes: Stroke[]): Record<string, FileCurve> | undefined {
  const curves: Record<string, FileCurve> = {}
  strokes.forEach(({ curve }, i) => {
    if (!curve) return
    curves[i] = {
      nodes: curve.nodes.flatMap((n) => [n.x, n.y, n.inX, n.inY, n.outX, n.outY].map((v) => round(v, 1))),
      params: curve.params.map((p) => round(p, 4))
    }
  })
  return Object.keys(curves).length > 0 ? curves : undefined
}

function unpackStroke(flat: unknown, curve?: FileCurve): Stroke {
  const points: StrokePoint[] = []
  if (Array.isArray(flat)) {
    // Neúplná trojice na konci se zahodí, body s nečíselnou hodnotou také.
    for (let i = 0; i + 2 < flat.length; i += 3) {
      const [x, y, t] = [flat[i], flat[i + 1], flat[i + 2]]
      if ([x, y, t].every((v) => typeof v === 'number' && Number.isFinite(v))) points.push({ x, y, t })
    }
  }
  // Křivka sedí na původní počet bodů; po vyřazení bodů ji unpackCurve zahodí.
  const unpacked = points.length > 0 ? unpackCurve(curve, points.length) : null
  return unpacked ? { points, curve: unpacked } : { points }
}

/** Křivka, která nesedí na body tahu (poškozený soubor), se zahodí — tah zůstane jako obyčejný. */
function unpackCurve(curve: FileCurve | undefined, pointCount: number): StrokeCurve | null {
  if (!curve || !Array.isArray(curve.nodes) || !Array.isArray(curve.params)) return null
  const { nodes: flat, params } = curve
  if (flat.length < 6 || flat.length % 6 !== 0 || params.length !== pointCount) return null
  if (![...flat, ...params].every((v) => typeof v === 'number' && Number.isFinite(v))) return null
  const nodes = []
  for (let i = 0; i < flat.length; i += 6) {
    nodes.push({ x: flat[i], y: flat[i + 1], inX: flat[i + 2], inY: flat[i + 3], outX: flat[i + 4], outY: flat[i + 5] })
  }
  return { nodes, params: params.slice() }
}

function unpackFirework(flat: unknown): FireworkEvent | null {
  if (!Array.isArray(flat) || ![flat[0], flat[1], flat[2]].every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return null
  }
  // Chybějící seed nahradí hodnota odvozená z polohy a času, aby ohňostroj měl stálý vzhled.
  const seed =
    typeof flat[3] === 'number' && Number.isFinite(flat[3])
      ? flat[3] >>> 0
      : Math.imul(Math.round(flat[0]) * 1921 + Math.round(flat[1]), 2654435761) ^ Math.round(flat[2] * 1000)
  const fw: FireworkEvent = { x: flat[0], y: flat[1], t: flat[2], seed: seed >>> 0 }
  if (typeof flat[4] === 'number' && flat[4] < 1) fw.density = Math.max(flat[4], 0)
  return fw
}
