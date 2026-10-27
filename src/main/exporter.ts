import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'
import { rm } from 'node:fs/promises'
import ffmpegStatic from 'ffmpeg-static'
import type { ExportFormatId, ExportResult, ExportStartOptions } from '../shared/types'

/** V zabalené aplikaci leží binárka mimo asar archiv. */
const ffmpegPath = (ffmpegStatic as unknown as string | null)?.replace('app.asar', 'app.asar.unpacked') ?? null

/**
 * Výstupní formát = sada argumentů kodéru. Nový formát = nová položka zde a v `EXPORT_FORMATS`
 * (název a přípona); zbytek pipeline (surové snímky na stdin + audio jako druhý vstup) se nemění.
 */
interface OutputFormat {
  videoArgs: string[]
  audioArgs: string[]
  containerArgs: string[]
}

// Převod RGB → YUV v bt709, jinak by barvy v HD přehrávačích lehce ujely.
const toYuv = (pixelFormat: string): string[] => [
  '-vf', `scale=out_color_matrix=bt709:out_range=tv,format=${pixelFormat}`
]
const BT709 = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709']

const FORMATS: Record<ExportFormatId, OutputFormat> = {
  'mp4-h264': {
    videoArgs: [...toYuv('yuv420p'), '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', ...BT709],
    audioArgs: ['-c:a', 'aac', '-b:a', '256k'],
    containerArgs: ['-movflags', '+faststart']
  },
  'mp4-h265': {
    // hvc1: bez této značky H.265 v MP4 nepřehraje QuickTime ani zařízení Apple.
    // log-level: x265 jinak vypisuje statistiky na stderr, odkud se bere text chyby.
    videoArgs: [
      ...toYuv('yuv420p'),
      '-c:v', 'libx265', '-preset', 'medium', '-crf', '20', '-tag:v', 'hvc1', '-x265-params', 'log-level=error',
      ...BT709
    ],
    audioArgs: ['-c:a', 'aac', '-b:a', '256k'],
    containerArgs: ['-movflags', '+faststart']
  },
  'webm-vp9': {
    videoArgs: [
      ...toYuv('yuv420p'),
      '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '24', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1',
      ...BT709
    ],
    audioArgs: ['-c:a', 'libopus', '-b:a', '192k'],
    containerArgs: []
  },
  'mov-prores': {
    videoArgs: [...toYuv('yuv422p10le'), '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', ...BT709],
    audioArgs: ['-c:a', 'pcm_s16le'],
    containerArgs: []
  }
}

function buildArgs(options: ExportStartOptions, format: OutputFormat): string[] {
  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba',
    '-s', `${options.width}x${options.height}`,
    '-r', String(options.fps),
    '-i', 'pipe:0'
  ]
  if (options.audioPath) args.push('-i', options.audioPath, '-map', '0:v:0', '-map', '1:a:0')
  args.push(...format.videoArgs)
  if (options.audioPath) args.push(...format.audioArgs)
  args.push(...format.containerArgs, options.outPath)
  return args
}

class ExportSession {
  private readonly proc: ChildProcessWithoutNullStreams
  private readonly exited: Promise<number | null>
  private stderr = ''
  private failed = false

  constructor(private readonly options: ExportStartOptions) {
    this.proc = spawn(ffmpegPath!, buildArgs(options, FORMATS[options.format]), { windowsHide: true })
    this.proc.stderr.on('data', (chunk: Buffer) => {
      this.stderr = (this.stderr + chunk.toString()).slice(-4000)
    })
    // Když ffmpeg spadne, zápis do stdin skončí EPIPE — chybu ohlásí write()/finish().
    this.proc.stdin.on('error', () => {
      this.failed = true
    })
    this.exited = new Promise((resolve) => {
      this.proc.on('error', (err) => {
        this.stderr += String(err)
        this.failed = true
        resolve(-1)
      })
      this.proc.on('close', (code) => {
        if (code !== 0) this.failed = true
        resolve(code)
      })
    })
  }

  async write(frame: Uint8Array): Promise<ExportResult> {
    const expected = this.options.width * this.options.height * 4
    if (frame.byteLength !== expected) return { ok: false, error: 'Snímek má nesprávnou velikost.' }
    if (this.failed) return this.failure()
    if (!this.proc.stdin.write(frame)) {
      // Backpressure: dokud ffmpeg nestíhá, renderer další snímek neposílá.
      await Promise.race([once(this.proc.stdin, 'drain'), this.exited])
    }
    return this.failed ? this.failure() : { ok: true }
  }

  async finish(): Promise<ExportResult> {
    this.proc.stdin.end()
    const code = await this.exited
    return code === 0 ? { ok: true } : this.failure()
  }

  async cancel(): Promise<void> {
    this.proc.kill()
    await this.exited
    await rm(this.options.outPath, { force: true })
  }

  private failure(): ExportResult {
    return { ok: false, error: this.stderr.trim() || 'ffmpeg skončil s chybou.' }
  }
}

let session: ExportSession | null = null

export const exporter = {
  start(options: ExportStartOptions): ExportResult {
    if (!ffmpegPath) return { ok: false, error: 'Nenalezen ffmpeg (balíček ffmpeg-static).' }
    if (session) return { ok: false, error: 'Export už běží.' }
    if (!(options.format in FORMATS)) return { ok: false, error: 'Neznámý formát exportu.' }
    session = new ExportSession(options)
    return { ok: true }
  },

  async frame(rgba: Uint8Array): Promise<ExportResult> {
    if (!session) return { ok: false, error: 'Export neběží.' }
    const result = await session.write(rgba)
    if (!result.ok) await this.cancel()
    return result
  },

  async finish(): Promise<ExportResult> {
    if (!session) return { ok: false, error: 'Export neběží.' }
    const current = session
    session = null
    return current.finish()
  },

  async cancel(): Promise<void> {
    const current = session
    session = null
    await current?.cancel()
  }
}
