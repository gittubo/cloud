// Floor plans as SVG: the residence layouts, the key plan of the floor and
// a downloadable sheet. Layouts are PLACEHOLDER drawings until the
// architect's plans are supplied.
import { brand, slots, type PlanId, type Unit } from './data'

type Room = { x: number; y: number; w: number; h: number; name: string; kind: 'living' | 'bed' | 'master' | 'bath' | 'kitchen' | 'entry' | 'balcony' }

// Metres; the facade (and the balcony) is along the bottom edge.
const layouts: Record<PlanId, { w: number; d: number; rooms: Room[] }> = {
  one: {
    w: 10,
    d: 8.6,
    rooms: [
      { x: 0, y: 0, w: 6, h: 6.8, name: 'Living · Kitchen', kind: 'living' },
      { x: 6, y: 2.8, w: 4, h: 4, name: 'Bedroom', kind: 'master' },
      { x: 6, y: 0, w: 2.4, h: 2.8, name: 'Bath', kind: 'bath' },
      { x: 8.4, y: 0, w: 1.6, h: 2.8, name: 'Entry', kind: 'entry' },
      { x: 0, y: 6.8, w: 10, h: 1.8, name: 'Balcony', kind: 'balcony' },
    ],
  },
  two: {
    w: 14,
    d: 9.5,
    rooms: [
      { x: 0, y: 0, w: 6.6, h: 7.6, name: 'Living · Dining', kind: 'living' },
      { x: 6.6, y: 3.4, w: 4, h: 4.2, name: 'Main bedroom', kind: 'master' },
      { x: 10.6, y: 3.4, w: 3.4, h: 4.2, name: 'Bedroom 2', kind: 'bed' },
      { x: 6.6, y: 0, w: 2.6, h: 3.4, name: 'Kitchen', kind: 'kitchen' },
      { x: 9.2, y: 0, w: 2.2, h: 3.4, name: 'Bath', kind: 'bath' },
      { x: 11.4, y: 0, w: 2.6, h: 3.4, name: 'Entry', kind: 'entry' },
      { x: 0, y: 7.6, w: 14, h: 1.9, name: 'Balcony', kind: 'balcony' },
    ],
  },
  three: {
    w: 17.2,
    d: 10.2,
    rooms: [
      { x: 0, y: 0, w: 7, h: 8.2, name: 'Living · Dining', kind: 'living' },
      { x: 7, y: 3.4, w: 4.2, h: 4.8, name: 'Main bedroom', kind: 'master' },
      { x: 11.2, y: 3.4, w: 3, h: 4.8, name: 'Bedroom 2', kind: 'bed' },
      { x: 14.2, y: 3.4, w: 3, h: 4.8, name: 'Bedroom 3', kind: 'bed' },
      { x: 7, y: 0, w: 3.2, h: 3.4, name: 'Kitchen', kind: 'kitchen' },
      { x: 10.2, y: 0, w: 2.4, h: 3.4, name: 'En suite', kind: 'bath' },
      { x: 12.6, y: 0, w: 2.2, h: 3.4, name: 'Bath', kind: 'bath' },
      { x: 14.8, y: 0, w: 2.4, h: 3.4, name: 'Entry', kind: 'entry' },
      { x: 0, y: 8.2, w: 17.2, h: 2, name: 'Balcony', kind: 'balcony' },
    ],
  },
}

const S = 40 // SVG units per metre
const INK = '#20252c'
const n = (v: number) => +(v * S).toFixed(1)

