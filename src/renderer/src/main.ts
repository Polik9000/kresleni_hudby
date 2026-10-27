import {
  createLayer,
  createProject,
  LAYER_COLORS,
  parseProject,
  projectContentEnd,
  serializeProject
} from '../../shared/project'
import {
  EXPORT_FORMATS,
  EXPORT_FPS,
  EXPORT_RESOLUTIONS,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type ExportFormatId,
  type FireworkEvent,
  type Layer,
  type LayerStyle,
  type Project,
  type Stroke
} from '../../shared/types'
import { AudioEngine } from './audio'
import { Editor } from './editor'
import { exportVideo } from './exportVideo'
import { FIREWORK_LIFETIME } from './render/fireworks'
import { layersAt, SceneRenderer } from './render/scene'
import { Timeline } from './timeline'

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T

/** Kratší a menší stisk než tyto meze se bere jako klik (ohňostroj), ne jako tah. */
const CLICK_MAX_DISTANCE = 6
const CLICK_MAX_SECONDS = 0.35
const AUTOSAVE_DELAY_MS = 1000
const COUNTDOWN_SECONDS = 3
/** Podíl částic u ohňostrojů sypaných držením klávesy F — plný počet by splýval v jednu záři. */
const HELD_FIREWORK_DENSITY = 0.2

// ---------- Stav ----------

let project: Project = createProject()
/** Vrstva, do které se nahrává a kterou upravuje panel nastavení. */
let activeLayerId = project.layers[0].id
/** Při nahrávání ukázat jen aktivní vrstvu (ostatní se jinak přehrávají jako reference). */
let soloWhileRecording = false
let projectPath: string | null = null
let dirty = false
let recording = false
let exporting = false
/** Režim úprav: plátno nekreslí, ale vybírá a upravuje nahrané čáry a ohňostroje aktivní vrstvy. */
let editMode = false
let loadingAudio = false
/** Roste s každou změnou — pozná se podle něj, jestli během ukládání nepřibyla další. */
let changeCounter = 0
let autosaveTimer = 0
/** Zbývající sekundy odpočtu před nahráváním; 0 = odpočet neběží. */
let countdownLeft = 0
let countdownTimer = 0

/** Vrstva pro kreslení nanečisto (mimo nahrávání). Běží na reálném čase a nikam se neukládá. */
const scratch: Layer = createLayer('nanečisto')

/**
 * Stav pro Zpět/Znovu: které vrstvy existují a co je v nich nahráno. Objekty vrstev zůstávají
 * tytéž, takže název, vzhled a posun vrstvy krok zpět nemění.
 */
interface Snapshot {
  layers: { layer: Layer; strokes: Stroke[]; fireworks: FireworkEvent[] }[]
}
const undoStack: Snapshot[] = []
const redoStack: Snapshot[] = []
let recordSnapshot: Snapshot | null = null

interface ActiveStroke {
  pointerId: number
  stroke: Stroke
  target: Layer
  startX: number
  startY: number
  startTime: number
  maxDistance: number
}
let active: ActiveStroke | null = null
/** Zástupné id ukazatele pro tah kreslený držením klávesy (skutečné ukazatele mají id >= 0). */
const KEY_POINTER = -1
let keyDrawHeld = false
let lastPointer: { x: number; y: number } | null = null

const audio = new AudioEngine()
const stage = $<HTMLCanvasElement>('stage')
const renderer = new SceneRenderer(stage)
/** Tentýž kontext, do kterého kreslí `renderer` — překryv režimu úprav se kreslí přes hotový snímek. */
const stageCtx = stage.getContext('2d')!

/** Aktivní vrstva. */
const layer = (): Layer => project.layers.find((l) => l.id === activeLayerId) ?? project.layers[0]
const wallTime = (): number => performance.now() / 1000

const editor = new Editor({
  layer,
  time: () => layerTime(layer(), audio.time),
  beginChange: () => pushUndo(snapshot()),
  changed: () => {
    markDirty()
    contentChanged()
  },
  selectionChanged: () => updateEditPanel()
})

const timeline = new Timeline(
  $<HTMLCanvasElement>('timeline'),
  {
    duration: timelineDuration,
    time: () => audio.time,
    peaks: (columns, from, to) => audio.peaks(columns, from, to),
    layers: () => project.layers,
    activeLayer: layer
  },
  {
    onSeek: (time) => {
      if (!recording) audio.seek(time)
    },
    onLayerOffset: (target, offset) => {
      if (recording) return
      selectLayer(target.id)
      setLayerOffset(Math.round(offset * 100) / 100)
    }
  }
)

function timelineDuration(): number {
  if (audio.hasAudio) return audio.duration
  // Bez audia roste osa po celých minutách podle obsahu a pozice.
  return Math.ceil(Math.max(projectContentEnd(project), audio.time, 1) / 60) * 60
}

// ---------- Pomocné UI ----------

let toastTimer = 0
function toast(message: string, isError = false): void {
  const el = $('toast')
  el.textContent = message
  el.classList.toggle('error', isError)
  el.hidden = false
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (el.hidden = true), isError ? 6000 : 2500)
}

const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path

function formatTime(seconds: number): string {
  const tenths = Math.floor(seconds * 10)
  const m = Math.floor(tenths / 600)
  const s = Math.floor((tenths % 600) / 10)
  return `${m}:${String(s).padStart(2, '0')}.${tenths % 10}`
}

function updateWindowState(): void {
  const name = projectPath ? fileName(projectPath) : 'Nový projekt'
  window.kh.setWindowState({ title: `${dirty ? '● ' : ''}${name} — Kreslení hudby`, dirty })
}

/** Každá změna projektu naplánuje automatické uložení (odložené, aby tažení posuvníku neukládalo stokrát). */
function markDirty(): void {
  dirty = true
  changeCounter++
  updateWindowState()
  scheduleAutosave()
}

