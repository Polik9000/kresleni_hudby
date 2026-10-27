import type { ExportResult, Project } from '../../shared/types'
import { layersAt, SceneRenderer } from './render/scene'

/** Kolik snímků (každý ~8 MB při 1080p, ~33 MB ve 4K) smí zároveň čekat na převzetí hlavním procesem. */
const MAX_FRAMES_IN_FLIGHT = 3

export interface ExportJob {
  project: Project
  outPath: string
  /** Délka výsledného videa v sekundách. */
  duration: number
  onProgress(done: number, total: number): void
  isCancelled(): boolean
}

export type ExportOutcome = { status: 'done' } | { status: 'cancelled' } | { status: 'error'; message: string }

/**
 * Deterministický export: každý snímek se vykreslí pro přesný čas i/fps (nezávisle na tom,
 * jak rychle počítač stíhá) a jako surová RGBA data se pošle do ffmpeg v hlavním procesu.
 */
export async function exportVideo(job: ExportJob): Promise<ExportOutcome> {
  const { project, outPath, duration } = job
  const { width, height, fps, format } = project.exportSettings

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const renderer = new SceneRenderer(canvas)

  const started = await window.kh.exportStart({ outPath, audioPath: project.audioPath, width, height, fps, format })
  if (!started.ok) return { status: 'error', message: started.error ?? 'Export se nepodařilo spustit.' }

  // Předání snímku hlavnímu procesu trvá déle než jeho vykreslení, proto se nečeká na každý
  // zvlášť: několik snímků je na cestě současně (pořadí IPC zpráv je zaručené).
  const inFlight: Promise<ExportResult>[] = []
  let failure: string | null = null
  const settleOldest = async (): Promise<void> => {
    const result = await inFlight.shift()!
    if (!result.ok) failure ??= result.error ?? 'Zápis snímku selhal.'
  }

  const total = Math.max(Math.ceil(duration * fps), 1)
  for (let i = 0; i < total && failure === null; i++) {
    if (job.isCancelled()) {
      await Promise.all(inFlight)
      await window.kh.exportCancel()
      return { status: 'cancelled' }
    }
    const time = i / fps
    renderer.render(layersAt(project.layers, time))
    const pixels = renderer.getImageData().data
    inFlight.push(window.kh.exportFrame(new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength)))
    if (inFlight.length >= MAX_FRAMES_IN_FLIGHT) await settleOldest()
    job.onProgress(i + 1, total)
  }
  while (inFlight.length > 0) await settleOldest()
  // Při chybě zápisu hlavní proces export už sám ukončil.
  if (failure !== null) return { status: 'error', message: failure }

  const finished = await window.kh.exportFinish()
  if (!finished.ok) return { status: 'error', message: finished.error ?? 'Dokončení videa selhalo.' }
  return { status: 'done' }
}
