import { STAGE_WIDTH, type Layer } from '../../../shared/types'
import { parseHexColor } from './color'
import { drawFirework } from './fireworks'
import { drawStroke } from './stroke'

/** Poloměr rozostření záře v logických px. */
const GLOW_BLUR = 14
/** Záře se rozostřuje ve zmenšeném rozlišení — na měkké záři to není vidět a je to mnohonásobně rychlejší. */
const GLOW_DOWNSCALE = 4

export interface LayerAtTime {
  layer: Layer
  time: number
}

/** Vrstvy v čase skladby `time` — každá ve svém vlastním čase podle posunu vrstvy. */
export const layersAt = (layers: Layer[], time: number): LayerAtTime[] =>
  layers.map((layer) => ({ layer, time: time - layer.offset }))

/**
 * Vykresluje scénu jako čistou funkci (vrstvy, čas). Stejná třída obsluhuje živý náhled
 * i export — liší se jen cílovým canvasem, takže export vypadá přesně jako náhled.
 */
export class SceneRenderer {
  readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly scratch: HTMLCanvasElement
  private readonly scratchCtx: CanvasRenderingContext2D
  private readonly glow: HTMLCanvasElement
  private readonly glowCtx: CanvasRenderingContext2D

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.scratch = document.createElement('canvas')
    this.glow = document.createElement('canvas')
    // Softwarové vykreslování (willReadFrequently): stovky krátkých úseků s režimem 'lighten'
    // jsou na GPU canvasu ~3× pomalejší a export navíc čte pixely zpět každý snímek.
    const options: CanvasRenderingContext2DSettings = { alpha: false, willReadFrequently: true }
    this.ctx = canvas.getContext('2d', options)!
    this.scratchCtx = this.scratch.getContext('2d', options)!
    this.glowCtx = this.glow.getContext('2d', options)!
    this.resize(canvas.width, canvas.height)
  }

  resize(pixelWidth: number, pixelHeight: number): void {
    const setSize = (c: HTMLCanvasElement, width: number, height: number): void => {
      if (c.width !== width) c.width = width
      if (c.height !== height) c.height = height
    }
    setSize(this.canvas, pixelWidth, pixelHeight)
    setSize(this.scratch, pixelWidth, pixelHeight)
    setSize(this.glow, Math.ceil(pixelWidth / GLOW_DOWNSCALE), Math.ceil(pixelHeight / GLOW_DOWNSCALE))
  }

  render(items: LayerAtTime[]): void {
    const { ctx, canvas } = this
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.filter = 'none'
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    for (const { layer, time } of items) {
      if (layer.visible) this.renderLayer(layer, time)
    }
  }

  getImageData(): ImageData {
    return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height)
  }

  private renderLayer(layer: Layer, time: number): void {
    const { ctx, scratchCtx: s, scratch, glow, glowCtx } = this
    const scale = scratch.width / STAGE_WIDTH
    const { style } = layer

    s.setTransform(1, 0, 0, 1, 0, 0)
    s.globalCompositeOperation = 'source-over'
    s.fillStyle = '#000'
    s.fillRect(0, 0, scratch.width, scratch.height)
    s.setTransform(scale, 0, 0, scale, 0, 0)

    let drawn = false
    // 'lighten' = maximum po kanálech: překryvy sousedních úseků tahu se nesčítají do světlých skvrn.
    s.globalCompositeOperation = 'lighten'
    const lineColor = parseHexColor(style.lineColor)
    for (const stroke of layer.strokes) {
      if (drawStroke(s, stroke, style, lineColor, time)) drawn = true
    }
    const fireworkColor = parseHexColor(style.fireworkColor)
    for (const fw of layer.fireworks) {
      if (drawFirework(s, fw, style, fireworkColor, time)) drawn = true
    }
    if (!drawn) return

    // Vrstvy se na černém pozadí sčítají; záře je rozostřená kopie téže vrstvy.
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 1
    ctx.drawImage(scratch, 0, 0)
    if (style.glow > 0) {
      glowCtx.globalCompositeOperation = 'copy'
      glowCtx.filter = `blur(${(GLOW_BLUR * scale) / GLOW_DOWNSCALE}px)`
      glowCtx.drawImage(scratch, 0, 0, glow.width, glow.height)
      ctx.globalAlpha = style.glow
      ctx.drawImage(glow, 0, 0, scratch.width, scratch.height)
      ctx.globalAlpha = 1
    }
  }
}
