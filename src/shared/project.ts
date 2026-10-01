import type { ExportSettings, FireworkEvent, Layer, LayerStyle, Project, Stroke, StrokePoint } from './types'

export const PROJECT_FORMAT = 'kresleni-hudby'
export const PROJECT_VERSION = 1
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

export const DEFAULT_EXPORT: ExportSettings = { width: 1920, height: 1080, fps: 30 }

export function createLayer(name: string): Layer {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name,
    visible: true,
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
      if (last) end = Math.max(end, last.t + layer.style.fadeSeconds)
    }
    for (const fw of layer.fireworks) end = Math.max(end, fw.t + 3)
  }
  return end
}

// ---------- Souborový formát ----------
// Body tahu se ukládají jako plochá pole [x, y, t, x, y, t, …] — o řád menší soubor než pole objektů.

interface FileLayer {
  id: string
  name: string
  visible: boolean
  style: LayerStyle
  strokes: number[][]
  fireworks: number[][]
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
      style: layer.style,
      strokes: layer.strokes.map((s) => s.points.flatMap((p) => [round(p.x, 1), round(p.y, 1), round(p.t, 4)])),
      fireworks: layer.fireworks.map((f) => [round(f.x, 1), round(f.y, 1), round(f.t, 4), f.seed])
    }))
  }
  return JSON.stringify(file)
}

export function parseProject(json: string): Project {
  const file = JSON.parse(json) as Partial<FileProject>
  if (file.format !== PROJECT_FORMAT) throw new Error('Soubor není projekt Kreslení hudby.')
  if (typeof file.version !== 'number' || file.version > PROJECT_VERSION) {
    throw new Error('Projekt byl vytvořen novější verzí aplikace.')
  }
  const layers: Layer[] = (file.layers ?? []).map((layer) => ({
    id: String(layer.id),
    name: String(layer.name),
    visible: layer.visible !== false,
    style: { ...DEFAULT_STYLE, ...layer.style },
    strokes: (layer.strokes ?? []).map(unpackStroke).filter((s) => s.points.length > 0),
    fireworks: (layer.fireworks ?? []).map(unpackFirework)
  }))
  if (layers.length === 0) layers.push(createLayer('Vrstva 1'))
  return {
    audioPath: file.audio?.path ?? null,
    layers,
    exportSettings: { ...DEFAULT_EXPORT, ...file.export }
  }
}

function unpackStroke(flat: number[]): Stroke {
  const points: StrokePoint[] = []
  for (let i = 0; i + 2 < flat.length; i += 3) points.push({ x: flat[i], y: flat[i + 1], t: flat[i + 2] })
  return { points }
}

function unpackFirework(flat: number[]): FireworkEvent {
  return { x: flat[0], y: flat[1], t: flat[2], seed: flat[3] >>> 0 }
}
