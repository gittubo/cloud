// The explorer's interface: time-of-day slider, view tabs, filters, the
// residence card, the floor-plan sheet, the window view and compare.
import './styles.css'
import * as THREE from 'three'
import { brand, highlights, places, statusColor, statusLabel, towers, units, type Status, type Tower, type Unit } from './data'
import { downloadPlan, keyPlanSvg, planSvg } from './plans'
import { World } from './scene'

type View = 'intro' | 'location' | 'apartments' | 'plan' | 'window' | 'gallery'

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)]
const app = $('#app')
const mobile = () => window.innerWidth < 760

const icon = {
  sunrise: '<path d="M3 18h18M6 14a6 6 0 0 1 12 0M12 4v4M4.9 8.9l1.6 1.6M19.1 8.9l-1.6 1.6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.3 1.5A3.3 3.3 0 0 0 7 18z"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  plan: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 12h8v9M11 3v5M15 12h6"/>',
  window: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M12 4v16M3 12h18"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 7l9 6 9-6"/>',
}
const svg = (k: keyof typeof icon) => `<svg viewBox="0 0 24 24" aria-hidden="true">${icon[k]}</svg>`

const fmtArea = (a: number) => `${a.toFixed(2)} m²`
const bedsLabel = (n: number) => `${n} bed${n > 1 ? 's' : ''}`
const byCode = new Map(units.map((u) => [u.code, u]))

// ---------- State ----------

const state = {
  view: 'intro' as View,
  tower: towers[0],
  unit: null as Unit | null,
  compare: [] as string[],
  status: new Set<Status>(['available', 'reserved', 'sold']),
  beds: new Set<number>(),
  towerFilter: 'all' as 'all' | Tower['id'],
  floorMin: 1,
  floorMax: Math.max(...towers.map((t) => t.floors)),
}

const matches = (u: Unit) =>
  state.status.has(u.status) &&
  (state.beds.size === 0 || state.beds.has(u.beds)) &&
  (state.towerFilter === 'all' || u.tower.id === state.towerFilter) &&
  u.floor >= state.floorMin &&
  u.floor <= state.floorMax

// ---------- Markup ----------

const ui = $('#ui')
ui.innerHTML = `
  <header class="top">
    <a class="brand" href="./" aria-label="${brand.name} — start again"><b>TUBO</b><span>RESIDENCES</span></a>
    <div class="tod" role="group" aria-label="Time of day">
      <input class="tod__range" type="range" min="0" max="3" step="0.01" value="1" aria-label="Time of day" />
      <div class="tod__icons">
        <button type="button" data-t="0" aria-label="Sunrise">${svg('sunrise')}</button>
        <button type="button" data-t="1" aria-label="Day">${svg('sun')}</button>
        <button type="button" data-t="2" aria-label="Overcast">${svg('cloud')}</button>
        <button type="button" data-t="3" aria-label="Night">${svg('moon')}</button>
      </div>
    </div>
    <div class="top__actions">
      <button type="button" class="icon-btn" data-act="fullscreen" aria-label="Full screen">${svg('expand')}</button>
    </div>
  </header>

  <button type="button" class="rail-toggle" aria-controls="rail" aria-expanded="false" aria-label="Show filters">${svg('chevron')}</button>
  <aside class="rail" id="rail" aria-label="Find a residence" hidden>
    <div class="rail__head"><h2>Find your residence</h2><button type="button" class="icon-btn icon-btn--sm" data-act="rail-close" aria-label="Hide filters">${svg('close')}</button></div>
    <fieldset class="filter"><legend>Status</legend><div class="chips" data-filter="status"></div></fieldset>
    <fieldset class="filter"><legend>Bedrooms</legend><div class="chips" data-filter="beds"></div></fieldset>
    <fieldset class="filter"><legend>Tower</legend><div class="chips" data-filter="tower"></div></fieldset>
    <fieldset class="filter"><legend>Floors <output class="floor-out"></output></legend>
      <div class="dual"><input type="range" min="1" max="${state.floorMax}" value="1" data-floor="min" aria-label="Lowest floor" /><input type="range" min="1" max="${state.floorMax}" value="${state.floorMax}" data-floor="max" aria-label="Highest floor" /></div>
    </fieldset>
    <p class="rail__count" aria-live="polite"></p>
    <ul class="results"></ul>
  </aside>

  <nav class="tabs" aria-label="Views">
    <button type="button" data-tab="apartments">Apartments</button>
    <button type="button" data-tab="compare">Compare <span class="badge">0</span></button>
    <button type="button" data-tab="location">Location</button>
    <button type="button" data-tab="gallery">Gallery</button>
    <button type="button" data-tab="highlights">Highlights</button>
  </nav>

  <p class="hint" aria-live="polite"></p>
  <div class="tip" role="status" hidden></div>
  <section class="card" aria-label="Selected residence" hidden></section>
  <section class="sheet" aria-label="Floor plan" hidden></section>
  <div class="windowbar" role="toolbar" aria-label="Window view" hidden>
    <button type="button" data-win="1" aria-pressed="true">View 1</button>
    <button type="button" data-win="2" aria-pressed="false">View 2</button>
    <button type="button" data-win="back">Back to apartment</button>
  </div>
  <section class="drawer" aria-label="Compare residences" hidden></section>
  <section class="modal" aria-label="Highlights" hidden></section>
  <div class="gallery" role="toolbar" aria-label="Gallery" hidden></div>

  <div class="intro">
    <p class="intro__eyebrow">${brand.tagline}</p>
    <h1 class="intro__title">Tubo <em>Residences</em></h1>
    <button type="button" class="btn btn--light" data-act="enter">Explore the residences</button>
  </div>`

