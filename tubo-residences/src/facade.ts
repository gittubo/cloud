// Where each residence sits on the tower render, in the render's pixel
// coordinates (1344 × 752). The balcony slabs were measured on
// public/renders/tower-day.jpg; the overcast and night renders are edits of
// it and line up to within a few pixels.
import { FLOORS, type Unit } from './data'

export const RENDER_W = 1344
export const RENDER_H = 752

// y of each balcony slab, top (roof) to bottom (above the lobby), sampled at
// three x positions: the slabs ripple, so they dip towards the middle.
const SLAB_LEFT = [82, 113, 142, 171, 199, 228, 255, 283, 311, 340, 367, 395, 424, 452, 482, 511, 539, 568, 596, 625, 654]
const SLAB_MID = [93, 124, 153, 180, 207, 235, 262, 290, 316, 344, 371, 398, 425, 454, 482, 509, 536, 564, 592, 620, 649]
const SLAB_RIGHT = [83, 115, 144, 172, 200, 228, 256, 284, 311, 340, 369, 396, 425, 454, 482, 511, 538, 568, 596, 623, 652]
const X_LEFT = 575
const X_MID = 635
const X_RIGHT = 735

/** Outer edges of the balconies and the column lines between residences. */
const EDGES = [533, 612, 700, 779]

/** y of slab `i` at x: a parabola through the three measured points, held flat past them. */
function slabY(i: number, x: number): number {
  const [x0, x1, x2] = [X_LEFT, X_MID, X_RIGHT]
  const xc = Math.max(x0 - 30, Math.min(x2 + 30, x))
  const [y0, y1, y2] = [SLAB_LEFT[i], SLAB_MID[i], SLAB_RIGHT[i]]
  const l0 = ((xc - x1) * (xc - x2)) / ((x0 - x1) * (x0 - x2))
  const l1 = ((xc - x0) * (xc - x2)) / ((x1 - x0) * (x1 - x2))
  const l2 = ((xc - x0) * (xc - x1)) / ((x2 - x0) * (x2 - x1))
  return y0 * l0 + y1 * l1 + y2 * l2
}

/** SVG polygon points for a residence: from under its own slab down to the next. */
export function unitPoints(u: Pick<Unit, 'floor' | 'slot'>): string {
  const top = FLOORS - u.floor // slab index above this floor
  const x0 = EDGES[u.slot - 1] + 2
  const x1 = EDGES[u.slot] - 2
  const steps = 8
  const xs = Array.from({ length: steps + 1 }, (_, k) => x0 + ((x1 - x0) * k) / steps)
  const upper = xs.map((x) => `${x.toFixed(1)},${(slabY(top, x) + 6).toFixed(1)}`)
  const lower = [...xs].reverse().map((x) => `${x.toFixed(1)},${(slabY(top + 1, x) - 2).toFixed(1)}`)
  return [...upper, ...lower].join(' ')
}

/** Centre of a residence on the render. */
export function unitCentre(u: Pick<Unit, 'floor' | 'slot'>): { x: number; y: number } {
  const top = FLOORS - u.floor
  const x = (EDGES[u.slot - 1] + EDGES[u.slot]) / 2
  return { x, y: (slabY(top, x) + slabY(top + 1, x)) / 2 + 2 }
}

/** The tower in the aerial render: where the Location view zooms in, and its pin. */
export const AERIAL_TOWER = { x: 615, y: 345 }
export const AERIAL_TOWER_PIN = { x: 615, y: 168 }
