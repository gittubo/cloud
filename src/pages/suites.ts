// Suites: a beam of light searches the tower floor by floor, locks onto one,
// and the camera dives through that floor's window into the rooms.
import { $, chapter, createFilm, dismissPreloader, frameRect, gsap, initScroll, pinStory, reducedMotion, renderChrome, renderNext, rich, runPreloader, ScrollTrigger, sequenceFor, stillUrl } from '../core'
import { suites } from '../content'

// Scroll lengths in vh: the held tower (the floor scan), the dive, the rooms.
const TOWER = 240
const DIVE = 130
const ROOMS = 440
const TOTAL = TOWER + DIVE + ROOMS

const SRC_H = 1280
const fl = suites.floors
const FLOORS = 12
const step = (fl.guestBottomY - fl.guestTopY) / (fl.guestCount - 1)

/** y-centre of a (fractional) floor in source pixels. */
function floorY(n: number): number {
  const exact = (k: number) => (k <= 1 ? fl.podium[0] : k === 2 ? fl.podium[1] : fl.guestBottomY - (k - 3) * step)
  const lo = Math.max(1, Math.min(FLOORS, Math.floor(n)))
  const hi = Math.min(FLOORS, lo + 1)
  return exact(lo) + (exact(hi) - exact(lo)) * (n - lo)
}

function build(): void {
  $('.overlays').innerHTML = `
    <article class="ov ov--hero" data-ov="hero">
      <p class="eyebrow">${suites.eyebrow}</p>
      <h1 class="title-caps">${rich(suites.hero.title)}</h1>
      <p class="body">${suites.hero.body}</p>
    </article>
    ${suites.features
      .map(
        (f, i) => `
      <article class="ov ov--feature" data-ov="f${i}">
        <p class="feature__n">${String(i + 1).padStart(2, '0')}</p>
        <h2 class="title-caps">${rich(f.title)}</h2>
        <p class="body">${f.body}</p>
      </article>`,
      )
      .join('')}
    <article class="ov ov--finale" data-ov="finale"><p class="finale-word">${suites.finale}</p></article>`

  $('.scan').innerHTML = `
    <div class="scan__grid">${Array.from({ length: FLOORS }, (_, i) => `<i data-floor="${i + 1}"></i>`).join('')}</div>
    <div class="scan__beam"></div>
    <div class="scan__band"></div>
    <div class="scan__lock"><span></span><span></span><span></span><span></span></div>
    <div class="scan__readout">
      <span class="scan__status"><span class="is-searching">${suites.scan.prompt}</span><span class="is-found">Selected</span></span>
      <b class="scan__level">Level 01</b>
      <span class="scan__note">${suites.scan.lockedNote}</span>
    </div>`
}