function furniture(r: Room): string {
  const cx = r.x + r.w / 2
  const line = `fill="none" stroke="${INK}" stroke-opacity="0.45" stroke-width="1.4"`
  switch (r.kind) {
    case 'master':
    case 'bed': {
      const bw = r.kind === 'master' ? 1.8 : 1.4
      const bx = cx - bw / 2
      const by = r.y + 0.35
      return `<rect x="${n(bx)}" y="${n(by)}" width="${n(bw)}" height="${n(2.05)}" rx="4" ${line}/>
        <rect x="${n(bx + 0.12)}" y="${n(by + 0.12)}" width="${n(bw - 0.24)}" height="${n(0.4)}" rx="3" ${line}/>`
    }
    case 'living':
      return `<rect x="${n(r.x + 0.5)}" y="${n(r.y + r.h - 1.6)}" width="${n(Math.min(3, r.w - 1.6))}" height="${n(0.9)}" rx="6" ${line}/>
        <circle cx="${n(r.x + r.w * 0.62)}" cy="${n(r.y + 1.9)}" r="${n(0.65)}" ${line}/>
        <rect x="${n(r.x + 0.25)}" y="${n(r.y + 0.25)}" width="${n(r.w * 0.45)}" height="${n(0.62)}" ${line}/>`
    case 'kitchen':
      return `<path d="M${n(r.x + 0.2)} ${n(r.y + r.h - 0.25)} V${n(r.y + 0.25)} H${n(r.x + r.w - 0.25)} V${n(r.y + 0.85)} H${n(r.x + 0.82)} V${n(r.y + r.h - 0.25)} Z" ${line}/>
        <circle cx="${n(r.x + r.w / 2)}" cy="${n(r.y + 0.55)}" r="${n(0.2)}" ${line}/>`
    case 'bath':
      return `<rect x="${n(r.x + 0.2)}" y="${n(r.y + 0.2)}" width="${n(r.w - 0.4)}" height="${n(0.8)}" rx="10" ${line}/>
        <ellipse cx="${n(r.x + 0.55)}" cy="${n(r.y + r.h - 0.6)}" rx="${n(0.22)}" ry="${n(0.3)}" ${line}/>
        <rect x="${n(r.x + r.w - 0.75)}" y="${n(r.y + r.h - 0.95)}" width="${n(0.5)}" height="${n(0.55)}" rx="5" ${line}/>`
    default:
      return ''
  }
}

/** A residence's floor plan. */
export function planSvg(u: Unit, opts: { labels?: boolean } = {}): string {
  const L = layouts[u.plan]
  const pad = 1.4
  const labels = opts.labels ?? true
  const rooms = L.rooms
    .map((r) => {
      const bal = r.kind === 'balcony'
      const label = labels
        ? `<text x="${n(r.x + r.w / 2)}" y="${n(r.y + r.h / 2)}" text-anchor="middle" font-size="${r.w < 2.5 ? 11 : 14}" font-weight="600" fill="${INK}">${r.name}</text>
           <text x="${n(r.x + r.w / 2)}" y="${n(r.y + r.h / 2) + 16}" text-anchor="middle" font-size="11" fill="#6b7480">${(r.w * r.h).toFixed(1)} m²</text>`
        : ''
      return `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" fill="${bal ? 'url(#hatch)' : '#fbfaf7'}" stroke="${INK}" stroke-width="${bal ? 2 : 4}"/>
        ${bal ? '' : furniture(r)}${label}`
    })
    .join('')
  // A door swing off the corridor side of each enclosed room.
  const doors = L.rooms
    .filter((r) => ['bed', 'master', 'bath', 'kitchen'].includes(r.kind) && r.y > 0)
    .map((r) => `<path d="M${n(r.x + 0.2)} ${n(r.y)} h${n(0.85)}" stroke="#fbfaf7" stroke-width="6"/><path d="M${n(r.x + 0.2)} ${n(r.y)} v${n(0.85)} A${n(0.85)} ${n(0.85)} 0 0 0 ${n(r.x + 1.05)} ${n(r.y)}" fill="none" stroke="${INK}" stroke-width="1.2"/>`)
    .join('')
  const entry = L.rooms.find((r) => r.kind === 'entry')!
  const facadeY = L.rooms.find((r) => r.kind === 'balcony')!.y
  const front = `<path d="M${n(entry.x + 0.3)} 0 h${n(0.95)}" stroke="#fbfaf7" stroke-width="6"/><path d="M${n(entry.x + 0.3)} 0 A${n(0.95)} ${n(0.95)} 0 0 0 ${n(entry.x + 1.25)} ${n(0.95)} M${n(entry.x + 1.25)} 0 v${n(0.95)}" fill="none" stroke="${INK}" stroke-width="1.2"/>`
  // Floor-to-ceiling glazing along the facade.
  const glass = `<line x1="${n(0.3)}" y1="${n(facadeY)}" x2="${n(L.w - 0.3)}" y2="${n(facadeY)}" stroke="#7fb4e6" stroke-width="6"/>`
  const dim = `<g font-size="12" fill="#6b7480">
      <line x1="0" y1="${n(-0.7)}" x2="${n(L.w)}" y2="${n(-0.7)}" stroke="#9aa3ad"/>
      <line x1="0" y1="${n(-0.95)}" x2="0" y2="${n(-0.45)}" stroke="#9aa3ad"/><line x1="${n(L.w)}" y1="${n(-0.95)}" x2="${n(L.w)}" y2="${n(-0.45)}" stroke="#9aa3ad"/>
      <text x="${n(L.w / 2)}" y="${n(-0.85)}" text-anchor="middle">${L.w.toFixed(2)} m</text>
    </g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(-pad)} ${n(-pad)} ${n(L.w + pad * 2)} ${n(L.d + pad * 2)}" font-family="Inter, system-ui, sans-serif" role="img" aria-label="Floor plan of apartment ${u.code}">
    <defs><pattern id="hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#f1eee7"/><line x1="0" y1="0" x2="0" y2="10" stroke="#d6d0c4" stroke-width="2"/></pattern></defs>
    ${rooms}${glass}${doors}${front}${labels ? dim : ''}
  </svg>`
}