function scheduleAutosave(): void {
  window.clearTimeout(autosaveTimer)
  autosaveTimer = window.setTimeout(() => void autosave(), AUTOSAVE_DELAY_MS)
}

const clockTime = (): string => new Date().toLocaleTimeString('cs-CZ')

/**
 * Uložený projekt se přepisuje na svém místě. Projekt, který ještě nemá soubor, se zálohuje
 * do složky aplikace a po pádu se nabídne k obnovení.
 */
async function autosave(): Promise<void> {
  if (!dirty) return
  // Uprostřed nahrávání nebo exportu se neukládá — dojde na to hned po dokončení.
  if (recording || exporting || active) {
    scheduleAutosave()
    return
  }
  const savedCounter = changeCounter
  try {
    if (projectPath) {
      await window.kh.saveProject(projectPath, serializeProject(project))
      if (changeCounter === savedCounter) dirty = false
      updateWindowState()
      $('save-status').textContent = `Automaticky uloženo ${clockTime()}`
    } else {
      await window.kh.saveRecovery(serializeProject(project))
      $('save-status').textContent = `Neuložený projekt — záloha ${clockTime()}`
    }
  } catch (err) {
    toast(`Automatické uložení selhalo: ${(err as Error).message}`, true)
  }
}

function updateControls(): void {
  document.body.classList.toggle('recording', recording)
  document.body.classList.toggle('editing', editMode)
  $('btn-edit').classList.toggle('on', editMode)
  $<HTMLButtonElement>('btn-edit').disabled = recording
  updateEditPanel()
  $('btn-play').textContent = audio.playing ? '⏸' : '▶'
  $('btn-record').textContent = recording
    ? '■ Zastavit'
    : countdownLeft > 0
      ? `Zrušit (${countdownLeft})`
      : '● Nahrát'
  const overlay = $('countdown')
  overlay.hidden = countdownLeft === 0
  overlay.textContent = String(countdownLeft)
  $<HTMLButtonElement>('btn-undo').disabled = recording || undoStack.length === 0
  $<HTMLButtonElement>('btn-redo').disabled = recording || redoStack.length === 0
  $<HTMLButtonElement>('btn-clear').disabled =
    recording || (layer().strokes.length === 0 && layer().fireworks.length === 0)
  $<HTMLButtonElement>('btn-layer-add').disabled = recording
  $<HTMLButtonElement>('btn-layer-delete').disabled = recording || project.layers.length < 2
  renderLayerList()
  $('layer-stats').textContent = `Nahráno: ${layer().strokes.length} tahů, ${layer().fireworks.length} ohňostrojů`
  $('audio-name').textContent = project.audioPath
    ? fileName(project.audioPath) + (audio.hasAudio ? '' : ' (nenalezeno)')
    : 'Žádné audio'
}

// ---------- Režim úprav ----------

const editInputs = {
  time: $<HTMLInputElement>('edit-time'),
  copy: $<HTMLButtonElement>('btn-copy'),
  paste: $<HTMLButtonElement>('btn-paste'),
  remove: $<HTMLButtonElement>('btn-delete-item')
}

function updateEditPanel(): void {
  $('edit-panel').hidden = !editMode
  if (!editMode) return
  $('edit-info').textContent = editor.describe()
  const start = editor.selectedStart()
  editInputs.time.disabled = start === null
  if (document.activeElement !== editInputs.time) {
    editInputs.time.value = start === null ? '' : (start + layer().offset).toFixed(2)
  }
  editInputs.copy.disabled = !editor.hasSelection
  editInputs.remove.disabled = !editor.hasSelection
  editInputs.paste.disabled = !editor.hasClipboard
}

function setEditMode(on: boolean): void {
  if (editMode === on || (on && (recording || exporting || countdownLeft > 0))) return
  finishActive(null)
  setKeyDraw(false)
  editMode = on
  if (!on) editor.clear()
  updateControls()
}

function copySelection(): void {
  if (editor.copy()) toast('Zkopírováno — Ctrl+V vloží na místo přehrávací hlavy.')
}

function pasteClipboard(): void {
  if (!editor.paste()) toast('Schránka je prázdná — nejdřív něco vyber a zkopíruj (Ctrl+C).')
}

function initEditPanel(): void {
  $('btn-edit').onclick = () => setEditMode(!editMode)
  editInputs.copy.onclick = copySelection
  editInputs.paste.onclick = pasteClipboard
  editInputs.remove.onclick = () => editor.deleteSelected()
  // Posun v čase až po potvrzení hodnoty — každá změna je jeden krok pro Zpět.
  editInputs.time.addEventListener('change', () => {
    const value = Number(editInputs.time.value)
    if (editInputs.time.value !== '' && Number.isFinite(value)) editor.setSelectedStart(value - layer().offset)
    editInputs.time.blur()
  })
  editInputs.time.addEventListener('blur', updateEditPanel)
  editInputs.time.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') editInputs.time.blur()
  })
}

/** Dosah kliknutí v režimu úprav: ~10 px obrazovky v logických px plátna. */
const hitRadius = (): number => (10 * STAGE_WIDTH) / stage.getBoundingClientRect().width

/** Obsah vrstvy se změnil — překreslit značky na ose a ovládací prvky. */
function contentChanged(): void {
  timeline.invalidate()
  updateControls()
}

// ---------- Vrstvy ----------

