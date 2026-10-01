export type Rgb = readonly [number, number, number]

export function parseHexColor(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return [255, 255, 255]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Barva ztlumená směrem k černé. Pozadí je vždy černé, takže průhlednost jde nahradit
 * neprůhlednou tmavší barvou — to umožňuje skládat překrývající se úseky bez artefaktů.
 */
export function dimmed(color: Rgb, intensity: number): string {
  return `rgb(${Math.round(color[0] * intensity)},${Math.round(color[1] * intensity)},${Math.round(color[2] * intensity)})`
}

export function mixWithWhite(color: Rgb, amount: number): Rgb {
  return [
    color[0] + (255 - color[0]) * amount,
    color[1] + (255 - color[1]) * amount,
    color[2] + (255 - color[2]) * amount
  ]
}