/** The whole floor, with this residence highlighted. The three homes face the sea; the core is behind. */
export function keyPlanSvg(u: Unit): string {
  const R = 100
  // Each home takes a third of the front of an oval floor plate.
  const span = Math.PI / 3
  const pt = (a: number, r: number) => `${(Math.cos(a) * r * 1.25).toFixed(1)},${(-Math.sin(a) * r).toFixed(1)}`
  const sectors = slots
    .map((s, i) => {
      const a1 = Math.PI - i * span - 0.03
      const a0 = Math.PI - (i + 1) * span + 0.03
      const arc = Array.from({ length: 21 }, (_, k) => pt(a1 - ((a1 - a0) * k) / 20, R)).join(' L')
      const on = s.slot === u.slot
      const [mx, my] = pt((a0 + a1) / 2, R * 0.62).split(',')
      return `<path d="M${pt(a1, R * 0.3)} L${arc} L${pt(a0, R * 0.3)} Z" fill="${on ? '#e8467c' : '#e9ecef'}" stroke="#fff" stroke-width="3"/>
        <text x="${mx}" y="${+my + 5}" text-anchor="middle" font-size="15" font-weight="600" fill="${on ? '#fff' : '#6b7480'}">0${s.slot}</text>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-135 -135 270 200" font-family="Inter, system-ui, sans-serif" role="img" aria-label="Key plan of floor ${u.floor}">
    <text x="0" y="-117" text-anchor="middle" font-size="13" letter-spacing="4" fill="#2f8cff">▲ SEA</text>
    <path d="M${pt(Math.PI, R + 8)} A${(R + 8) * 1.25} ${R + 8} 0 0 1 ${pt(0, R + 8)} L${pt(0, R * 0.3)} L${pt(Math.PI, R * 0.3)} Z" fill="#f6f4ef" stroke="#cfd5db" stroke-width="2"/>
    ${sectors}
    <rect x="-70" y="-${R * 0.3 - 2}" width="140" height="44" rx="6" fill="#dde2e7"/>
    <text x="0" y="${-R * 0.3 + 28}" text-anchor="middle" font-size="12" fill="#6b7480">Core · lifts</text>
  </svg>`
}

/** A printable plan sheet, downloaded as SVG. */
export function downloadPlan(u: Unit): void {
  const W = 1400
  const H = 990
  const place = (svg: string, x: number, y: number, w: number, h: number) => svg.replace('<svg ', `<svg x="${x}" y="${y}" width="${w}" height="${h}" `)
  const sheet = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter, system-ui, sans-serif">
    <rect width="${W}" height="${H}" fill="#fff"/>
    <text x="60" y="80" font-size="16" letter-spacing="6" fill="#6b7480">${brand.name.toUpperCase()}</text>
    <text x="60" y="130" font-size="44" font-weight="700" fill="${INK}">Apartment ${u.code}</text>
    <text x="60" y="170" font-size="18" fill="#6b7480">Floor ${u.floor} · ${u.beds} bedroom${u.beds > 1 ? 's' : ''} · ${u.area.toFixed(2)} m² · ${u.facing} facing</text>
    ${place(planSvg(u), 60, 210, 960, 720)}
    ${place(keyPlanSvg(u), 1080, 230, 260, 260)}
    <text x="1080" y="540" font-size="13" fill="#6b7480">Key plan — floor ${u.floor}</text>
    <text x="60" y="${H - 30}" font-size="12" fill="#9aa3ad">Indicative only. Areas are approximate and layouts may change. © ${new Date().getFullYear()} ${brand.name}</text>
  </svg>`
  const url = URL.createObjectURL(new Blob([sheet], { type: 'image/svg+xml' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${brand.name.replace(/\s+/g, '-')}-${u.code}.svg`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
