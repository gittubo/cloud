// The explorer's interface: the photo stage (aerial, tower, window view,
// gallery), the time-of-day slider, filters, the residence card, the
// floor-plan sheet and compare.
import './styles.css'
import { brand, FLOORS, highlights, places, statusColor, statusLabel, units, type Status, type Unit } from './data'
import { AERIAL_TOWER, AERIAL_TOWER_PIN, RENDER_H, RENDER_W, unitCentre, unitPoints } from './facade'
import { downloadPlan, keyPlanSvg, planSvg } from './plans'

type View = 'intro' | 'location' | 'apartments' | 'plan' | 'window' | 'gallery'

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)]
const app = $('#app')
const stage = $('#stage')
const mobile = () => window.innerWidth < 760
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const R = (name: string) => `${import.meta.env.BASE_URL}renders/${name}.jpg`

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
  unit: null as Unit | null,
  compare: [] as string[],
  status: new Set<Status>(['available', 'reserved', 'sold']),
  beds: new Set<number>(),
  floorMin: 1,
  floorMax: FLOORS,
  time: 1,
}

const matches = (u: Unit) =>
  state.status.has(u.status) && (state.beds.size === 0 || state.beds.has(u.beds)) && u.floor >= state.floorMin && u.floor <= state.floorMax

// ---------- Markup ----------

stage.innerHTML = `
  <section class="scene" data-scene="location">
    <div class="frame">
      <img class="graded" src="${R('aerial')}" alt="Aerial view of Tubo Residences on the seafront, between the old town and the marina" />
      <div class="tint"></div>
      <div class="pins"></div>
    </div>
  </section>
  <section class="scene" data-scene="tower">
    <div class="frame">
      <img class="tod tod--day" src="${R('tower-day')}" alt="The Tubo Residences tower above the sea" />
      <img class="tod tod--sunrise" src="${R('tower-sunrise')}" alt="" />
      <img class="tod tod--overcast" src="${R('tower-overcast')}" alt="" />
      <img class="tod tod--night" src="${R('tower-night')}" alt="" />
      <svg class="units" viewBox="0 0 ${RENDER_W} ${RENDER_H}" preserveAspectRatio="xMidYMid slice" role="group" aria-label="Residences on the tower"></svg>
    </div>
  </section>
  <section class="scene" data-scene="window">
    <div class="frame view view--1"><img class="graded" src="${R('interior')}" alt="Living room of a sea-view residence" /><div class="tint"></div></div>
    <div class="frame view view--2"><img class="graded" src="${R('balcony')}" alt="The view from a high-floor balcony over the beach and the bay" /><div class="tint"></div></div>
  </section>
  <section class="scene" data-scene="gallery">
    <div class="frame"><img class="gallery__img" alt="" /></div>
  </section>`