const world = new World($('#world'))
const labels = $('#labels')
const leader = $<SVGSVGElement>('#leader')

function setView(v: View): void {
  state.view = v
  app.dataset.view = v
  $$('[data-tab]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.tab === v || (v === 'plan' && b.dataset.tab === 'apartments'))))
}

function hint(text: string): void {
  const h = $('.hint')
  h.textContent = text
  h.classList.toggle('is-on', !!text)
}

// ---------- Time of day ----------

const range = $<HTMLInputElement>('.tod__range')
let timeAnim = 0
function setTime(t: number, animate = false): void {
  cancelAnimationFrame(timeAnim)
  if (!animate) {
    range.value = String(t)
    world.setTime(t)
    return
  }
  const from = world.time
  const start = performance.now()
  const step = (now: number) => {
    const k = Math.min(1, (now - start) / 900)
    const v = from + (t - from) * (1 - Math.pow(1 - k, 3))
    range.value = String(v)
    world.setTime(v)
    if (k < 1) timeAnim = requestAnimationFrame(step)
  }
  timeAnim = requestAnimationFrame(step)
}
range.addEventListener('input', () => setTime(+range.value))
$$('.tod__icons button').forEach((b) => b.addEventListener('click', () => setTime(+b.dataset.t!, true)))

// ---------- Labels pinned to the scene ----------

labels.innerHTML =
  towers
    .map((t) => {
      const free = units.filter((u) => u.tower === t && u.status === 'available').length
      return `<button type="button" class="pin pin--tower" data-tower="${t.id}"><b>${t.name}</b><span>${t.floors} floors · ${free} available</span></button>`
    })
    .join('') + places.map((p, i) => `<div class="pin pin--place" data-place="${i}"><b>${p.name}</b><span>${p.note}</span></div>`).join('')

const towerPins = towers.map((t) => ({ el: $(`[data-tower="${t.id}"]`, labels), at: world.towerTop(t) }))
const placePins = places.map((p, i) => ({ el: $(`[data-place="${i}"]`, labels), at: new THREE.Vector3(p.x, 4, p.z) }))
towerPins.forEach((p, i) => p.el.addEventListener('click', () => void openTower(towers[i])))

function pinTo(el: HTMLElement, at: THREE.Vector3, show: boolean): void {
  const s = show ? world.project(at) : null
  el.classList.toggle('is-on', !!s)
  if (s) el.style.transform = `translate(${s.x}px, ${s.y}px)`
}

world.onFrame = () => {
  const loc = state.view === 'location'
  towerPins.forEach((p) => pinTo(p.el, p.at, loc))
  placePins.forEach((p) => pinTo(p.el, p.at, loc))
  placeCard()
}

// ---------- Hover tooltip ----------

const tip = $('.tip')
world.onHover = (u, t, x, y) => {
  const text = u
    ? `<b>${u.code}</b> ${bedsLabel(u.beds)} · ${fmtArea(u.area)} · <i style="--c:${statusColor[u.status]}">${statusLabel[u.status]}</i>`
    : t && state.view !== 'window'
      ? `<b>${t.name}</b> Tap to explore`
      : ''
  tip.hidden = !text || mobile()
  if (!text) return
  tip.innerHTML = text
  tip.style.transform = `translate(${x + 16}px, ${y + 14}px)`
}

// ---------- Navigation between views ----------

async function openLocation(): Promise<void> {
  closePanels()
  selectUnit(null)
  setView('location')
  world.standOn(null)
  world.setMode('location')
  hint('Tap a tower to explore its residences')
  await world.flyTo({ pos: new THREE.Vector3(190, 165, 235), target: new THREE.Vector3(4, 22, -14) }, 2.2, 30)
}

async function openTower(t: Tower, fly = true): Promise<void> {
  closePanels()
  state.tower = t
  setView('apartments')
  world.standOn(null)
  world.setMode('apartments')
  if (!mobile()) toggleRail(true)
  hint('Tap any residence to see it — drag to turn, scroll to zoom')
  if (fly) await world.flyTo(world.shotTower(t), 2, 10)
}

function selectUnit(u: Unit | null): void {
  state.unit = u
  world.select(u)
  renderCard()
  $$('.results li button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.code === u?.code)))
}

async function pickUnit(u: Unit): Promise<void> {
  if (state.view !== 'apartments') await openTower(u.tower, false)
  state.tower = u.tower
  selectUnit(u)
  hint('')
  await world.flyTo(world.shotUnit(u), 1.5)
}

world.onPickUnit = (u) => void pickUnit(u)
world.onPickTower = (t) => {
  if (state.view === 'location' || state.view === 'gallery') void openTower(t)
}

function closePanels(): void {
  for (const sel of ['.sheet', '.drawer', '.modal', '.gallery', '.windowbar']) $(sel).hidden = true
  app.classList.remove('is-dimmed')
}

// ---------- Residence card ----------

const card = $('.card')
function renderCard(): void {
  const u = state.unit
  card.hidden = !u || state.view !== 'apartments'
  if (!u) return
  const inCompare = state.compare.includes(u.code)
  card.innerHTML = `
    <div class="card__actions">
      <button type="button" class="icon-btn icon-btn--sm" data-act="card-close" aria-label="Close">${svg('close')}</button>
      <button type="button" class="icon-btn icon-btn--sm${inCompare ? ' is-on' : ''}" data-act="compare" aria-pressed="${inCompare}" aria-label="${inCompare ? 'Remove from compare' : 'Add to compare'}">${svg(inCompare ? 'check' : 'plus')}</button>
    </div>
    <p class="card__status" style="--c:${statusColor[u.status]}">${statusLabel[u.status]}</p>
    <h2 class="card__title">Apartment ${u.code}</h2>
    <div class="card__plan">${planSvg(u, { labels: false })}</div>
    <dl class="facts"><div><dt>Bedrooms</dt><dd>${u.beds}</dd></div><div><dt>Floor</dt><dd>${u.floor}</dd></div><div><dt>m²</dt><dd>${u.area.toFixed(1)}</dd></div></dl>
    <button type="button" class="btn btn--dark" data-act="plan">${svg('plan')} Floor plan</button>`
  placeCard()
}

function placeCard(): void {
  const u = state.unit
  const line = leader.querySelector('line')!
  const dot = leader.querySelector('circle')!
  const show = !!u && state.view === 'apartments' && !card.hidden && !mobile()
  const p = show ? world.project(world.unitPoint(u!)) : null
  leader.classList.toggle('is-on', !!p)
  if (!p) {
    card.style.transform = ''
    return
  }
  const w = card.offsetWidth
  const h = card.offsetHeight
  const railW = $('#rail').hidden ? 0 : 340
  // Sit beside the residence, on whichever side has room.
  const right = p.x + 90 + w < window.innerWidth - railW - 16
  const x = right ? p.x + 90 : Math.max(16, p.x - 90 - w)
  const y = Math.min(window.innerHeight - h - 96, Math.max(84, p.y - h / 2))
  card.style.transform = `translate(${x}px, ${y}px)`
  line.setAttribute('x1', String(p.x))
  line.setAttribute('y1', String(p.y))
  line.setAttribute('x2', String(right ? x : x + w))
  line.setAttribute('y2', String(y + h / 2))
  dot.setAttribute('cx', String(p.x))
  dot.setAttribute('cy', String(p.y))
}

// ---------- Floor plan sheet ----------

const sheet = $('.sheet')
function openPlan(u: Unit): void {
  closePanels()
  setView('plan')
  app.classList.add('is-dimmed')
  card.hidden = true
  const inCompare = state.compare.includes(u.code)
  const enquire = `mailto:${brand.salesEmail}?subject=${encodeURIComponent(`Enquiry — Apartment ${u.code}`)}&body=${encodeURIComponent(`Hello, I'd like to know more about apartment ${u.code} (${u.tower.name}, floor ${u.floor}).`)}`
  sheet.innerHTML = `
    <div class="sheet__plans">
      <div class="sheet__key">${keyPlanSvg(u)}<p>Floor ${u.floor} · ${u.tower.name}</p></div>
      <div class="sheet__plan">${planSvg(u)}</div>
    </div>
    <div class="sheet__info">
      <div class="sheet__close"><button type="button" class="icon-btn icon-btn--light" data-act="sheet-close" aria-label="Back to the tower">${svg('close')}</button></div>
      <p class="card__status" style="--c:${statusColor[u.status]}">${statusLabel[u.status]}</p>
      <h2 class="sheet__title">Apartment ${u.code}</h2>
      <div class="sheet__boxes"><div><b>${fmtArea(u.area)}</b><span>Total area</span></div><div><b>${brand.price}</b><span>Price</span></div></div>
      <dl class="facts facts--light"><div><dt>Bedrooms</dt><dd>${u.beds}</dd></div><div><dt>Floor</dt><dd>${u.floor}</dd></div><div><dt>Apartment</dt><dd>${u.code}</dd></div><div><dt>Facing</dt><dd>${u.facing}</dd></div></dl>
      <div class="sheet__buttons">
        <button type="button" class="btn btn--dark" data-act="window">${svg('window')} Window view</button>
        <button type="button" class="btn btn--line" data-act="compare" aria-pressed="${inCompare}">${svg(inCompare ? 'check' : 'plus')} ${inCompare ? 'In compare' : 'Add to compare'}</button>
        <button type="button" class="btn btn--line" data-act="download">${svg('download')} Download floor plan</button>
        <a class="btn btn--line" href="${enquire}">${svg('mail')} Enquire about this home</a>
      </div>
      <p class="sheet__note">Indicative layout. Areas are approximate.</p>
    </div>`
  sheet.hidden = false
  $<HTMLButtonElement>('[data-act="window"]', sheet).focus({ preventScroll: true })
}

function closePlan(): void {
  sheet.hidden = true
  app.classList.remove('is-dimmed')
  setView('apartments')
  renderCard()
}

// ---------- Window view ----------

async function openWindow(u: Unit, view: 1 | 2 = 1): Promise<void> {
  sheet.hidden = true
  app.classList.remove('is-dimmed')
  setView('window')
  world.standOn(u.tower)
  world.setMode('window')
  const bar = $('.windowbar')
  bar.hidden = false
  $$('[data-win]', bar).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.win === String(view))))
  hint('Drag to look around · try the time of day above')
  await world.flyTo(world.shotWindow(u, view), view === 1 ? 2.4 : 1.3, view === 1 ? 6 : 0)
}

