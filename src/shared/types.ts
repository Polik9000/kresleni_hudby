/** Logický souřadný prostor plátna. Všechna zaznamenaná data jsou v těchto jednotkách. */
export const STAGE_WIDTH = 1920
export const STAGE_HEIGHT = 1080

export type WidthMode = 'fixed' | 'dynamic'

export interface LayerStyle {
  lineColor: string
  fireworkColor: string
  widthMode: WidthMode
  /** Tloušťka čáry v logických px (v dynamickém režimu maximum při pomalém pohybu). */
  width: number
  /** Vyhlazení čáry 0–1 (0 = přesně podle ruky). Aplikuje se při vykreslení, záznam zůstává surový. */
  smoothing: number
  /** Doba, za kterou stopa úplně zmizí. */
  fadeSeconds: number
  /** Síla záře 0–1. */
  glow: number
  /** Násobitel velikosti ohňostroje. */
  fireworkSize: number
}

/** Bod tahu: pozice v logických px, čas v sekundách skladby. */
export interface StrokePoint {
  x: number
  y: number
  t: number
}

/** Uzel křivky s táhly (absolutní souřadnice v logických px). */
export interface CurveNode {
  x: number
  y: number
  inX: number
  inY: number
  outX: number
  outY: number
}

/**
 * Tah převedený na editovatelnou křivku (kubické Bézierovy oblouky mezi uzly).
 * `params[i]` říká, kde na křivce leží bod `points[i]`: číslo oblouku + poloha v něm (0–1).
 */
export interface StrokeCurve {
  nodes: CurveNode[]
  params: number[]
}

export interface Stroke {
  points: StrokePoint[]
  /** Jen u tahu upraveného jako křivka; `points` jsou pak z křivky dopočítané. */
  curve?: StrokeCurve
}

export interface FireworkEvent {
  x: number
  y: number
  t: number
  /** Seed náhodného generátoru — stejný seed = stejný ohňostroj v náhledu i exportu. */
  seed: number
  /** Podíl částic 0–1 (chybí = plný ohňostroj). Menší mají ohňostroje sypané držením klávesy. */
  density?: number
}

export interface Layer {
  id: string
  name: string
  visible: boolean
  /** Posun celé vrstvy v čase (s): bod s časem t se zobrazí v čase skladby t + offset. */
  offset: number
  style: LayerStyle
  strokes: Stroke[]
  fireworks: FireworkEvent[]
}

/** Výstupní formáty exportu; argumenty kodéru jsou v `src/main/exporter.ts`. */
export const EXPORT_FORMATS = {
  'mp4-h264': { label: 'MP4 (H.264) — přehraje všechno', extension: 'mp4' },
  'mp4-h265': { label: 'MP4 (H.265) — menší soubor', extension: 'mp4' },
  'webm-vp9': { label: 'WebM (VP9)', extension: 'webm' },
  'mov-prores': { label: 'MOV (ProRes 422 HQ) — pro střih, velký soubor', extension: 'mov' }
} as const

export type ExportFormatId = keyof typeof EXPORT_FORMATS

/** Nabízená rozlišení (vždy 16:9 jako plátno, sudé rozměry kvůli yuv420p). */
export const EXPORT_RESOLUTIONS = [
  { width: 1280, height: 720, label: '1280×720 (HD)' },
  { width: 1920, height: 1080, label: '1920×1080 (Full HD)' },
  { width: 2560, height: 1440, label: '2560×1440 (QHD)' },
  { width: 3840, height: 2160, label: '3840×2160 (4K)' }
] as const

export const EXPORT_FPS = [24, 25, 30, 50, 60] as const

export interface ExportSettings {
  width: number
  height: number
  fps: number
  format: ExportFormatId
}

export interface Project {
  /** Absolutní cesta k audio souboru, null dokud není importován. */
  audioPath: string | null
  layers: Layer[]
  exportSettings: ExportSettings
}

// ---------- IPC ----------

export interface OpenedProject {
  path: string
  json: string
  /** Kde hlavní proces audio skutečně našel (relativně k projektu, jinak absolutně); null = chybí. */
  audioPath: string | null
}

export interface ExportStartOptions {
  outPath: string
  audioPath: string | null
  width: number
  height: number
  fps: number
  format: ExportFormatId
}

export interface ExportResult {
  ok: boolean
  error?: string
}

export interface KhApi {
  /** Jen výběr souboru; načtení dělá `readAudio`, aby šel mezitím ukázat průběh. */
  pickAudio(): Promise<string | null>
  /** Načte audio z cesty; null když soubor neexistuje. */
  readAudio(path: string): Promise<ArrayBuffer | null>
  openProject(): Promise<OpenedProject | null>
  /** path === null → dialog "Uložit jako". Vrací výslednou cestu nebo null při zrušení. */
  saveProject(path: string | null, json: string): Promise<string | null>
  /** Záloha dosud neuloženého projektu (přežije pád aplikace); nabídne se při příštím spuštění. */
  saveRecovery(json: string): Promise<void>
  loadRecovery(): Promise<{ json: string; audioPath: string | null } | null>
  clearRecovery(): Promise<void>
  pickExportPath(defaultName: string, format: ExportFormatId): Promise<string | null>
  exportStart(options: ExportStartOptions): Promise<ExportResult>
  /** Surový RGBA snímek; promise se vyřeší, až ho ffmpeg převezme (backpressure). */
  exportFrame(rgba: Uint8Array): Promise<ExportResult>
  exportFinish(): Promise<ExportResult>
  exportCancel(): Promise<void>
  showInFolder(path: string): void
  setWindowState(state: { title: string; dirty: boolean }): void
}
