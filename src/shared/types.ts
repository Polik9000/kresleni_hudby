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

export interface Stroke {
  points: StrokePoint[]
}

export interface FireworkEvent {
  x: number
  y: number
  t: number
  /** Seed náhodného generátoru — stejný seed = stejný ohňostroj v náhledu i exportu. */
  seed: number
}

export interface Layer {
  id: string
  name: string
  visible: boolean
  style: LayerStyle
  strokes: Stroke[]
  fireworks: FireworkEvent[]
}

export interface ExportSettings {
  width: number
  height: number
  fps: number
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
  pickExportPath(defaultName: string): Promise<string | null>
  exportStart(options: ExportStartOptions): Promise<ExportResult>
  /** Surový RGBA snímek; promise se vyřeší, až ho ffmpeg převezme (backpressure). */
  exportFrame(rgba: Uint8Array): Promise<ExportResult>
  exportFinish(): Promise<ExportResult>
  exportCancel(): Promise<void>
  showInFolder(path: string): void
  setWindowState(state: { title: string; dirty: boolean }): void
}