function renderLayerList(): void {
  const current = layer()
  const rows = project.layers.map((l) => {
    const row = document.createElement('div')
    row.className = `layer-row${l === current ? ' active' : ''}${l.visible ? '' : ' off'}`
    row.dataset.id = l.id
    row.onclick = () => selectLayer(l.id)

    const eye = document.createElement('button')
    eye.className = 'eye'
    eye.textContent = '👁'
    eye.title = l.visible ? 'Skrýt vrstvu (nebude ani v exportu)' : 'Zobrazit vrstvu'
    eye.onclick = (e) => {
      e.stopPropagation()
      l.visible = !l.visible
      markDirty()
      contentChanged()
    }
    const swatch = document.createElement('span')
    swatch.className = 'swatch'
    swatch.style.background = l.style.lineColor
    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = l.name || 'Bez názvu'
    const count = document.createElement('span')
    count.className = 'muted small'
    count.textContent = `${l.strokes.length} / ${l.fireworks.length}`
    count.title = 'tahů / ohňostrojů'
    row.append(eye, swatch, name, count)
    return row
  })
  $('layer-list').replaceChildren(...rows)
}

function selectLayer(id: string): void {
  if (recording || id === activeLayerId || !project.layers.some((l) => l.id === id)) return
  activeLayerId = id
  syncPanel()
  contentChanged()
}

/** Přepnutí na sousední vrstvu klávesou — jde i na celé obrazovce, kde seznam vrstev není vidět. */
function selectNeighbourLayer(step: number): void {
  const next = project.layers[project.layers.indexOf(layer()) + step]
  if (recording || !next) return
  selectLayer(next.id)
  toast(`Vrstva: ${next.name || 'Bez názvu'}`)
}

function addLayer(): void {
  if (recording) return
  pushUndo(snapshot())
  const names = new Set(project.layers.map((l) => l.name))
  let number = project.layers.length + 1
  while (names.has(`Vrstva ${number}`)) number++
  const added = createLayer(`Vrstva ${number}`)
  // Nová vrstva přebírá vzhled té aktivní, jen s jinou barvou čáry, aby šly na první pohled rozlišit.
  const used = new Set(project.layers.map((l) => l.style.lineColor))
  const lineColor =
    LAYER_COLORS.find((color) => !used.has(color)) ?? LAYER_COLORS[project.layers.length % LAYER_COLORS.length]
  added.style = { ...layer().style, lineColor }
  project.layers.push(added)
  activeLayerId = added.id
  markDirty()
  syncPanel()
  contentChanged()
}

function deleteLayer(): void {
  if (recording || project.layers.length < 2) return
  pushUndo(snapshot())
  const index = project.layers.indexOf(layer())
  project.layers.splice(index, 1)
  activeLayerId = project.layers[Math.min(index, project.layers.length - 1)].id
  markDirty()
  syncPanel()
  contentChanged()
}

function setLayerOffset(offset: number): void {
  layer().offset = offset
  if (document.activeElement !== styleInputs.offset) styleInputs.offset.value = String(offset)
  timeline.invalidate()
  markDirty()
}

// ---------- Panel nastavení vrstvy ----------

const styleInputs = {
  name: $<HTMLInputElement>('layer-name'),
  offset: $<HTMLInputElement>('layer-offset'),
  lineColor: $<HTMLInputElement>('line-color'),
  fireworkColor: $<HTMLInputElement>('firework-color'),
  width: $<HTMLInputElement>('width'),
  smoothing: $<HTMLInputElement>('smoothing'),
  fade: $<HTMLInputElement>('fade'),
  glow: $<HTMLInputElement>('glow'),
  fireworkSize: $<HTMLInputElement>('firework-size'),
  widthModes: Array.from(document.querySelectorAll<HTMLInputElement>('input[name="width-mode"]'))
}

function updateStyleLabels(): void {
  const { style } = layer()
  $('width-label').textContent = style.widthMode === 'dynamic' ? 'Max. tloušťka' : 'Tloušťka'
  $('width-out').textContent = `${style.width} px`
  $('smoothing-out').textContent = `${Math.round(style.smoothing * 100)} %`
  $('fade-out').textContent = `${style.fadeSeconds.toFixed(1)} s`
  $('glow-out').textContent = `${Math.round(style.glow * 100)} %`
  $('firework-size-out').textContent = `${style.fireworkSize.toFixed(1)}×`
}

/** Propíše stav vrstvy do formuláře (po načtení/novém projektu). */
function syncPanel(): void {
  const { style, name, offset } = layer()
  styleInputs.name.value = name
  styleInputs.offset.value = String(offset)
  styleInputs.lineColor.value = style.lineColor
  styleInputs.fireworkColor.value = style.fireworkColor
  styleInputs.width.value = String(style.width)
  styleInputs.smoothing.value = String(style.smoothing)
  styleInputs.fade.value = String(style.fadeSeconds)
  styleInputs.glow.value = String(style.glow)
  styleInputs.fireworkSize.value = String(style.fireworkSize)
  for (const radio of styleInputs.widthModes) radio.checked = radio.value === style.widthMode
  updateStyleLabels()
}

function bindStyle(input: HTMLInputElement, apply: (style: LayerStyle, value: string) => void): void {
  input.addEventListener('input', () => {
    apply(layer().style, input.value)
    updateStyleLabels()
    renderLayerList()
    timeline.invalidate()
    markDirty()
  })
  // Po puštění posuvníku vrátit klávesnici zkratkám (mezerník, Home…).
  input.addEventListener('change', () => input.blur())
}

