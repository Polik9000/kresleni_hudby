import type { FireworkEvent, LayerStyle } from '../../../shared/types'
import { dimmed, mixWithWhite, type Rgb } from './color'
import type { Ctx2D } from './stroke'

const PARTICLE_COUNT = 110
/** Po této době od výbuchu už není nic vidět. */
export const FIREWORK_LIFETIME = 2.4
const DRAG = 2.4
const GRAVITY = 240
const BASE_SPEED = 900
const FLASH_SECONDS = 0.18
const TAIL_SECONDS = 0.075

/** Malý deterministický PRNG — ohňostroj je čistou funkcí (seed, čas). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Dráha částice s odporem vzduchu a gravitací, v uzavřeném tvaru (žádná simulace po krocích). */
function travel(age: number): { along: number; fall: number } {
  const decay = 1 - Math.exp(-DRAG * age)
  return { along: decay / DRAG, fall: (GRAVITY * (age - decay / DRAG)) / DRAG }
}

export function drawFirework(ctx: Ctx2D, fw: FireworkEvent, style: LayerStyle, color: Rgb, time: number): boolean {
  const age = time - fw.t
  if (age < 0 || age >= FIREWORK_LIFETIME) return false
  const size = style.fireworkSize
  const density = fw.density ?? 1
  const rand = mulberry32(fw.seed)

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'

  if (age < FLASH_SECONDS) {
    const k = (1 - age / FLASH_SECONDS) * density
    const radius = 120 * size * (0.4 + 0.6 * (age / FLASH_SECONDS))
    const gradient = ctx.createRadialGradient(fw.x, fw.y, 0, fw.x, fw.y, radius)
    gradient.addColorStop(0, dimmed(mixWithWhite(color, 0.7), k))
    gradient.addColorStop(1, 'rgb(0,0,0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(fw.x, fw.y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  const now = travel(age)
  const before = travel(Math.max(age - TAIL_SECONDS, 0))
  // Prořídlý ohňostroj = prvních několik částic téže posloupnosti.
  const count = Math.round(PARTICLE_COUNT * density)
  for (let i = 0; i < count; i++) {
    // Pořadí volání rand() se nesmí měnit — určuje vzhled už uložených ohňostrojů.
    const angle = rand() * Math.PI * 2
    const speed = BASE_SPEED * size * (0.08 + 0.92 * Math.sqrt(rand()))
    const life = 1.1 + rand() * (FIREWORK_LIFETIME - 1.1)
    const whiteness = rand() < 0.3 ? 0.65 : 0.1
    const twinklePhase = rand() * Math.PI * 2
    if (age >= life) continue

    const remaining = 1 - age / life
    const twinkle = 0.75 + 0.25 * Math.sin(age * 28 + twinklePhase)
    const intensity = Math.min(remaining * remaining * 1.6, 1) * twinkle
    const dx = Math.cos(angle) * speed
    const dy = Math.sin(angle) * speed
    const x = fw.x + dx * now.along
    const y = fw.y + dy * now.along + now.fall * size
    const tailX = fw.x + dx * before.along
    const tailY = fw.y + dy * before.along + before.fall * size

    ctx.strokeStyle = dimmed(mixWithWhite(color, whiteness), intensity)
    ctx.lineWidth = Math.max(3.2 * size * (0.4 + 0.6 * remaining), 0.8)
    ctx.beginPath()
    ctx.moveTo(tailX, tailY)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  ctx.restore()
  return true
}