const ui = $('#ui')
ui.innerHTML = `
  <header class="top">
    <a class="brand" href="./" aria-label="${brand.name} — start again"><b>TUBO</b><span>RESIDENCES</span></a>
    <div class="tod-bar" role="group" aria-label="Time of day">
      <input class="tod-bar__range" type="range" min="0" max="3" step="0.01" value="1" aria-label="Time of day" />
      <div class="tod-bar__icons">
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
    <fieldset class="filter"><legend>Floors <output class="floor-out"></output></legend>
      <div class="dual"><input type="range" min="1" max="${FLOORS}" value="1" data-floor="min" aria-label="Lowest floor" /><input type="range" min="1" max="${FLOORS}" value="${FLOORS}" data-floor="max" aria-label="Highest floor" /></div>
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

const leader = $<SVGSVGElement>('#leader')
const scenes = Object.fromEntries($$('[data-scene]').map((s) => [s.dataset.scene!, s]))
const towerFrame = $('.frame', scenes.tower)
const aerialFrame = $('.frame', scenes.location)

/** Where a point of a 1344×752 render lands in a full-screen, cover-fitted frame. */
function cover(x: number, y: number): { x: number; y: number } {
  const W = stage.clientWidth
  const H = stage.clientHeight
  const s = Math.max(W / RENDER_W, H / RENDER_H)
  return { x: (W - RENDER_W * s) / 2 + x * s, y: (H - RENDER_H * s) / 2 + y * s }
}

function showScene(name: string): void {
  for (const [k, el] of Object.entries(scenes)) el.classList.toggle('is-on', k === name)
}

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
// 0 sunrise, 1 day, 2 overcast, 3 night. The tower has a real render for
// each; the other photos are graded to follow the slider.

const GRADE = [
  { sepia: 0.25, sat: 1.15, bright: 0.97, hue: -6, tint: 0 },
  { sepia: 0, sat: 1, bright: 1, hue: 0, tint: 0 },
  { sepia: 0, sat: 0.55, bright: 0.9, hue: 0, tint: 0 },
  { sepia: 0, sat: 0.75, bright: 0.42, hue: 12, tint: 0.55 },
]
type Grade = (typeof GRADE)[0]
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

function applyTime(t: number): void {
  state.time = t
  const i = Math.min(2, Math.floor(t))
  const f = t - i
  const g = {} as Grade
  for (const k of Object.keys(GRADE[0]) as (keyof Grade)[]) g[k] = GRADE[i][k] + (GRADE[i + 1][k] - GRADE[i][k]) * f
  const s = stage.style
  s.setProperty('--grade', `sepia(${g.sepia}) saturate(${g.sat}) brightness(${g.bright}) hue-rotate(${g.hue}deg)`)
  s.setProperty('--tint', String(g.tint))
  s.setProperty('--sunrise', String(clamp01(1 - t)))
  s.setProperty('--overcast', String(clamp01(t - 1)))
  s.setProperty('--night', String(clamp01(t - 2)))
}

const range = $<HTMLInputElement>('.tod-bar__range')
let timeAnim = 0
function setTime(t: number, animate = false): void {
  cancelAnimationFrame(timeAnim)
  if (!animate || reduced) {
    range.value = String(t)
    return applyTime(t)
  }
  const from = state.time
  const start = performance.now()
  const step = (now: number) => {
    const k = Math.min(1, (now - start) / 900)
    const v = from + (t - from) * (1 - Math.pow(1 - k, 3))
    range.value = String(v)
    applyTime(v)
    if (k < 1) timeAnim = requestAnimationFrame(step)
  }
  timeAnim = requestAnimationFrame(step)
}
range.addEventListener('input', () => setTime(+range.value))
$$('.tod-bar__icons button').forEach((b) => b.addEventListener('click', () => setTime(+b.dataset.t!, true)))

// ---------- Location pins ----------

const freeCount = units.filter((u) => u.status === 'available').length
const pinSpots = [{ ...AERIAL_TOWER_PIN }, ...places]
$('.pins', aerialFrame).innerHTML =
  `<button type="button" class="pin pin--tower" data-act="tower"><b>Tubo Residences</b><span>${FLOORS} floors · ${freeCount} available</span></button>` +
  places.map((p) => `<div class="pin"><b>${p.name}</b><span>${p.note}</span></div>`).join('')

function layoutPins(): void {
  $$('.pin', aerialFrame).forEach((el, i) => {
    const p = cover(pinSpots[i].x, pinSpots[i].y)
    el.style.transform = `translate(${p.x}px, ${p.y}px)`
  })
}

// ---------- Residences on the tower ----------

const unitsSvg = $<SVGSVGElement>('.units', scenes.tower)
unitsSvg.innerHTML = units
  .map((u) => `<polygon class="unit" data-code="${u.code}" points="${unitPoints(u)}" tabindex="0" role="button" aria-label="Apartment ${u.code}, ${bedsLabel(u.beds)}, ${statusLabel[u.status]}" style="--c:${statusColor[u.status]}" />`)
  .join('')
const polys = new Map($$<SVGPolygonElement>('.unit', unitsSvg).map((p) => [p.dataset.code!, p]))
const unitAt = (target: EventTarget | null) => {
  const p = (target as Element | null)?.closest<SVGPolygonElement>('.unit')
  return p && !p.classList.contains('is-off') ? byCode.get(p.dataset.code!)! : null
}

const tip = $('.tip')
unitsSvg.addEventListener('pointermove', (e) => {
  const u = unitAt(e.target)
  tip.hidden = !u || mobile()
  if (!u) return
  tip.innerHTML = `<b>${u.code}</b> ${bedsLabel(u.beds)} · ${fmtArea(u.area)} · <i style="--c:${statusColor[u.status]}">${statusLabel[u.status]}</i>`
  tip.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 14}px)`
})
unitsSvg.addEventListener('pointerleave', () => (tip.hidden = true))
unitsSvg.addEventListener('click', (e) => {
  const u = unitAt(e.target)
  if (u) pickUnit(u)
})
unitsSvg.addEventListener('keydown', (e) => {
  const u = unitAt(e.target)
  if (u && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault()
    pickUnit(u)
  }
})