function initPanel(): void {
  bindStyle(styleInputs.lineColor, (s, v) => (s.lineColor = v))
  bindStyle(styleInputs.fireworkColor, (s, v) => (s.fireworkColor = v))
  bindStyle(styleInputs.width, (s, v) => (s.width = Number(v)))
  bindStyle(styleInputs.smoothing, (s, v) => (s.smoothing = Number(v)))
  bindStyle(styleInputs.fade, (s, v) => (s.fadeSeconds = Number(v)))
  bindStyle(styleInputs.glow, (s, v) => (s.glow = Number(v)))
  bindStyle(styleInputs.fireworkSize, (s, v) => (s.fireworkSize = Number(v)))
  for (const radio of styleInputs.widthModes) {
    bindStyle(radio, (s, v) => (s.widthMode = v === 'dynamic' ? 'dynamic' : 'fixed'))
  }
  styleInputs.name.addEventListener('input', () => {
    layer().name = styleInputs.name.value
    renderLayerList()
    markDirty()
  })
  styleInputs.offset.addEventListener('input', () => {
    const value = Number(styleInputs.offset.value)
    if (styleInputs.offset.value !== '' && Number.isFinite(value)) setLayerOffset(value)
  })
  // Rozepsanou nebo neplatnou hodnotu po opuštění pole nahradit skutečným posunem.
  styleInputs.offset.addEventListener('blur', () => (styleInputs.offset.value = String(layer().offset)))
  for (const input of [styleInputs.name, styleInputs.offset]) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') input.blur()
    })
  }
}

// ---------- Kreslení a ohňostroje ----------

/**
 * Poloha kurzoru při zamčeném ukazateli (celá obrazovka). Systémový kurzor je tehdy skrytý
 * a nemůže odjet na druhý monitor; aplikace si polohu počítá sama z relativních pohybů myši.
 */
const lockedPointer = { x: STAGE_WIDTH / 2, y: STAGE_HEIGHT / 2 }
const pointerLocked = (): boolean => document.pointerLockElement === stage

function showLockedCursor(): void {
  const cursor = $('locked-cursor')
  const rect = stage.getBoundingClientRect()
  cursor.hidden = !pointerLocked()
  cursor.style.left = `${rect.left + (lockedPointer.x / STAGE_WIDTH) * rect.width}px`
  cursor.style.top = `${rect.top + (lockedPointer.y / STAGE_HEIGHT) * rect.height}px`
}

/** `moved`: událost nese pohyb (pointermove) — u zamčeného ukazatele se o něj poloha posune. */
function stagePosition(e: PointerEvent, moved = false): { x: number; y: number } {
  const rect = stage.getBoundingClientRect()
  if (pointerLocked()) {
    if (moved) {
      const scale = STAGE_WIDTH / rect.width
      lockedPointer.x = Math.min(Math.max(lockedPointer.x + e.movementX * scale, 0), STAGE_WIDTH)
      lockedPointer.y = Math.min(Math.max(lockedPointer.y + e.movementY * scale, 0), STAGE_HEIGHT)
    }
    return { ...lockedPointer }
  }
  return {
    x: ((e.clientX - rect.left) / rect.width) * STAGE_WIDTH,
    y: ((e.clientY - rect.top) / rect.height) * STAGE_HEIGHT
  }
}

/** Čas skladby přepočtený na vlastní čas vrstvy (posunutá vrstva má záznam uložený bez posunu). */
const layerTime = (target: Layer, songTime: number): number => songTime - target.offset

/** Čas události na časové ose cílové vrstvy, opravený o zpoždění mezi vznikem a zpracováním události. */
function eventTime(e: Event, target: Layer): number {
  const lag = Math.min(Math.max(performance.now() - e.timeStamp, 0), 100) / 1000
  return target === scratch ? wallTime() - lag : layerTime(target, Math.max(audio.time - lag, 0))
}

const drawTarget = (): Layer => (recording ? layer() : scratch)

function addFirework(target: Layer, x: number, y: number, t: number, density = 1): void {
  const fw: FireworkEvent = { x, y, t, seed: Math.floor(Math.random() * 0x100000000) }
  if (density < 1) fw.density = density
  target.fireworks.push(fw)
  if (target !== scratch) contentChanged()
}

function finishActive(endTime: number | null): void {
  if (!active) return
  const { stroke, target, startX, startY, startTime, maxDistance } = active
  active = null
  const isClick = endTime !== null && maxDistance < CLICK_MAX_DISTANCE && endTime - startTime < CLICK_MAX_SECONDS
  if (isClick) {
    target.strokes.splice(target.strokes.indexOf(stroke), 1)
    addFirework(target, startX, startY, startTime)
  } else if (endTime === null && stroke.points.length < 2) {
    // Klávesa kreslení stisknutá bez pohybu (nebo přerušený tah) nemá zanechat tečku.
    target.strokes.splice(target.strokes.indexOf(stroke), 1)
  } else if (target !== scratch) {
    contentChanged()
  }
}

function beginStroke(pointerId: number, pos: { x: number; y: number }, t: number, target: Layer): void {
  const stroke: Stroke = { points: [{ ...pos, t }] }
  target.strokes.push(stroke)
  active = { pointerId, stroke, target, startX: pos.x, startY: pos.y, startTime: t, maxDistance: 0 }
}

/**
 * Kreslení držením klávesy (pro touchpad): dokud je klávesa dole, kreslí pouhý pohyb kurzoru,
 * bez držení tlačítka. Zvednutí prstu z touchpadu tah nepřeruší — kurzor zůstane stát.
 */
function setKeyDraw(held: boolean, e?: Event): void {
  if (keyDrawHeld === held || (held && editMode)) return
  keyDrawHeld = held
  $('draw-badge').hidden = !held
  if (!held) {
    if (active?.pointerId === KEY_POINTER) finishActive(null)
  } else if (!active && lastPointer && !exporting && e) {
    const target = drawTarget()
    beginStroke(KEY_POINTER, lastPointer, eventTime(e, target), target)
  }
}

