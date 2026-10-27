import type { StrokePoint } from '../../shared/types'

/**
 * Časové okno režimu úprav kolem přehrávací hlavy: od `čas − back` do `čas + ahead` (s).
 * Na plátně je jen to, co v okně leží; zbytek nejde ani chytit.
 */
export interface TimeWindow {
  back: number
  ahead: number
}

/** Výchozí „dopředu“: jak dlouho před svým začátkem je prvek v režimu úprav už vidět (s). */
export const DEFAULT_WINDOW_AHEAD = 1

/** Leží čas `t` (vlastní čas vrstvy s posunem `offset`) v okně kolem času skladby `songTime`? */
export function inWindow(t: number, offset: number, songTime: number, win: TimeWindow): boolean {
  const song = t + offset
  return song >= songTime - win.back && song <= songTime + win.ahead
}

/**
 * Výřez tahu podle okna: indexy prvního a posledního bodu v okně, null když v okně není žádný.
 * Časy bodů tahu neklesají, takže body v okně tvoří jeden souvislý úsek.
 */
export function strokeWindow(
  points: readonly StrokePoint[],
  offset: number,
  songTime: number,
  win: TimeWindow
): { from: number; to: number } | null {
  let from = -1
  let to = -1
  for (let i = 0; i < points.length; i++) {
    if (!inWindow(points[i].t, offset, songTime, win)) continue
    if (from < 0) from = i
    to = i
  }
  return from < 0 ? null : { from, to }
}