// Camera on the tower photo: zoom 1 shows the whole tower, more closes in on a residence.
const cam = { z: 1, tx: 0, ty: 0 }
function focus(u: Unit | null): void {
  if (!u) Object.assign(cam, { z: 1, tx: 0, ty: 0 })
  else {
    const W = stage.clientWidth
    const H = stage.clientHeight
    const z = mobile() ? 1.35 : 1.7
    const c = unitCentre(u)
    const p = cover(c.x, c.y)
    // Keep the residence left of centre on desktop, so the card fits beside it.
    const aim = mobile() ? { x: W / 2, y: H * 0.36 } : { x: W * 0.42, y: H * 0.5 }
    cam.z = z
    cam.tx = Math.min(0, Math.max(W - W * z, aim.x - z * p.x))
    cam.ty = Math.min(0, Math.max(H - H * z, aim.y - z * p.y))
  }
  towerFrame.style.transform = `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.z})`
}

/** Screen position of a render point on the (possibly zoomed) tower photo. */
function towerPoint(x: number, y: number): { x: number; y: number } {
  const p = cover(x, y)
  return { x: cam.tx + cam.z * p.x, y: cam.ty + cam.z * p.y }
}

// ---------- Navigation between views ----------

function openLocation(): void {
  closePanels()
  selectUnit(null)
  setView('location')
  aerialFrame.classList.remove('is-diving')
  showScene('location')
  hint('Tap the tower to explore its residences')
}

/** Dive from the aerial into the tower: the aerial zooms at the tower as the tower photo settles in. */
function openTower(): void {
  closePanels()
  const fromAerial = state.view === 'location' || state.view === 'intro'
  setView('apartments')
  if (fromAerial && !reduced) {
    const o = cover(AERIAL_TOWER.x, AERIAL_TOWER.y)
    aerialFrame.style.transformOrigin = `${o.x}px ${o.y}px`
    aerialFrame.classList.add('is-diving')
    setTimeout(() => aerialFrame.classList.remove('is-diving'), 1400)
  }
  showScene('tower')
  if (!mobile()) toggleRail(true)
  focus(state.unit)
  renderCard()
  hint(state.unit ? '' : 'Tap any residence on the tower to see it')
}