function initStageInput(): void {
  stage.addEventListener('contextmenu', (e) => e.preventDefault())

  stage.addEventListener('pointerdown', (e) => {
    if (exporting) return
    const target = drawTarget()
    const pos = stagePosition(e)
    const t = eventTime(e, target)
    lastPointer = pos
    if (editMode) {
      if (e.button !== 0) return
      stage.setPointerCapture(e.pointerId)
      editor.pointerDown(pos, e, hitRadius())
      return
    }
    // Při kreslení klávesou se ťuknutí na touchpad ignoruje (stává se omylem); ohňostroj jen přes F.
    if (keyDrawHeld) return
    if (e.button === 2) {
      addFirework(target, pos.x, pos.y, t)
      return
    }
    if (e.button !== 0 || active) return
    stage.setPointerCapture(e.pointerId)
    beginStroke(e.pointerId, pos, t, target)
  })

  stage.addEventListener('pointermove', (e) => {
    // Coalesced události = všechny vzorky polohy mezi dvěma snímky; hladší křivka u rychlých tahů.
    // Jejich pohyby dávají dohromady pohyb události `e`, takže se započítá jen jedno z toho.
    const coalesced = e.getCoalescedEvents()
    const samples = coalesced.length > 0 ? coalesced : [e]
    if (editMode) {
      for (const sample of samples) lastPointer = stagePosition(sample, true)
      if (lastPointer) editor.pointerMove(lastPointer, e.altKey)
      showLockedCursor()
      return
    }
    // Klávesa kreslení je dole, ale tah neběží (kurzor byl mimo plátno, nebo začalo nahrávání).
    if (keyDrawHeld && !active && !exporting) {
      const target = drawTarget()
      beginStroke(KEY_POINTER, stagePosition(samples[0]), eventTime(samples[0], target), target)
    }
    if (!active || (active.pointerId !== KEY_POINTER && e.pointerId !== active.pointerId)) {
      for (const sample of samples) lastPointer = stagePosition(sample, true)
      showLockedCursor()
      return
    }
    const { points } = active.stroke
    for (const sample of samples) {
      const pos = stagePosition(sample, true)
      lastPointer = pos
      const last = points[points.length - 1]
      if (pos.x === last.x && pos.y === last.y) continue
      points.push({ ...pos, t: Math.max(eventTime(sample, active.target), last.t) })
      active.maxDistance = Math.max(active.maxDistance, Math.hypot(pos.x - active.startX, pos.y - active.startY))
    }
    showLockedCursor()
  })

  const release = (e: PointerEvent): void => {
    if (editMode) editor.pointerUp()
    if (active && e.pointerId === active.pointerId) finishActive(eventTime(e, active.target))
  }
  stage.addEventListener('pointerup', release)
  stage.addEventListener('pointercancel', release)
  stage.addEventListener('pointerleave', () => {
    // Tah kreslený klávesou končí na okraji plátna; po návratu kurzoru začne nový.
    if (active?.pointerId === KEY_POINTER) finishActive(null)
    if (!active) lastPointer = null
  })
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyD') setKeyDraw(false)
  })
  // Po přepnutí do jiného okna by keyup nedorazil a kreslilo by se dál.
  window.addEventListener('blur', () => setKeyDraw(false))
}

/** `held`: klávesa je držená (opakování) — sype se proud menších ohňostrojů místo plných. */
function fireworkAtPointer(held: boolean): void {
  if (!lastPointer || exporting) return
  const target = drawTarget()
  const t = target === scratch ? wallTime() : layerTime(target, audio.time)
  addFirework(target, lastPointer.x, lastPointer.y, t, held ? HELD_FIREWORK_DENSITY : 1)
}

function pruneScratch(now: number): void {
  const fade = scratch.style.fadeSeconds
  scratch.strokes = scratch.strokes.filter(
    (s) => s === active?.stroke || s.points[s.points.length - 1].t + fade > now
  )
  scratch.fireworks = scratch.fireworks.filter((f) => f.t + FIREWORK_LIFETIME > now)
}

// ---------- Transport a nahrávání ----------

const snapshot = (): Snapshot => ({
  layers: project.layers.map((l) => ({ layer: l, strokes: l.strokes.slice(), fireworks: l.fireworks.slice() }))
})

function restore(state: Snapshot): void {
  project.layers = state.layers.map(({ layer: l, strokes, fireworks }) => {
    l.strokes = strokes
    l.fireworks = fireworks
    return l
  })
  // Aktivní vrstva mohla krokem zpět zaniknout.
  activeLayerId = layer().id
  markDirty()
  syncPanel()
  contentChanged()
}

function pushUndo(state: Snapshot): void {
  undoStack.push(state)
  redoStack.length = 0
}

function undo(): void {
  const state = undoStack.pop()
  if (recording || !state) return
  redoStack.push(snapshot())
  restore(state)
}

function redo(): void {
  const state = redoStack.pop()
  if (recording || !state) return
  undoStack.push(snapshot())
  restore(state)
}

function clearLayer(): void {
  if (recording || (layer().strokes.length === 0 && layer().fireworks.length === 0)) return
  pushUndo(snapshot())
  layer().strokes = []
  layer().fireworks = []
  markDirty()
  contentChanged()
}

/** Odpočet před nahráváním — čas položit ruku na myš/pero a připravit se na první tón. */
function beginCountdown(): void {
  if (recording || exporting || countdownLeft > 0) return
  audio.pause()
  countdownLeft = COUNTDOWN_SECONDS
  countdownTimer = window.setInterval(() => {
    if (countdownLeft > 1) {
      countdownLeft--
      updateControls()
    } else {
      cancelCountdown()
      void startRecording()
    }
  }, 1000)
  updateControls()
}

function cancelCountdown(): void {
  if (countdownLeft === 0) return
  window.clearInterval(countdownTimer)
  countdownLeft = 0
  updateControls()
}

function toggleRecording(): void {
  if (recording) stopRecording()
  else if (countdownLeft > 0) cancelCountdown()
  else beginCountdown()
}

