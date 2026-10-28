import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { exporter } from '../src/main/exporter'
import { EXPORT_FORMATS, type ExportFormatId } from '../src/shared/types'

const ffmpeg = ffmpegStatic as unknown as string
const FPS = 25
const FRAMES = 10 // 0,4 s videa, stejně dlouhé jako audio
const SIZES = [
  { width: 1280, height: 720 },
  { width: 3840, height: 2160 }
]
const EXPECTED_CODEC: Record<ExportFormatId, string> = {
  'mp4-h264': 'h264',
  'mp4-h265': 'hevc',
  'webm-vp9': 'vp9',
  'mov-prores': 'prores'
}

/** `ffmpeg -i` bez výstupu vypíše info o souboru na stderr (ffprobe v ffmpeg-static není). */
function probe(file: string): string {
  return spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' }).stderr
}

let dir: string
let audioPath: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'kh-export-'))
  audioPath = join(dir, 'tone.wav')
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.4', audioPath])
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('export formátů', () => {
  for (const format of Object.keys(EXPORT_FORMATS) as ExportFormatId[]) {
    for (const { width, height } of SIZES) {
      it(`${format} ${width}×${height}`, async () => {
        const outPath = join(dir, `${format}-${width}.${EXPORT_FORMATS[format].extension}`)
        expect(exporter.start({ format, width, height, fps: FPS, audioPath, outPath })).toEqual({ ok: true })
        const frame = new Uint8Array(width * height * 4)
        for (let i = 0; i < FRAMES; i++) {
          frame.fill(i * 20, 0, frame.length)
          for (let p = 3; p < frame.length; p += 4) frame[p] = 255
          const result = await exporter.frame(frame)
          expect(result).toEqual({ ok: true })
        }
        expect(await exporter.finish()).toEqual({ ok: true })

        expect(statSync(outPath).size).toBeGreaterThan(0)
        const info = probe(outPath)
        expect(info).toMatch(new RegExp(`Video: ${EXPECTED_CODEC[format]}[ ,]`))
        expect(info).toContain(`${width}x${height}`)
        expect(info).toMatch(new RegExp(`${FPS} fps`))
        expect(info).toMatch(/Audio: /)
        const duration = /Duration: (\d+):(\d+):([\d.]+)/.exec(info)
        expect(duration).not.toBeNull()
        const seconds = Number(duration![1]) * 3600 + Number(duration![2]) * 60 + Number(duration![3])
        expect(seconds).toBeGreaterThan(0.3)
        expect(seconds).toBeLessThan(0.6)
      }, 120_000)
    }
  }
})