function initCinematic(): void {
  const seq = sequenceFor('tower', 'dive', 'rooms')
  seq.start()
  const panel = $('.panel')
  const scan = $('.scan')
  const band = $('.scan__band', scan)
  const beam = $('.scan__beam', scan)
  const lock = $('.scan__lock', scan)
  const readout = $('.scan__readout', scan)
  const level = $('.scan__level', scan)
  const lines = [...scan.querySelectorAll<HTMLElement>('.scan__grid i')]

  // Pixel geometry of the tower inside the panel, refreshed on resize.
  let geo = { left: 0, width: 0, rectY: 0, scale: 1 }
  const probe = { floor: 1 }

  const place = () => {
    const y = geo.rectY + floorY(probe.floor) * geo.scale
    const h = step * geo.scale * 1.05
    Object.assign(band.style, { top: `${y - h / 2}px`, height: `${h}px`, left: `${geo.left}px`, width: `${geo.width}px` })
    Object.assign(beam.style, { top: `${y - h * 4}px`, height: `${h * 8}px`, left: `${geo.left}px`, width: `${geo.width}px` })
    readout.style.top = `${y}px`
    level.textContent = `Level ${String(Math.round(probe.floor)).padStart(2, '0')}`
    const near = Math.round(probe.floor)
    lines.forEach((l) => l.classList.toggle('is-near', Number(l.dataset.floor) === near))
  }
  const layout = () => {
    const r = frameRect(panel)
    const pw = panel.clientWidth
    const left = Math.max(0, r.x + fl.x0 * r.w)
    const right = Math.min(pw, r.x + fl.x1 * r.w)
    geo = { left, width: right - left, rectY: r.y, scale: r.h / SRC_H }
    lines.forEach((l) => {
      const y = geo.rectY + floorY(Number(l.dataset.floor)) * geo.scale
      Object.assign(l.style, { top: `${y}px`, left: `${left}px`, width: `${right - left}px` })
    })
    const y = geo.rectY + floorY(fl.lock) * geo.scale
    const h = step * geo.scale * 1.6
    Object.assign(lock.style, { top: `${y - h / 2}px`, height: `${h}px`, left: `${left - 6}px`, width: `${right - left + 12}px` })
    place()
  }

  const state = createFilm(seq, layout)
  layout()
  initScroll()

  const tower = chapter('tower')
  const towerLast = tower.end - tower.start
  const heldFrame = Math.round(towerLast * (1.0 / 2.2)) // the frame the floors were measured on
  const diveLast = chapter('dive').end - tower.start
  const roomsLast = chapter('rooms').end - tower.start

  const tl = gsap.timeline({ defaults: { ease: 'none' } })
  const W = (f: number) => TOWER * f
  const R = (f: number) => TOWER + DIVE + ROOMS * f

  // Film: settle on the tower, hold it for the scan, then dive and walk the rooms.
  tl.to(state, { frame: heldFrame, duration: W(0.12), ease: 'power1.out' }, 0)
  tl.to(state, { frame: towerLast, duration: W(0.12), ease: 'power1.in' }, W(0.88))
  tl.to(state, { frame: diveLast, duration: DIVE, ease: 'power1.inOut' }, TOWER)
  tl.to(state, { frame: roomsLast, duration: ROOMS }, TOWER + DIVE)

  // The scan: grid fades up, the beam hunts across floors, slows, locks.
  tl.fromTo(scan, { autoAlpha: 0 }, { autoAlpha: 1, duration: W(0.05) }, W(0.1))
  tl.fromTo(lines, { scaleX: 0 }, { scaleX: 1, stagger: W(0.006), duration: W(0.05), ease: 'power2.out' }, W(0.1))
  const path: [number, number, string][] = [
    [12, 0.15, 'sine.inOut'],
    [4, 0.12, 'sine.inOut'],
    [11, 0.1, 'sine.inOut'],
    [6, 0.08, 'sine.inOut'],
    [9.4, 0.06, 'sine.inOut'],
    [7.6, 0.05, 'sine.inOut'],
    [fl.lock, 0.04, 'power2.out'],
  ]
  let t = 0.14
  for (const [floor, len, ease] of path) {
    tl.to(probe, { floor, duration: W(len), ease, onUpdate: place }, W(t))
    t += len
  }
  const found = { v: 0 }
  tl.to(found, { v: 1, duration: W(0.02), onUpdate: () => void scan.classList.toggle('is-locked', found.v > 0.5) }, W(t))
  tl.fromTo(lock, { autoAlpha: 0, scaleX: 1.08, scaleY: 1.6 }, { autoAlpha: 1, scaleX: 1, scaleY: 1, duration: W(0.05), ease: 'power3.out' }, W(t))
  tl.to(lines, { opacity: 0.15, duration: W(0.05) }, W(t))
  tl.to('[data-ov="hero"]', { autoAlpha: 0, y: -40, duration: W(0.06), ease: 'power1.in' }, W(0.84))

  // Into the chosen floor: the overlay rushes past as the camera dives.
  tl.to(scan, {
    scale: 5,
    autoAlpha: 0,
    duration: DIVE * 0.4,
    ease: 'power2.in',
    transformOrigin: () => `${geo.left + geo.width / 2}px ${geo.rectY + floorY(fl.lock) * geo.scale}px`,
  }, TOWER - W(0.04))

  // Rooms: numbered features, then the closing word.
  suites.features.forEach((f, i) => {
    const el = $(`[data-ov="f${i}"]`)
    const next = suites.features[i + 1]?.at ?? 0.8
    tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: ROOMS * 0.01 }, R(f.at + 0.01))
    tl.fromTo(el.children, { y: 50, opacity: 0, filter: 'blur(8px)' }, { y: 0, opacity: 1, filter: 'blur(0px)', stagger: ROOMS * 0.01, duration: ROOMS * 0.04, ease: 'power3.out' }, R(f.at + 0.01))
    tl.to(el, { autoAlpha: 0, y: -40, duration: ROOMS * 0.03, ease: 'power1.in' }, R(next - 0.04))
  })
  const finale = $('[data-ov="finale"]')
  tl.fromTo(finale, { autoAlpha: 0, letterSpacing: '0.4em', filter: 'blur(14px)' }, { autoAlpha: 1, letterSpacing: '0.02em', filter: 'blur(0px)', duration: ROOMS * 0.08, ease: 'power3.out' }, R(0.86))

  pinStory(tl, TOTAL)
  Object.assign(window, {
    __story: { at: (id: string, f: number) => (id === 'tower' ? W(f) : id === 'dive' ? TOWER + DIVE * f : R(f)) },
  })

  runPreloader(seq).then(() => {
    dismissPreloader()
    gsap.from('[data-ov="hero"] > *', { y: 50, opacity: 0, filter: 'blur(8px)', stagger: 0.12, duration: 1.3, delay: 0.4, ease: 'power3.out' })
    document.fonts.ready.then(layout)
    ScrollTrigger.refresh()
  })
}

function initStatic(): void {
  document.documentElement.classList.add('is-static')
  $('.story').innerHTML = `
    <figure class="still"><img src="${stillUrl('tower', 0.45)}" alt="" /><div class="overlays">${$('[data-ov="hero"]').outerHTML}</div></figure>
    ${suites.features.map((f, i) => `<figure class="still"><img src="${stillUrl('rooms', f.at + 0.04)}" alt="" loading="lazy" /><div class="overlays">${$(`[data-ov="f${i}"]`).outerHTML}</div></figure>`).join('')}`
  $('.preloader').remove()
}

renderChrome('suites')
renderNext('suites')
build()
if (reducedMotion) initStatic()
else initCinematic()
