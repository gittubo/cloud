// The development and its residence schedule.
// Figures marked PLACEHOLDER are illustrative — this is a concept site.

export type Status = 'available' | 'reserved' | 'sold'
export type PlanId = 'one' | 'two' | 'three'

export interface Unit {
  code: string
  floor: number
  /** 1–3, left to right across the facade in the tower render. */
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

/** Residential floors, as counted on the tower render (the lobby is below floor 1). */
export const FLOORS = 20

// The three residences on each floor. PLACEHOLDER areas and mixes.
export const slots = [
  { slot: 1, beds: 2, area: 104.2, plan: 'two' as PlanId, facing: 'West · city & sea' },
  { slot: 2, beds: 3, area: 142.55, plan: 'three' as PlanId, facing: 'Sea' },
  { slot: 3, beds: 1, area: 68.4, plan: 'one' as PlanId, facing: 'East · sea' },
]

/** Small deterministic hash, so the same homes show as sold on every visit. */
function rand(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return ((h >>> 0) % 10000) / 10000
}

// PLACEHOLDER availability — generated, not a live sales position.
function statusFor(code: string, floor: number, slot: number): Status {
  const r = rand(code)
  const demand = 0.2 + (slot === 2 ? 0.18 : 0) + floor * 0.008
  if (r < demand) return 'sold'
  if (r < demand + 0.13) return 'reserved'
  return 'available'
}

export const units: Unit[] = Array.from({ length: FLOORS }, (_, i) => i + 1).flatMap((floor) =>
  slots.map((s) => {
    const code = `${String(floor).padStart(2, '0')}0${s.slot}`
    return {
      code,
      floor,
      slot: s.slot,
      beds: s.beds,
      area: Math.round((s.area + (floor % 4) * 0.35) * 100) / 100,
      plan: s.plan,
      facing: s.facing,
      status: statusFor(code, floor, s.slot),
    }
  }),
)

export const statusLabel: Record<Status, string> = { available: 'Available', reserved: 'Reserved', sold: 'Sold' }
export const statusColor: Record<Status, string> = { available: '#2f8cff', reserved: '#f2b632', sold: '#e5484d' }

// Pins on the aerial render, in its pixel coordinates (1344 × 752). PLACEHOLDER notes.
export const places = [
  { name: 'Beach', note: '2 min walk', x: 840, y: 420 },
  { name: 'Marina', note: '6 min walk', x: 1240, y: 330 },
  { name: 'Old Town', note: '8 min walk', x: 240, y: 270 },
  { name: 'Pool & gardens', note: 'Residents only', x: 650, y: 565 },
]

// Project highlights. PLACEHOLDER copy.
export const highlights = [
  { title: 'A sculpted landmark', body: 'Rippling balconies wrap every floor, so each terrace catches the light differently.' },
  { title: 'Frontline sea views', body: 'Every residence looks out over the water, from the bay to the marina.' },
  { title: 'Resort amenities', body: 'Infinity pool, spa, residents’ lounge, gym and landscaped gardens.' },
  { title: 'Built to last', body: 'Low-carbon concrete, triple glazing and solar shading across the façade.' },
]
