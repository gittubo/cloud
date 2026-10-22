// The development: towers, floor shapes and the residence schedule.
// Figures marked PLACEHOLDER are illustrative until Tubo Residences supplies
// the real sales schedule — replace them before launch.

export type Status = 'available' | 'reserved' | 'sold'
export type PlanId = 'one' | 'two' | 'three'

export interface Tower {
  id: 'A' | 'B'
  name: string
  /** Centre of the footprint on the ground (metres). */
  x: number
  z: number
  /** Residential floors above the lobby. */
  floors: number
  /** Semi-axes of the floor ellipse (metres). */
  rx: number
  rz: number
  /** Phase of the balcony wave, so the two towers ripple differently. */
  phase: number
}

export interface Unit {
  code: string
  tower: Tower
  floor: number
  /** 1–4, the quarter of the floor plate the residence occupies. */
  slot: number
  beds: number
  area: number
  plan: PlanId
  facing: string
  status: Status
}

export const brand = {
  name: 'Tubo Residences',
  tagline: 'Life above the sea',
  // PLACEHOLDER — the sales team's real address goes here.
  salesEmail: 'sales@tuboresidences.example',
  price: 'Price on request',
}

/** Storey height, floor to floor (metres). */
export const FLOOR_H = 3.3
/** The lobby is double height; residences start above it. */
export const LOBBY_H = 6

export const towers: Tower[] = [
  { id: 'A', name: 'Tower A', x: -17, z: 2, floors: 24, rx: 14, rz: 10.5, phase: 0 },
  { id: 'B', name: 'Tower B', x: 24, z: -10, floors: 18, rx: 12, rz: 9.5, phase: 2.1 },
]

/** Height of the slab under residential floor `floor` (1-based). */
export const floorBase = (floor: number) => LOBBY_H + (floor - 1) * FLOOR_H

/**
 * Radius of the floor ellipse at angle `a` (radians, 0 = east, π/2 = towards
 * the sea). The glass line sits on this ellipse.
 */
export function ellipseR(t: Tower, a: number): number {
  const c = Math.cos(a) / t.rx
  const s = Math.sin(a) / t.rz
  return 1 / Math.sqrt(c * c + s * s)
}

/** Outer edge of the balcony slab: the ellipse, rippling floor by floor. */
export function slabR(t: Tower, floor: number, a: number): number {
  const wave = 0.16 + 0.11 * Math.sin(3 * a + floor * 0.42 + t.phase) + 0.05 * Math.sin(5 * a - floor * 0.27)
  return ellipseR(t, a) * (1 + Math.max(0.06, wave))
}

// The four residences on each floor, by the direction they face.
// Slot 1 looks straight out to sea. PLACEHOLDER areas and mixes.
export const slots = [
  { slot: 1, centre: Math.PI / 2, beds: 3, area: 142.55, plan: 'three' as PlanId, facing: 'Sea' },
  { slot: 2, centre: 0, beds: 2, area: 104.2, plan: 'two' as PlanId, facing: 'East · sea' },
  { slot: 3, centre: -Math.PI / 2, beds: 1, area: 68.4, plan: 'one' as PlanId, facing: 'City' },
  { slot: 4, centre: Math.PI, beds: 2, area: 98.7, plan: 'two' as PlanId, facing: 'West · sea' },
]
export const SLOT_SPAN = Math.PI / 2

/** Small deterministic hash, so the same suites show as sold on every visit. */
function rand(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10000) / 10000
}

// PLACEHOLDER availability — generated, not the live sales position.
function statusFor(code: string, floor: number, slot: number): Status {
  const r = rand(code)
  const demand = 0.22 + (slot === 1 ? 0.18 : 0) + floor * 0.006
  if (r < demand) return 'sold'
  if (r < demand + 0.13) return 'reserved'
  return 'available'
}

export const units: Unit[] = towers.flatMap((tower) =>
  Array.from({ length: tower.floors }, (_, i) => i + 1).flatMap((floor) =>
    slots.map((s) => {
      const code = `${tower.id}${String(floor).padStart(2, '0')}0${s.slot}`
      return {
        code,
        tower,
        floor,
        slot: s.slot,
        beds: s.beds,
        area: Math.round((s.area + (floor % 4) * 0.35) * 100) / 100,
        plan: s.plan,
        facing: s.facing,
        status: statusFor(code, floor, s.slot),
      }
    }),
  ),
)

export const statusLabel: Record<Status, string> = { available: 'Available', reserved: 'Reserved', sold: 'Sold' }
export const statusColor: Record<Status, string> = { available: '#2f8cff', reserved: '#f2b632', sold: '#e5484d' }

// Points of interest for the Location view (metres from the site). PLACEHOLDER.
export const places = [
  { name: 'Beach', note: '2 min walk', x: 30, z: -125 },
  { name: 'Marina', note: '6 min walk', x: -260, z: -110 },
  { name: 'Old Town', note: '10 min drive', x: 320, z: 380 },
  { name: 'International School', note: '8 min drive', x: -330, z: 300 },
  { name: 'Central Park', note: '5 min walk', x: 140, z: 150 },
]

// Project highlights. PLACEHOLDER copy.
export const highlights = [
  { title: 'Two sculpted towers', body: 'Rippling balconies on every floor, so no two terraces are quite the same.' },
  { title: 'Frontline sea views', body: 'Every residence looks out over the water, from the bay to the marina.' },
  { title: 'Resort amenities', body: 'Infinity pool, spa, residents’ lounge, gym and landscaped gardens.' },
  { title: 'Built to last', body: 'Low-carbon concrete, triple glazing and solar shading across the façade.' },
]
