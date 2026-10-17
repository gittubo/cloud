// All copy for the scroll story and the sections after it.
// Figures marked PLACEHOLDER are illustrative until Just10 Group supplies
// real numbers — replace them before launch.

export interface Stat {
  value: number
  decimals?: number
  prefix?: string
  suffix?: string
  label: string
}

export interface Chapter {
  /** Matches an id in frames.generated.json. */
  id: string
  /** Short name shown on the chapter rail. */
  rail: string
  eyebrow?: string
  /** Use *asterisks* for the italic serif accent. */
  title?: string
  body?: string
  stats?: Stat[]
}

export const chapters: Chapter[] = [
  {
    id: 'ground',
    rail: 'Ground',
    eyebrow: '01 — Ground',
    title: 'Every landmark begins as *raw earth.*',
    body: 'Survey, earthworks and foundations — the work nobody sees, and everything depends on.',
  },
  {
    id: 'frame',
    rail: 'Structure',
    eyebrow: '02 — Structure',
    title: 'Floor by floor, *the frame rises.*',
    body: 'Reinforced concrete poured, cured and checked against the drawings at every level.',
    // PLACEHOLDER figures
    stats: [
      { value: 12, label: 'Storeys' },
      { value: 4800, label: 'Tonnes of steel' },
      { value: 1.2, decimals: 1, suffix: 'M', label: 'Safe man-hours' },
    ],
  },
  {
    id: 'finish',
    rail: 'Envelope',
    eyebrow: '03 — Envelope & landscape',
    title: 'Glass, stone, water *and shade.*',
    body: 'Facade, services, pools and planting delivered as one programme, by one accountable team.',
  },
  {
    id: 'vision',
    rail: 'Design',
    eyebrow: '04 — Design',
    title: 'Built once on paper, *then for real.*',
    body: 'Every project is modelled, costed and value-engineered before ground is broken — so what you approve is what we hand over.',
  },
  {
    id: 'arrival',
    rail: 'Arrival',
    eyebrow: '05 — Arrival',
    title: 'First impressions, *engineered.*',
    body: 'Driveways, canopies and water features that work as hard as they look.',
  },
  {
    id: 'lobby',
    rail: 'Interiors',
    eyebrow: '06 — Interiors',
    title: 'Marble, light *and calm.*',
    body: 'Interior fit-out finished to hospitality standard, down to the last joint.',
  },
  { id: 'doors', rail: 'Threshold' },
  {
    id: 'terrace',
    rail: 'Just10 Group',
    eyebrow: 'From first survey to final handover',
    // PLACEHOLDER figures
    stats: [
      { value: 15, suffix: '+', label: 'Years building' },
      { value: 120, suffix: '+', label: 'Projects delivered' },
      { value: 350, suffix: 'k', label: 'm² constructed' },
    ],
  },
  {
    id: 'suites',
    rail: 'Suites',
    eyebrow: '09 — Suites',
    title: 'Step inside *the detail.*',
    body: 'Bedrooms, baths and living spaces — fitted, finished and handed over ready for the first guest.',
  },
]

export const brand = {
  name: 'Just10 Group',
  tagline: 'Building landmarks.',
  statement: 'We don’t just build structures. *We build landmarks.*',
}

export const services = [
  { title: 'Design & Build', body: 'One contract, one team, one point of accountability from concept to keys.' },
  { title: 'Civil & Structural', body: 'Earthworks, foundations and reinforced-concrete frames, built to tolerance.' },
  { title: 'Project Management', body: 'Programme, cost and quality control with reporting you can actually read.' },
  { title: 'Interior Fit-out', body: 'Hospitality-grade finishes, joinery and FF&E installation.' },
  { title: 'MEP & Facades', body: 'Mechanical, electrical, plumbing and envelope packages, fully coordinated.' },
  { title: 'Landscape & External Works', body: 'Pools, hardscape, planting and lighting that complete the picture.' },
]

export const process = [
  { title: 'Consult', body: 'We listen, visit the site and test the brief against budget and programme.' },
  { title: 'Design & cost', body: 'Drawings, models and a transparent cost plan you can sign off with confidence.' },
  { title: 'Build', body: 'Safe, sequenced delivery with weekly progress you can see.' },
  { title: 'Hand over', body: 'Snag-free completion, documentation and aftercare.' },
]

// PLACEHOLDER contact details — replace with Just10 Group's real ones.
export const contact = {
  email: 'hello@just10group.example',
  phone: '+000 000 000 0000',
  address: 'Head office address',
}