function backFromWindow(): void {
  const u = state.unit!
  $('.windowbar').hidden = true
  hint('')
  world.standOn(null)
  world.setMode('apartments')
  void world.flyTo(world.shotUnit(u), 1.6, 8)
  openPlan(u)
}

// ---------- Compare ----------

function toggleCompare(u: Unit): void {
  const i = state.compare.indexOf(u.code)
  if (i >= 0) state.compare.splice(i, 1)
  else {
    if (state.compare.length >= 4) state.compare.shift()
    state.compare.push(u.code)
  }
  $('.tabs .badge').textContent = String(state.compare.length)
  if (state.view === 'plan' && state.unit === u) openPlan(u)
  else renderCard()
  if (!$('.drawer').hidden) renderCompare()
}

function renderCompare(): void {
  const list = state.compare.map((c) => byCode.get(c)!)
  const rows: [string, (u: Unit) => string][] = [
    ['Status', (u) => `<span class="dot" style="--c:${statusColor[u.status]}"></span>${statusLabel[u.status]}`],
    ['Tower', (u) => u.tower.name],
    ['Floor', (u) => String(u.floor)],
    ['Bedrooms', (u) => String(u.beds)],
    ['Area', (u) => fmtArea(u.area)],
    ['Facing', (u) => u.facing],
    ['Price', () => brand.price],
  ]
  $('.drawer').innerHTML = `
    <div class="drawer__head"><h2>Compare</h2><button type="button" class="icon-btn icon-btn--sm" data-act="drawer-close" aria-label="Close compare">${svg('close')}</button></div>
    ${
      list.length
        ? `<div class="compare"><table>
        <thead><tr><td></td>${list.map((u) => `<th scope="col">${u.code}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(([k, f]) => `<tr><th scope="row">${k}</th>${list.map((u) => `<td>${f(u)}</td>`).join('')}</tr>`).join('')}
        <tr><td></td>${list.map((u) => `<td><button type="button" class="link" data-show="${u.code}">View</button> · <button type="button" class="link" data-remove="${u.code}">Remove</button></td>`).join('')}</tr></tbody>
      </table></div>`
        : '<p class="empty">Nothing to compare yet. Select a residence and tap <b>+</b> to add it here — up to four.</p>'
    }`
}

// ---------- Highlights and gallery ----------

function openHighlights(): void {
  closePanels()
  const free = units.filter((u) => u.status === 'available').length
  $('.modal').innerHTML = `
    <div class="modal__box">
      <button type="button" class="icon-btn icon-btn--sm modal__close" data-act="modal-close" aria-label="Close highlights">${svg('close')}</button>
      <p class="intro__eyebrow">${brand.tagline}</p>
      <h2 class="modal__title">Tubo <em>Residences</em></h2>
      <dl class="stats"><div><dt>Towers</dt><dd>${towers.length}</dd></div><div><dt>Residences</dt><dd>${units.length}</dd></div><div><dt>Available</dt><dd>${free}</dd></div><div><dt>Floors</dt><dd>${Math.max(...towers.map((t) => t.floors))}</dd></div></dl>
      <ul class="highlights">${highlights.map((h) => `<li><h3>${h.title}</h3><p>${h.body}</p></li>`).join('')}</ul>
    </div>`
  $('.modal').hidden = false
}

const shots: { name: string; time: number; pos: [number, number, number]; target: [number, number, number] }[] = [
  { name: 'Arrival', time: 1, pos: [190, 165, 235], target: [4, 22, -14] },
  { name: 'Sea front', time: 0.15, pos: [70, 12, -170], target: [0, 45, 0] },
  { name: 'Pool deck', time: 1.2, pos: [36, 5, -66], target: [-6, 34, -8] },
  { name: 'Overcast', time: 2, pos: [-150, 70, -120], target: [0, 40, 0] },
  { name: 'Night skyline', time: 3, pos: [-240, 120, -230], target: [0, 30, 0] },
]
function openGallery(): void {
  closePanels()
  selectUnit(null)
  setView('gallery')
  world.standOn(null)
  world.setMode('location')
  hint('')
  const g = $('.gallery')
  g.innerHTML = shots.map((s, i) => `<button type="button" data-shot="${i}"><span>${String(i + 1).padStart(2, '0')}</span>${s.name}</button>`).join('')
  g.hidden = false
  goShot(0)
}
function goShot(i: number): void {
  const s = shots[i]
  $$('[data-shot]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.shot === String(i))))
  setTime(s.time, true)
  void world.flyTo({ pos: new THREE.Vector3(...s.pos), target: new THREE.Vector3(...s.target) }, 2.4, 25)
}

// ---------- Filters ----------

const rail = $('#rail')
function toggleRail(open = rail.hidden): void {
  rail.hidden = !open
  $('.rail-toggle').setAttribute('aria-expanded', String(open))
  app.classList.toggle('rail-open', open)
}

function renderFilters(): void {
  const chip = (group: string, value: string, label: string, on: boolean, color?: string) =>
    `<button type="button" class="chip" data-group="${group}" data-value="${value}" aria-pressed="${on}">${color ? `<span class="dot" style="--c:${color}"></span>` : ''}${label}</button>`
  const count = (s: Status) => units.filter((u) => u.status === s).length
  $('[data-filter="status"]').innerHTML = (['available', 'reserved', 'sold'] as Status[]).map((s) => chip('status', s, `${statusLabel[s]} <small>${count(s)}</small>`, state.status.has(s), statusColor[s])).join('')
  $('[data-filter="beds"]').innerHTML = chip('beds', 'any', 'Any', state.beds.size === 0) + [1, 2, 3].map((b) => chip('beds', String(b), String(b), state.beds.has(b))).join('')
  $('[data-filter="tower"]').innerHTML = chip('tower', 'all', 'Both', state.towerFilter === 'all') + towers.map((t) => chip('tower', t.id, t.name, state.towerFilter === t.id)).join('')
  $('.floor-out').textContent = `${state.floorMin}–${state.floorMax}`
}

function applyFilters(): void {
  renderFilters()
  world.setFilter(matches)
  const rank = (u: Unit) => (u.status === 'available' ? 0 : u.status === 'reserved' ? 1 : 2)
  const list = units.filter(matches).sort((a, b) => rank(a) - rank(b) || a.tower.id.localeCompare(b.tower.id) || b.floor - a.floor || a.slot - b.slot)
  $('.rail__count').textContent = `${list.length} residence${list.length === 1 ? '' : 's'}`
  $('.results').innerHTML = list
    .map(
      (u) => `<li><button type="button" data-code="${u.code}" aria-pressed="${u.code === state.unit?.code}">
        <span class="dot" style="--c:${statusColor[u.status]}"></span><b>${u.code}</b><span>${bedsLabel(u.beds)}</span><span>${u.area.toFixed(1)} m²</span><span>Fl. ${u.floor}</span></button></li>`,
    )
    .join('')
}

rail.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button')
  if (!b) return
  if (b.dataset.code) return void pickUnit(byCode.get(b.dataset.code)!)
  const { group, value } = b.dataset
  if (group === 'status') {
    const s = value as Status
    if (state.status.has(s)) state.status.delete(s)
    else state.status.add(s)
  } else if (group === 'beds') {
    if (value === 'any') state.beds.clear()
    else if (state.beds.has(+value!)) state.beds.delete(+value!)
    else state.beds.add(+value!)
  } else if (group === 'tower') {
    state.towerFilter = value as typeof state.towerFilter
    const t = towers.find((t) => t.id === value)
    if (t) {
      state.tower = t
      if (state.view === 'apartments') void world.flyTo(world.shotTower(t), 1.6, 8)
    }
  } else return
  applyFilters()
})
$$<HTMLInputElement>('[data-floor]').forEach((inp) =>
  inp.addEventListener('input', () => {
    const [lo, hi] = $$<HTMLInputElement>('[data-floor]').map((i) => +i.value)
    state.floorMin = Math.min(lo, hi)
    state.floorMax = Math.max(lo, hi)
    applyFilters()
  }),
)

// ---------- Wiring ----------

document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-tab],[data-win],[data-shot],[data-show],[data-remove]')
  if (!el) return
  const u = state.unit
  const { act, tab, win, shot, show, remove } = el.dataset
  if (act === 'enter') return void enter()
  if (act === 'fullscreen') return void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())
  if (act === 'rail-close') return toggleRail(false)
  if (act === 'card-close') return selectUnit(null)
  if (act === 'compare' && u) return toggleCompare(u)
  if (act === 'plan' && u) return openPlan(u)
  if (act === 'sheet-close') return closePlan()
  if (act === 'window' && u) return void openWindow(u)
  if (act === 'download' && u) return downloadPlan(u)
  if (act === 'drawer-close') return void ($('.drawer').hidden = true)
  if (act === 'modal-close') return void ($('.modal').hidden = true)
  if (win && u) return win === 'back' ? backFromWindow() : void openWindow(u, +win as 1 | 2)
  if (shot) return goShot(+shot)
  if (show) {
    $('.drawer').hidden = true
    return void pickUnit(byCode.get(show)!)
  }
  if (remove) return toggleCompare(byCode.get(remove)!)
  if (tab === 'apartments') return void (state.view === 'apartments' ? world.flyTo(world.shotTower(state.tower), 1.6) : openTower(state.tower))
  if (tab === 'location') return void openLocation()
  if (tab === 'gallery') return openGallery()
  if (tab === 'highlights') return openHighlights()
  if (tab === 'compare') {
    const d = $('.drawer')
    renderCompare()
    d.hidden = !d.hidden
  }
})
$('.rail-toggle').addEventListener('click', () => toggleRail())

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (!$('.modal').hidden) $('.modal').hidden = true
  else if (!$('.drawer').hidden) $('.drawer').hidden = true
  else if (state.view === 'window') backFromWindow()
  else if (state.view === 'plan') closePlan()
  else if (state.unit) selectUnit(null)
})

// ---------- Start ----------

async function enter(): Promise<void> {
  app.classList.add('is-entered')
  await openLocation()
}

applyFilters()
world.place({ pos: new THREE.Vector3(520, 420, 760), target: new THREE.Vector3(0, 30, 0) })
// Deep link: ?apartment=A1804 opens straight onto a residence.
const deep = byCode.get(new URLSearchParams(location.search).get('apartment')?.toUpperCase() ?? '')
if (deep) {
  app.classList.add('is-entered')
  void pickUnit(deep)
}
