// All copy for the site.
// Figures marked PLACEHOLDER are illustrative until Just10 Group supplies
// real numbers — replace them before launch.

export interface Stat {
  value: number
  decimals?: number
  prefix?: string
  suffix?: string
  label: string
  note?: string
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

export type PageId = 'home' | 'resort' | 'suites' | 'services' | 'contact'

export const pages: { id: PageId; href: string; label: string; title: string }[] = [
  { id: 'home', href: './', label: 'Home', title: 'Just10 Group' },
  { id: 'resort', href: './resort.html', label: 'The Resort', title: 'The *Resort.*' },
  { id: 'suites', href: './suites.html', label: 'Suites', title: 'Every *Room.*' },
  { id: 'services', href: './services.html', label: 'Services', title: 'What we *Build.*' },
  { id: 'contact', href: './contact.html', label: 'Contact', title: 'Start a *Project.*' },
]

/** Landing page: from bare earth to the lobby doors. */
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
  { id: 'doors', rail: 'Just10 Group' },
]

export const brand = {
  name: 'Just10 Group',
  tagline: 'Building landmarks.',
}

/** Resort page: out through the doors, across the terrace, up to the aerial. */
export const resort = {
  eyebrow: '02 — The Resort',
  hero: { title: 'Beyond the *doors.*', body: 'Step outside and the whole programme comes together — structure, envelope, landscape and water, delivered as one.' },
  project: {
    title: 'The *Resort.*',
    body: 'A twelve-storey hospitality landmark, taken from cleared ground to opening day by a single team.',
    // PLACEHOLDER figures
    specs: [
      { label: 'Storeys', value: '12' },
      { label: 'Keys', value: '240' },
      { label: 'Programme', value: '26 mo' },
      { label: 'Contract', value: 'Design & Build' },
    ],
  },
  statement: 'Not just a building. *A landmark.*',
  // PLACEHOLDER figures
  numbers: [
    { value: 15, suffix: '+', label: 'Years building', note: 'Founded on site, grown project by project.' },
    { value: 120, suffix: '+', label: 'Projects delivered', note: 'Hospitality, residential, commercial and civil.' },
    { value: 350, suffix: 'k', label: 'm² constructed', note: 'Gross floor area handed over to clients.' },
    { value: 0, label: 'Lost-time incidents', note: 'On the current programme, and counting.' },
  ] as Stat[],
}

/** Suites page: the floor scan, the dive through a window, the rooms. */
export const suites = {
  eyebrow: '03 — Suites',
  hero: { title: 'Every *Room.*', body: 'Twelve floors. Hundreds of rooms. Each one built to the same standard.' },
  scan: { prompt: 'Selecting a floor', locked: 'Level 08', lockedNote: 'Signature Suite' },
  // Floors as seen in the tower frame: y-centre of each level in source
  // pixels (720×1280), measured from the frame at 1.0 s of c-suites.mp4.
  floors: { firstY: 572, podium: [572, 542], guestTopY: 320, guestBottomY: 512, guestCount: 10, x0: 0.014, x1: 0.868, lock: 8 },
  features: [
    { at: 0.02, title: 'Rest, *refined.*', body: 'Acoustic separation, blackout joinery and climate control tuned room by room.' },
    { at: 0.12, title: 'Stone *& light.*', body: 'Large-format porcelain, frameless glass and lighting set into every line.' },
    { at: 0.3, title: 'Room to *breathe.*', body: 'Open-plan suites where structure steps aside for the view.' },
    { at: 0.56, title: 'Living, *elevated.*', body: 'Corridors, lounges and suites finished to one hospitality standard.' },
  ],
  finale: 'Crafted.',
}

export const services = [
  { title: 'Design & Build', body: 'One contract, one team, one point of accountability from concept to keys.', still: 'vision' },
  { title: 'Civil & Structural', body: 'Earthworks, foundations and reinforced-concrete frames, built to tolerance.', still: 'frame' },
  { title: 'Project Management', body: 'Programme, cost and quality control with reporting you can actually read.', still: 'finish' },
  { title: 'Interior Fit-out', body: 'Hospitality-grade finishes, joinery and FF&E installation.', still: 'lobby' },
  { title: 'MEP & Facades', body: 'Mechanical, electrical, plumbing and envelope packages, fully coordinated.', still: 'arrival' },
  { title: 'Landscape & External Works', body: 'Pools, hardscape, planting and lighting that complete the picture.', still: 'terrace' },
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