async function startRecording(): Promise<void> {
  if (recording || exporting) return
  setEditMode(false)
  finishActive(null)
  // Nejdřív rozběhnout hodiny — smyčka snímků bere "nahrává se, ale nehraje" jako konec skladby.
  await audio.play()
  recordSnapshot = snapshot()
  // Do skryté vrstvy by se kreslilo naslepo.
  if (!layer().visible) {
    layer().visible = true
    markDirty()
  }
  recording = true
  updateControls()
}

function stopRecording(): void {
  cancelCountdown()
  if (!recording) return
  finishActive(null)
  recording = false
  audio.pause()
  const before = recordSnapshot!
  recordSnapshot = null
  const prior = before.layers.find((entry) => entry.layer === layer())!
  // Nahrávání do vrstvy přidává (overdub); celý průchod jde vrátit jedním "Zpět".
  if (layer().strokes.length !== prior.strokes.length || layer().fireworks.length !== prior.fireworks.length) {
    pushUndo(before)
    markDirty()
  }
  contentChanged()
}

async function togglePlay(): Promise<void> {
  if (exporting) return
  if (recording || countdownLeft > 0) stopRecording()
  else if (audio.playing) audio.pause()
  else await audio.play()
  updateControls()
}

function goToStart(): void {
  if (recording || exporting) return
  audio.seek(0)
}

// ---------- Projekt ----------

function confirmDiscard(): boolean {
  return !dirty || window.confirm('Projekt obsahuje neuložené změny. Opravdu je zahodit?')
}

function resetSession(next: Project, path: string | null): void {
  stopRecording()
  audio.unload()
  window.clearTimeout(autosaveTimer)
  project = next
  activeLayerId = next.layers[0].id
  projectPath = path
  dirty = false
  $('save-status').textContent = ''
  undoStack.length = 0
  redoStack.length = 0
  syncPanel()
  contentChanged()
  updateWindowState()
}

function newProject(): void {
  if (exporting || !confirmDiscard()) return
  resetSession(createProject(), null)
  void window.kh.clearRecovery()
}

/** Načte audio právě otevřeného projektu; `locatedPath` je místo, kde ho hlavní proces našel. */
async function loadProjectAudio(locatedPath: string | null): Promise<void> {
  const wanted = project.audioPath
  if (!wanted) return
  // Odkaz na audio v projektu zůstává, i když soubor chybí; uživatel ho může znovu importovat.
  if (!locatedPath) toast(`Audio „${fileName(wanted)}“ nebylo nalezeno. Importujte ho znovu.`, true)
  else await loadAudio(locatedPath)
}

/** Po pádu nebo vypnutí bez uložení nabídne rozpracovaný projekt, který ještě neměl vlastní soubor. */
async function offerRecovery(): Promise<void> {
  const recovery = await window.kh.loadRecovery()
  if (!recovery) return
  let parsed: Project
  try {
    parsed = parseProject(recovery.json)
  } catch {
    await window.kh.clearRecovery()
    return
  }
  if (!window.confirm('Minule zůstal neuložený projekt. Chcete ho obnovit?')) {
    await window.kh.clearRecovery()
    return
  }
  resetSession(parsed, null)
  dirty = true
  updateWindowState()
  $('save-status').textContent = 'Obnoveno ze zálohy — projekt ještě není uložený'
  await loadProjectAudio(recovery.audioPath)
}

/**
 * Přečte a dekóduje audio soubor. U dlouhé skladby to trvá i několik sekund, proto je po tu dobu
 * přes celé okno vidět průběh a ovládání je zablokované.
 */
async function loadAudio(path: string): Promise<boolean> {
  loadingAudio = true
  $('loading-text').textContent = `Načítám audio „${fileName(path)}“…`
  $('loading').hidden = false
  try {
    const data = await window.kh.readAudio(path)
    if (!data) {
      toast(`Soubor „${fileName(path)}“ se nepodařilo přečíst.`, true)
      return false
    }
    $('loading-text').textContent = `Zpracovávám audio „${fileName(path)}“…`
    await audio.load(data)
  } catch {
    toast(`Soubor „${fileName(path)}“ se nepodařilo dekódovat jako audio.`, true)
    return false
  } finally {
    loadingAudio = false
    $('loading').hidden = true
  }
  project.audioPath = path
  contentChanged()
  return true
}

async function importAudio(): Promise<void> {
  if (exporting || loadingAudio) return
  stopRecording()
  const path = await window.kh.pickAudio()
  if (!path) return
  if (await loadAudio(path)) markDirty()
}

async function openProject(): Promise<void> {
  if (exporting || !confirmDiscard()) return
  const opened = await window.kh.openProject()
  if (!opened) return
  let parsed: Project
  try {
    parsed = parseProject(opened.json)
  } catch (err) {
    toast(err instanceof SyntaxError ? 'Soubor projektu je poškozený.' : (err as Error).message, true)
    return
  }
  resetSession(parsed, opened.path)
  void window.kh.clearRecovery()
  await loadProjectAudio(opened.audioPath)
}

async function saveProject(saveAs: boolean): Promise<void> {
  if (exporting) return
  const savedCounter = changeCounter
  const path = await window.kh.saveProject(saveAs ? null : projectPath, serializeProject(project))
  if (!path) return
  projectPath = path
  if (changeCounter === savedCounter) dirty = false
  updateWindowState()
  // Projekt má teď vlastní soubor, záloha neuloženého už není potřeba.
  void window.kh.clearRecovery()
  $('save-status').textContent = `Uloženo ${clockTime()}`
  toast('Projekt uložen.')
}

// ---------- Export ----------

const exportOptions = $<HTMLDialogElement>('export-options')
const exportInputs = {
  resolution: $<HTMLSelectElement>('export-resolution'),
  fps: $<HTMLSelectElement>('export-fps'),
  format: $<HTMLSelectElement>('export-format')
}

