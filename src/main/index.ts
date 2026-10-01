import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { existsSync, rmSync } from 'node:fs'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { PROJECT_EXTENSION, type FileProject } from '../shared/project'
import type { ExportStartOptions, OpenedProject } from '../shared/types'
import { exporter } from './exporter'

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus']

let mainWindow: BrowserWindow | null = null
let dirty = false

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: '#0b0c0f',
    title: 'Kreslení hudby',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  mainWindow = win
  win.once('ready-to-show', () => win.show())

  win.on('close', (event) => {
    if (!dirty) return
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      message: 'Projekt obsahuje neuložené změny.',
      detail: 'Pokud aplikaci zavřete, změny se ztratí.',
      buttons: ['Zavřít bez uložení', 'Zrušit'],
      defaultId: 1,
      cancelId: 1
    })
    if (choice === 1) event.preventDefault()
    // Uživatel změny vědomě zahodil — záloha by se mu při příštím spuštění nabízela zbytečně.
    else rmSync(recoveryPath(), { force: true })
  })
  win.on('closed', () => {
    mainWindow = null
    void exporter.cancel()
  })

  // Aplikace nemá nativní menu; vývojářské nástroje zůstávají dostupné přes F12.
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools()
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

async function readAudio(path: string): Promise<ArrayBuffer | null> {
  try {
    const buf = await readFile(path)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  } catch {
    return null
  }
}

const recoveryPath = (): string => join(app.getPath('userData'), `neulozeny-projekt.${PROJECT_EXTENSION}`)

/** Audio se hledá nejdřív relativně k projektu (přežije přesun celé složky), pak na původní cestě. */
function locateAudio(json: string, projectPath: string): string | null {
  try {
    const audio = (JSON.parse(json) as Partial<FileProject>).audio
    if (!audio) return null
    const candidates = [audio.relativePath && resolve(dirname(projectPath), audio.relativePath), audio.path]
    return candidates.find((p): p is string => !!p && existsSync(p)) ?? null
  } catch {
    // Neplatný JSON ohlásí renderer při parsování.
    return null
  }
}

let pendingWrite: Promise<void> = Promise.resolve()

/**
 * Zápis přes dočasný soubor a přejmenování: automatické ukládání běží často a pád uprostřed
 * zápisu nesmí zničit dosavadní projekt. Zápisy jdou za sebou, aby se nepředbíhaly.
 */
function writeFileSafely(path: string, content: string): Promise<void> {
  const write = pendingWrite.then(async () => {
    const temp = `${path}.tmp`
    await writeFile(temp, content, 'utf8')
    await rename(temp, path)
  })
  pendingWrite = write.catch(() => {})
  return write
}

function registerIpc(): void {
  ipcMain.handle('audio:pick', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Importovat audio',
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS }]
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('audio:read', (_e, path: string) => readAudio(path))

  ipcMain.handle('project:open', async (): Promise<OpenedProject | null> => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Otevřít projekt',
      properties: ['openFile'],
      filters: [{ name: 'Projekt Kreslení hudby', extensions: [PROJECT_EXTENSION] }]
    })
    const path = result.filePaths[0]
    if (result.canceled || !path) return null
    const json = await readFile(path, 'utf8')
    return { path, json, audioPath: locateAudio(json, path) }
  })

  ipcMain.handle('recovery:save', (_e, json: string) => writeFileSafely(recoveryPath(), json))
  ipcMain.handle('recovery:load', async () => {
    try {
      const json = await readFile(recoveryPath(), 'utf8')
      return { json, audioPath: locateAudio(json, recoveryPath()) }
    } catch {
      return null
    }
  })
  ipcMain.handle('recovery:clear', () => rm(recoveryPath(), { force: true }))

  ipcMain.handle('project:save', async (_e, path: string | null, json: string): Promise<string | null> => {
    let target = path
    if (!target) {
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: 'Uložit projekt',
        defaultPath: `projekt.${PROJECT_EXTENSION}`,
        filters: [{ name: 'Projekt Kreslení hudby', extensions: [PROJECT_EXTENSION] }]
      })
      if (result.canceled || !result.filePath) return null
      target = result.filePath
    }
    const file = JSON.parse(json) as FileProject
    if (file.audio) file.audio.relativePath = relative(dirname(target), file.audio.path)
    await writeFileSafely(target, JSON.stringify(file))
    return target
  })

  ipcMain.handle('export:pickPath', async (_e, defaultName: string): Promise<string | null> => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Exportovat video',
      defaultPath: defaultName,
      filters: [{ name: 'Video MP4', extensions: ['mp4'] }]
    })
    return result.canceled || !result.filePath ? null : result.filePath
  })

  ipcMain.handle('export:start', (_e, options: ExportStartOptions) => exporter.start(options))
  ipcMain.handle('export:frame', (_e, rgba: Uint8Array) => exporter.frame(rgba))
  ipcMain.handle('export:finish', () => exporter.finish())
  ipcMain.handle('export:cancel', () => exporter.cancel())

  ipcMain.on('shell:showInFolder', (_e, path: string) => shell.showItemInFolder(path))
  ipcMain.on('window:state', (_e, state: { title: string; dirty: boolean }) => {
    dirty = state.dirty
    mainWindow?.setTitle(state.title)
  })
}

void app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  registerIpc()
  createWindow()
})

app.on('window-all-closed', () => app.quit())
