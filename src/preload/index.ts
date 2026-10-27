import { contextBridge, ipcRenderer } from 'electron'
import type { KhApi } from '../shared/types'

const api: KhApi = {
  pickAudio: () => ipcRenderer.invoke('audio:pick'),
  readAudio: (path) => ipcRenderer.invoke('audio:read', path),
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (path, json) => ipcRenderer.invoke('project:save', path, json),
  saveRecovery: (json) => ipcRenderer.invoke('recovery:save', json),
  loadRecovery: () => ipcRenderer.invoke('recovery:load'),
  clearRecovery: () => ipcRenderer.invoke('recovery:clear'),
  pickExportPath: (defaultName, format) => ipcRenderer.invoke('export:pickPath', defaultName, format),
  exportStart: (options) => ipcRenderer.invoke('export:start', options),
  exportFrame: (rgba) => ipcRenderer.invoke('export:frame', rgba),
  exportFinish: () => ipcRenderer.invoke('export:finish'),
  exportCancel: () => ipcRenderer.invoke('export:cancel'),
  showInFolder: (path) => ipcRenderer.send('shell:showInFolder', path),
  setWindowState: (state) => ipcRenderer.send('window:state', state)
}

contextBridge.exposeInMainWorld('kh', api)