function initExportOptions(): void {
  const option = (value: string, label: string): HTMLOptionElement => new Option(label, value)
  exportInputs.resolution.append(...EXPORT_RESOLUTIONS.map((r) => option(`${r.width}x${r.height}`, r.label)))
  exportInputs.fps.append(...EXPORT_FPS.map((fps) => option(String(fps), `${fps} snímků/s`)))
  exportInputs.format.append(...Object.entries(EXPORT_FORMATS).map(([id, format]) => option(id, format.label)))
  $('export-options-cancel').onclick = () => exportOptions.close()
  $('export-go').onclick = () => {
    const [width, height] = exportInputs.resolution.value.split('x').map(Number)
    const next = { width, height, fps: Number(exportInputs.fps.value), format: exportInputs.format.value as ExportFormatId }
    const previous = project.exportSettings
    // Nastavení exportu je součást projektu — příště se nabídne stejné.
    const changed = (Object.keys(next) as (keyof typeof next)[]).some((key) => next[key] !== previous[key])
    project.exportSettings = next
    if (changed) markDirty()
    exportOptions.close()
    void runExport()
  }
}

/** Export začíná volbou rozlišení, snímkové frekvence a formátu. */
async function openExportOptions(): Promise<void> {
  if (exporting || exportOptions.open) return
  stopRecording()
  audio.pause()
  updateControls()
  // Na celé obrazovce je kurzor zamčený v plátně a dialog exportu by nešel ovládat.
  if (document.fullscreenElement) await document.exitFullscreen()

  if (!audio.hasAudio && projectContentEnd(project) === 0) {
    toast('Není co exportovat — importujte audio nebo něco nahrajte.', true)
    return
  }
  const { width, height, fps, format } = project.exportSettings
  exportInputs.resolution.value = `${width}x${height}`
  exportInputs.fps.value = String(fps)
  exportInputs.format.value = format
  const hidden = project.layers.filter((l) => !l.visible).length
  $('export-hidden-note').textContent = hidden > 0 ? `Skryté vrstvy (${hidden}) ve videu nebudou.` : ''
  exportOptions.showModal()
}

async function runExport(): Promise<void> {
  if (exporting) return
  const duration = audio.hasAudio ? audio.duration : projectContentEnd(project) + 0.5
  const { format } = project.exportSettings
  const baseName = projectPath ? fileName(projectPath).replace(/\.[^.]+$/, '') : 'vizualizace'
  const outPath = await window.kh.pickExportPath(`${baseName}.${EXPORT_FORMATS[format].extension}`, format)
  if (!outPath) return

  const dialog = $<HTMLDialogElement>('export-dialog')
  const status = $('export-status')
  const progress = $<HTMLProgressElement>('export-progress')
  const cancelButton = $<HTMLButtonElement>('export-cancel')
  const showButton = $<HTMLButtonElement>('export-show')
  let cancelled = false
  exporting = true
  progress.value = 0
  status.textContent = 'Připravuji…'
  showButton.hidden = true
  cancelButton.textContent = 'Zrušit'
  cancelButton.onclick = () => (cancelled = true)
  dialog.showModal()

  const startedAt = performance.now()
  const outcome = await exportVideo({
    // Chybějící audio soubor se do videa přimíchat nedá.
    project: { ...project, audioPath: audio.hasAudio ? project.audioPath : null },
    outPath,
    duration,
    isCancelled: () => cancelled,
    onProgress: (done, total) => {
      progress.value = done / total
      const elapsed = (performance.now() - startedAt) / 1000
      const remaining = Math.ceil((elapsed / done) * (total - done))
      status.textContent = `Snímek ${done} / ${total} — zbývá přibližně ${formatTime(remaining).slice(0, -2)}`
    }
  })
  exporting = false

  if (outcome.status === 'cancelled') {
    dialog.close()
    toast('Export zrušen.')
    return
  }
  if (outcome.status === 'error') {
    status.textContent = `Export selhal: ${outcome.message}`
  } else {
    progress.value = 1
    status.textContent = `Hotovo: ${outPath}`
    showButton.hidden = false
    showButton.onclick = () => window.kh.showInFolder(outPath)
  }
  cancelButton.textContent = 'Zavřít'
  cancelButton.onclick = () => dialog.close()
}

// ---------- Inicializace ----------

function fitStage(): void {
  const wrap = $('stage-wrap')
  // Na celé obrazovce plátno vyplní maximum plochy (se zachováním poměru stran), jinak má okraj.
  const margin = document.fullscreenElement ? 0 : 32
  const availableWidth = wrap.clientWidth - margin
  const availableHeight = wrap.clientHeight - margin
  const width = Math.max(Math.min(availableWidth, (availableHeight * STAGE_WIDTH) / STAGE_HEIGHT), 160)
  const height = (width * STAGE_HEIGHT) / STAGE_WIDTH
  stage.style.width = `${width}px`
  stage.style.height = `${height}px`
  const dpr = window.devicePixelRatio || 1
  renderer.resize(Math.round(width * dpr), Math.round(height * dpr))
}

/** Plátno přes celou obrazovku: skryje se veškeré ovládání, klávesové zkratky fungují dál. */
function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen()
}