function selectUnit(u: Unit | null): void {
  if (state.unit) polys.get(state.unit.code)?.classList.remove('is-selected')
  state.unit = u
  if (u) polys.get(u.code)?.classList.add('is-selected')
  $$('.results li button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.code === u?.code)))
  if (state.view === 'apartments') focus(u)
  renderCard()
}

function pickUnit(u: Unit): void {
  if (state.view !== 'apartments') openTower()
  selectUnit(u)
  hint('')
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
  leader.classList.toggle('is-on', !card.hidden && !mobile())
  if (!u || card.hidden) return
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
  if (!u || card.hidden || mobile()) {
    card.style.transform = ''
    return
  }
  const c = unitCentre(u)
  const p = towerPoint(c.x, c.y)
  const w = card.offsetWidth
  const h = card.offsetHeight
  const railW = $('#rail').hidden ? 0 : 340
  // Beside the residence, on whichever side has room; the leader joins them.
  const right = p.x + 120 + w < window.innerWidth - railW - 16
  const x = right ? p.x + 120 : Math.max(16, p.x - 120 - w)
  const y = Math.min(window.innerHeight - h - 96, Math.max(84, p.y - h / 2))
  card.style.transform = `translate(${x}px, ${y}px)`
  const line = leader.querySelector('line')!
  const dot = leader.querySelector('circle')!
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
  leader.classList.remove('is-on')
  const inCompare = state.compare.includes(u.code)
  const enquire = `mailto:${brand.salesEmail}?subject=${encodeURIComponent(`Enquiry — Apartment ${u.code}`)}&body=${encodeURIComponent(`Hello, I'd like to know more about apartment ${u.code} (floor ${u.floor}).`)}`
  sheet.innerHTML = `
    <div class="sheet__plans">
      <div class="sheet__key">${keyPlanSvg(u)}<p>Floor ${u.floor}</p></div>
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
      <p class="sheet__note">Concept visuals. Indicative layout; areas are approximate.</p>
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

function openWindow(view: 1 | 2 = 1): void {
  sheet.hidden = true
  app.classList.remove('is-dimmed')
  setView('window')
  showScene('window')
  scenes.window.dataset.view = String(view)
  const bar = $('.windowbar')
  bar.hidden = false
  $$('[data-win]', bar).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.win === String(view))))
  hint('Try the time of day above')
}

function backFromWindow(): void {
  $('.windowbar').hidden = true
  hint('')
  showScene('tower')
  openPlan(state.unit!)
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
  $('.modal').innerHTML = `
    <div class="modal__box">
      <button type="button" class="icon-btn icon-btn--sm modal__close" data-act="modal-close" aria-label="Close highlights">${svg('close')}</button>
      <p class="intro__eyebrow">${brand.tagline}</p>
      <h2 class="modal__title">Tubo <em>Residences</em></h2>
      <dl class="stats"><div><dt>Floors</dt><dd>${FLOORS}</dd></div><div><dt>Residences</dt><dd>${units.length}</dd></div><div><dt>Available</dt><dd>${freeCount}</dd></div><div><dt>Bedrooms</dt><dd>1–3</dd></div></dl>
      <ul class="highlights">${highlights.map((h) => `<li><h3>${h.title}</h3><p>${h.body}</p></li>`).join('')}</ul>
    </div>`
  $('.modal').hidden = false
}

const shots = [
  { name: 'The seafront', img: 'aerial' },
  { name: 'Sunrise', img: 'tower-sunrise' },
  { name: 'By day', img: 'tower-day' },
  { name: 'Overcast', img: 'tower-overcast' },
  { name: 'By night', img: 'tower-night' },
  { name: 'Living room', img: 'interior' },
  { name: 'Balcony view', img: 'balcony' },
]
function openGallery(): void {
  closePanels()
  selectUnit(null)
  setView('gallery')
  showScene('gallery')
  hint('')
  const g = $('.gallery')
  g.innerHTML = shots.map((s, i) => `<button type="button" data-shot="${i}" style="--img:url(${R(s.img)})"><span>${String(i + 1).padStart(2, '0')}</span>${s.name}</button>`).join('')
  g.hidden = false
  goShot(0)
}
function goShot(i: number): void {
  const img = $<HTMLImageElement>('.gallery__img')
  img.classList.remove('is-in')
  img.src = R(shots[i].img)
  img.alt = shots[i].name
  img.decode().catch(() => {}).finally(() => img.classList.add('is-in'))
  $$('[data-shot]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.shot === String(i))))
}

// ---------- Filters ----------

const rail = $('#rail')
function toggleRail(open = rail.hidden): void {
  rail.hidden = !open
  $('.rail-toggle').setAttribute('aria-expanded', String(open))
  app.classList.toggle('rail-open', open)
  placeCard()
}

function renderFilters(): void {
  const chip = (group: string, value: string, label: string, on: boolean, color?: string) =>
    `<button type="button" class="chip" data-group="${group}" data-value="${value}" aria-pressed="${on}">${color ? `<span class="dot" style="--c:${color}"></span>` : ''}${label}</button>`
  const count = (s: Status) => units.filter((u) => u.status === s).length
  $('[data-filter="status"]').innerHTML = (['available', 'reserved', 'sold'] as Status[]).map((s) => chip('status', s, `${statusLabel[s]} <small>${count(s)}</small>`, state.status.has(s), statusColor[s])).join('')
  $('[data-filter="beds"]').innerHTML = chip('beds', 'any', 'Any', state.beds.size === 0) + [1, 2, 3].map((b) => chip('beds', String(b), String(b), state.beds.has(b))).join('')
  $('.floor-out').textContent = `${state.floorMin}–${state.floorMax}`
}

function applyFilters(): void {
  renderFilters()
  for (const u of units) polys.get(u.code)!.classList.toggle('is-off', !matches(u))
  const rank = (u: Unit) => (u.status === 'available' ? 0 : u.status === 'reserved' ? 1 : 2)
  const list = units.filter(matches).sort((a, b) => rank(a) - rank(b) || b.floor - a.floor || a.slot - b.slot)
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
  if (b.dataset.code) return pickUnit(byCode.get(b.dataset.code)!)
  const { group, value } = b.dataset
  if (group === 'status') {
    const s = value as Status
    if (state.status.has(s)) state.status.delete(s)
    else state.status.add(s)
  } else if (group === 'beds') {
    if (value === 'any') state.beds.clear()
    else if (state.beds.has(+value!)) state.beds.delete(+value!)
    else state.beds.add(+value!)
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
  if (act === 'enter') return enter()
  if (act === 'tower') return openTower()
  if (act === 'fullscreen') return void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())
  if (act === 'rail-close') return toggleRail(false)
  if (act === 'card-close') return selectUnit(null)
  if (act === 'compare' && u) return toggleCompare(u)
  if (act === 'plan' && u) return openPlan(u)
  if (act === 'sheet-close') return closePlan()
  if (act === 'window' && u) return openWindow()
  if (act === 'download' && u) return downloadPlan(u)
  if (act === 'drawer-close') return void ($('.drawer').hidden = true)
  if (act === 'modal-close') return void ($('.modal').hidden = true)
  if (win && u) return win === 'back' ? backFromWindow() : openWindow(+win as 1 | 2)
  if (shot) return goShot(+shot)
  if (show) {
    $('.drawer').hidden = true
    return pickUnit(byCode.get(show)!)
  }
  if (remove) return toggleCompare(byCode.get(remove)!)
  if (tab === 'apartments') return state.view === 'apartments' ? selectUnit(null) : openTower()
  if (tab === 'location') return openLocation()
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

window.addEventListener('resize', () => {
  layoutPins()
  if (state.view === 'apartments') focus(state.unit)
  placeCard()
})
// The card follows its residence once the photo has finished panning.
towerFrame.addEventListener('transitionend', placeCard)

// ---------- Start ----------

function enter(): void {
  app.classList.add('is-entered')
  openLocation()
}

applyFilters()
applyTime(1)
layoutPins()
showScene('location')
// Deep link: ?apartment=1804 opens straight onto a residence.
const deep = byCode.get(new URLSearchParams(location.search).get('apartment') ?? '')
if (deep) {
  app.classList.add('is-entered')
  pickUnit(deep)
}