function initFullscreen(): void {
  document.addEventListener('fullscreenchange', () => {
    const on = document.fullscreenElement !== null
    document.body.classList.toggle('fullscreen', on)
    fitStage()
    if (on) {
      toast('Celá obrazovka — ukončíte ji klávesou Esc nebo F11. R nahrává, mezerník přehrává.')
      // Zamknout kurzor do plátna, aby při kreslení neodjel na druhý monitor.
      if (lastPointer) Object.assign(lockedPointer, lastPointer)
      void Promise.resolve(stage.requestPointerLock()).catch(() => {})
    } else if (document.pointerLockElement) {
      document.exitPointerLock()
    }
  })
  document.addEventListener('pointerlockchange', () => {
    showLockedCursor()
    // Zámek zrušil Esc nebo přepnutí do jiného okna — bez něj by kurzor mohl z plátna utéct,
    // takže končí i celá obrazovka.
    if (!pointerLocked() && document.fullscreenElement) void document.exitFullscreen()
  })
}

function initButtons(): void {
  // Tlačítka nepřebírají fokus, aby mezerník vždy ovládal přehrávání a ne naposledy kliknuté tlačítko.
  document.addEventListener('mousedown', (e) => {
    if ((e.target as Element).closest('button')) e.preventDefault()
  })
  $('btn-new').onclick = newProject
  $('btn-open').onclick = () => void openProject()
  $('btn-save').onclick = () => void saveProject(false)
  $('btn-save-as').onclick = () => void saveProject(true)
  $('btn-import').onclick = () => void importAudio()
  $('btn-export').onclick = () => void openExportOptions()
  $('btn-start').onclick = goToStart
  $('btn-play').onclick = () => void togglePlay()
  $('btn-record').onclick = toggleRecording
  $('btn-fullscreen').onclick = toggleFullscreen
  $('btn-undo').onclick = undo
  $('btn-redo').onclick = redo
  $('btn-clear').onclick = clearLayer
  $('btn-zoom-in').onclick = () => timeline.zoomBy(2)
  $('btn-zoom-out').onclick = () => timeline.zoomBy(0.5)
  $('btn-zoom-fit').onclick = () => timeline.resetZoom()
  $('btn-layer-add').onclick = addLayer
  $('btn-layer-delete').onclick = deleteLayer

  const solo = $<HTMLInputElement>('solo-recording')
  solo.addEventListener('change', () => {
    soloWhileRecording = solo.checked
    solo.blur()
  })

  const volume = $<HTMLInputElement>('volume')
  volume.addEventListener('input', () => (audio.volume = Number(volume.value)))
  volume.addEventListener('change', () => volume.blur())

  // Během exportu nejde dialog zavřít klávesou Esc.
  $('export-dialog').addEventListener('cancel', (e) => {
    if (exporting) e.preventDefault()
  })
}

function initKeyboard(): void {
  window.addEventListener('keydown', (e) => {
    if (exporting || loadingAudio || exportOptions.open) return
    if (e.target instanceof HTMLInputElement && (e.target.type === 'text' || e.target.type === 'number')) return
    const key = e.key.toLowerCase()
    if (e.ctrlKey || e.metaKey) {
      if (key === 's') void saveProject(e.shiftKey)
      else if (key === 'o') void openProject()
      else if (key === 'n') newProject()
      else if (key === 'e') void openExportOptions()
      else if (key === 'c' && editMode) copySelection()
      else if (key === 'v' && editMode) pasteClipboard()
      else if (key === 'z' && !e.shiftKey) undo()
      else if (key === 'y' || (key === 'z' && e.shiftKey)) redo()
      else return
      e.preventDefault()
      return
    }
    if (e.repeat && key !== 'f' && key !== '+' && key !== '-') return
    if (e.code === 'Space') void togglePlay()
    else if (key === 'e') setEditMode(!editMode)
    else if (editMode && (key === 'delete' || key === 'backspace')) editor.deleteSelected()
    else if (editMode && key === 'escape') editor.clear()
    else if (e.code === 'KeyD') setKeyDraw(true, e)
    // T kreslení přepíná natrvalo — pro touchpady, které při držené klávese blokují pohyb kurzoru.
    else if (e.code === 'KeyT') setKeyDraw(!keyDrawHeld, e)
    else if (key === 'r') toggleRecording()
    else if (key === 'f11') toggleFullscreen()
    else if (key === 'f') fireworkAtPointer(e.repeat)
    else if (key === 'home') goToStart()
    else if (key === 'arrowup') selectNeighbourLayer(-1)
    else if (key === 'arrowdown') selectNeighbourLayer(1)
    else if (key === '+') timeline.zoomBy(2)
    else if (key === '-') timeline.zoomBy(0.5)
    else return
    e.preventDefault()
  })
}

function frame(): void {
  // Skladba dohrála do konce — nahrávání končí s ní.
  if (recording && !audio.playing) stopRecording()

  const now = wallTime()
  scratch.style = layer().style
  pruneScratch(now)

  if (!exporting) {
    const time = audio.time
    // Ostatní vrstvy se při nahrávání přehrávají jako reference, pokud si je uživatel neschoval.
    const shown = recording && soloWhileRecording ? [layer()] : project.layers
    renderer.render([...layersAt(shown, time), { layer: scratch, time: now }])
    if (editMode) editor.draw(stageCtx, stage.width / STAGE_WIDTH, hitRadius() / 10)
    timeline.draw()
    const zoom = timeline.zoomLevel
    const zoomText = `${Number.isInteger(zoom) ? zoom : zoom.toFixed(1)}×`
    if ($('zoom-label').textContent !== zoomText) $('zoom-label').textContent = zoomText
    const total = audio.hasAudio ? formatTime(audio.duration) : '–:––'
    $('time').textContent = `${formatTime(time)} / ${total}`
  }
  requestAnimationFrame(frame)
}

audio.onEnded = updateControls
new ResizeObserver(fitStage).observe($('stage-wrap'))
initPanel()
initButtons()
initEditPanel()
initExportOptions()
initStageInput()
initKeyboard()
initFullscreen()
syncPanel()
updateControls()
updateWindowState()
fitStage()
requestAnimationFrame(frame)
void offerRecovery()
