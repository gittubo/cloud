// Tubo — one scroll story: walk in from the street, take the name off the
// reception wall, then the salon unfolds section by section. Every pinned section is a scrubbed GSAP
// timeline; visitors who prefer reduced motion get a static page.
import '@fontsource/anton/400.css'
import '@fontsource-variable/cormorant-garamond'
import '@fontsource-variable/manrope'
import '@fontsource/libre-caslon-text/700.css'
import '@fontsource/great-vibes/400.css'
import './styles.css'

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

import { contact, socials, whatsappLink } from './content'
import frames from './frames.generated.json'
import { drawCover, FrameSequence, renderFrame, type Tier } from './sequence'

gsap.registerPlugin(ScrollTrigger)

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll<T>(sel))

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const desktop = '(min-width: 961px)'
let lenis: Lenis | null = null

/** Wraps each character of el in <span class="ch" data-c="…"> and returns them. */
function splitChars(el: HTMLElement): HTMLElement[] {
  const chars = [...(el.textContent ?? '')].map((c) =>
    Object.assign(document.createElement('span'), { className: 'ch', textContent: c }),
  )
  chars.forEach((c) => (c.dataset.c = c.textContent ?? ''))
  el.replaceChildren(...chars)
  return chars
}

// ---------- Contact placeholders ----------

function fillContact(): void {
  for (const el of $$('[data-contact]')) {
    const key = el.dataset.contact
    if (key === 'whatsapp') (el as HTMLAnchorElement).href = whatsappLink()
    else if (key === 'phone') {
      ;(el as HTMLAnchorElement).href = contact.phoneHref
      el.textContent = contact.phone
    } else if (key === 'email') {
      ;(el as HTMLAnchorElement).href = `mailto:${contact.email}`
      el.textContent = contact.email
    } else if (key === 'street') el.textContent = contact.street
    else if (key === 'city') el.textContent = contact.city
    else if (key === 'instagramHandle') el.textContent = socials[0].handle
    else if (key === 'hours')
      el.replaceChildren(
        ...contact.hours.flatMap(([days, time]) => [
          Object.assign(document.createElement('span'), { textContent: days }),
          Object.assign(document.createElement('span'), { textContent: time }),
        ]),
      )
    else if (key === 'socials')
      el.replaceChildren(
        ...socials.map((s) =>
          Object.assign(document.createElement('a'), {
            href: s.href,
            target: '_blank',
            rel: 'noopener',
            textContent: s.label,
            title: s.handle,
          }),
        ),
      )
    else if (key === 'map')
      (el as HTMLIFrameElement).src = `https://www.google.com/maps?q=${encodeURIComponent(contact.mapQuery)}&z=12&output=embed`
  }
  for (const el of $$('[data-year]')) el.textContent = String(new Date().getFullYear())

  $<HTMLFormElement>('.book').addEventListener('submit', (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget as HTMLFormElement)
    const lines = [
      'Hello Tubo, I would like to book an appointment.',
      `Name: ${f.get('name')}`,
      `Phone: ${f.get('phone')}`,
      `Treatment: ${f.get('treatment')}`,
      f.get('date') ? `Preferred date: ${f.get('date')}` : '',
      f.get('notes') ? `Notes: ${f.get('notes')}` : '',
    ]
    window.open(whatsappLink(lines.filter(Boolean).join('\n')), '_blank', 'noopener')
  })
}

// ---------- Videos play only while on screen ----------

function autoplayVideos(): void {
  const io = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) {
        const v = target as HTMLVideoElement
        if (isIntersecting && !reducedMotion) v.play().catch(() => {})
        else v.pause()
      }
    },
    { threshold: 0.15 },
  )
  for (const v of $$<HTMLVideoElement>('video')) io.observe(v)
}

// ---------- Hero film ----------

function pickTier(): Tier {
  const forced = new URLSearchParams(location.search).get('tier')
  if (forced === 'hd' || forced === 'sd') return forced
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (conn?.saveData || /2g|3g/.test(conn?.effectiveType ?? '')) return 'sd'
  return window.innerWidth < 700 ? 'sd' : 'hd'
}

type Film = { frame: number; zoom: number; wall: number }

function createFilm(seq: FrameSequence, tier: Tier): Film {
  const canvas = $<HTMLCanvasElement>('.hero__film')
  const ctx = canvas.getContext('2d', { alpha: false })!
  const state: Film = { frame: 0, zoom: 1, wall: 0 }
  let dirty = true

  // The last frame with the sign painted out, laid over the film as the
  // name comes off the wall.
  const wall = new Image()
  wall.src = `${import.meta.env.BASE_URL}frames/${tier}/wall.webp`
  wall.decode().then(() => (dirty = true), () => {})

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(canvas.clientWidth * dpr)
    canvas.height = Math.round(canvas.clientHeight * dpr)
    ctx.imageSmoothingQuality = 'high'
    dirty = true
  }
  resize()
  window.addEventListener('resize', resize)
  seq.onLoad = () => (dirty = true)

  let last: Film = { frame: -1, zoom: -1, wall: -1 }
  gsap.ticker.add(() => {
    if (!dirty && last.frame === state.frame && last.zoom === state.zoom && last.wall === state.wall) return
    seq.setPlayhead(state.frame)
    renderFrame(ctx, seq, state.frame, state.zoom)
    if (state.wall > 0 && wall.complete && wall.naturalWidth) drawCover(ctx, wall, state.wall, state.zoom)
    last = { ...state }
    dirty = false
  })
  return state
}

function preload(seq: FrameSequence): Promise<void> {
  const bar = $('.preloader__bar span')
  return new Promise((resolve) => {
    const need = Math.min(seq.bootstrapSize, 12)
    const tick = () => {
      bar.style.transform = `scaleX(${Math.min(1, seq.loaded / need)})`
      if (seq.loaded >= need) resolve()
    }
    const prev = seq.onLoad
    seq.onLoad = () => {
      prev?.()
      tick()
    }
    setTimeout(resolve, 6000) // never hold the page hostage to a slow network
  })
}

// ---------- The name comes off the wall ----------

// Ink box of the "Tubo" lettering on the reception wall in the film's last
// frame, as fractions of the frame (measured on the 1280x720 source). Keep in
// step with SIGN_* in scripts/build-media.sh.
const SIGN = { x: 556 / 1280, y: 304 / 720, w: 103 / 1280, h: 31 / 720 }
const FRAME_ASPECT = 1280 / 720
const LAYERS = 22 // slices that give the letters their depth
const DEPTH = 0.1 // em

type Pull = { lift: number; pull: number; gloss: number }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const mixHex = (a: string, b: string, t: number) => {
  const ca = a.match(/\w\w/g)!.map((h) => parseInt(h, 16))
  const cb = b.match(/\w\w/g)!.map((h) => parseInt(h, 16))
  return `rgb(${ca.map((v, i) => Math.round(lerp(v, cb[i], t))).join(',')})`
}

/**
 * Builds the layered 3D word and returns a renderer that places it from three
 * progress values: lift (it comes away from the wall), pull (it travels to the
 * viewer and lands on the title slot) and gloss (espresso turns to lacquer).
 * Everything is recomputed from the film's cover-fit, so it stays glued to the
 * painted-out sign at any viewport size.
 */
function createPull(film: Film) {
  const stage = $('.hero__stage')
  const slot = $('.hero__slot')
  const move = $('.pull__move')
  const spin = $('.pull__spin')
  const shadow = $('.pull__shadow')
  const canvas = $('.hero__film')
  const veil = $('.hero__veil')

  const layer = (k: number, extra = '') => {
    const el = Object.assign(document.createElement('span'), { className: `pull__layer ${extra}`.trim(), textContent: 'Tubo' })
    el.style.setProperty('--k', String(k))
    el.style.transform = `translateZ(${(-k * DEPTH).toFixed(4)}em)`
    return el
  }
  const sides = Array.from({ length: LAYERS }, (_, i) => layer((i + 1) / LAYERS))
  const face = Object.assign(document.createElement('span'), { className: 'pull__face pull__face--wall', textContent: 'Tubo' })
  const gloss = Object.assign(document.createElement('span'), { className: 'pull__face pull__face--gloss', textContent: 'Tubo' })
  gloss.dataset.text = 'Tubo'
  spin.replaceChildren(...sides.reverse(), face, gloss)

  // Ink metrics of the word as set in CSS, so its ink (not its line box) can
  // be matched to the lettering in the film.
  let geo: { left: number; top: number; ox: number; oy: number; inkW: number; inkH: number } | null = null
  const measure = () => {
    const cs = getComputedStyle(move)
    const size = parseFloat(cs.fontSize)
    const ctx = document.createElement('canvas').getContext('2d')!
    ctx.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`
    ctx.letterSpacing = cs.letterSpacing
    const m = ctx.measureText('Tubo')
    const baseline = size / 2 + (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2
    const s = stage.getBoundingClientRect()
    const r = slot.getBoundingClientRect()
    geo = {
      left: r.left - s.left,
      top: r.top - s.top,
      ox: (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2,
      oy: baseline + (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2,
      inkW: m.actualBoundingBoxLeft + m.actualBoundingBoxRight,
      inkH: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent,
    }
    for (const el of [move, shadow]) {
      el.style.left = `${geo.left}px`
      el.style.top = `${geo.top}px`
      el.style.transformOrigin = `${geo.ox}px ${geo.oy}px`
    }
  }
  const invalidate = () => (geo = null)
  window.addEventListener('resize', invalidate)
  ScrollTrigger.addEventListener('refreshInit', invalidate)

  // Where the sign sits on screen, following the canvas cover-fit and zoom.
  const sign = () => {
    const cw = canvas.clientWidth
    const ch = canvas.clientHeight
    const iw = Math.max(cw, ch * FRAME_ASPECT) * film.zoom
    const ih = iw / FRAME_ASPECT
    const x = (cw - iw) / 2 + (SIGN.x + SIGN.w / 2) * iw
    const y = (ch - ih) / 2 + (SIGN.y + SIGN.h / 2) * ih
    return { x, y, w: SIGN.w * iw, h: SIGN.h * ih }
  }

  const state: Pull = { lift: 0, pull: 0, gloss: 0 }
  const render = () => {
    if (!geo) measure()
    const g = geo!
    const at = sign()
    const { lift, pull } = state
    const e = gsap.parseEase('power3.inOut')(pull)
    const sx0 = at.w / g.inkW
    const sy0 = at.h / g.inkH
    const dx = at.x - (g.left + g.ox)
    const dy = at.y - (g.top + g.oy)
    const grow = 1 + 0.14 * lift // coming off the wall toward you

    gsap.set(move, {
      x: lerp(dx, 0, e),
      y: lerp(dy - lift * at.h * 0.18, 0, e),
      scaleX: lerp(sx0 * grow, 1, e),
      scaleY: lerp(sy0 * grow, 1, e),
    })
    // Tips forward as it unhooks, then swings in flight to show its depth.
    gsap.set(spin, {
      rotationX: lerp(-16 * lift, 0, e) + Math.sin(e * Math.PI) * 8,
      rotationY: Math.sin(e * Math.PI) * -26,
    })
    // Its shadow stays on the wall, spreading and fading as the word leaves.
    gsap.set(shadow, {
      x: dx + at.w * (0.05 * lift + 0.2 * e),
      y: dy + at.h * (0.32 * lift + 0.9 * e),
      scaleX: sx0 * (1 + 0.08 * lift + 0.3 * e),
      scaleY: sy0 * (1 + 0.08 * lift + 0.3 * e),
      opacity: 0.75 * lift * (1 - e) ** 1.6,
      filter: `blur(${(4 + 30 * lift + 90 * e).toFixed(1)}px)`,
    })
    spin.style.setProperty('--side', mixHex('1b1108', '4a0c22', state.gloss))
    face.style.opacity = String(1 - state.gloss)
    gloss.style.opacity = String(state.gloss)
    // Focus racks from the wall to the name.
    canvas.style.filter = pull > 0 ? `blur(${(e * 9).toFixed(2)}px) brightness(${(1 - 0.18 * e).toFixed(3)})` : ''
    veil.style.opacity = String(e * 0.9)
  }
  return { state, render, gloss, sides }
}

function heroTimeline(film: Film, count: number): void {
  const pull = createPull(film)
  const subChars = splitChars($('.hero__sub-text'))
  const lines = $$('.hero__sub i')
  gsap.set('.hero__title', { autoAlpha: 1 })
  gsap.set(subChars, { autoAlpha: 0 })
  gsap.set(lines, { scaleX: 0 })

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    onUpdate: pull.render,
    scrollTrigger: { trigger: '.hero', start: 'top top', end: '+=460%', scrub: 0.6, pin: '.hero__stage', invalidateOnRefresh: true },
  })
  tl.to(film, { frame: count - 1, duration: 0.5 }, 0)
    .to(film, { zoom: 1.04, duration: 0.5, ease: 'power1.in' }, 0)
    .to('.cue', { autoAlpha: 0, duration: 0.04 }, 0)
    .to('.hero__info', { autoAlpha: 0, y: -24, duration: 0.08 }, 0.38)
    // The live word takes the sign's place on the wall.
    .to('.pull', { autoAlpha: 1, duration: 0.03 }, 0.5)
    .to(film, { wall: 1, duration: 0.03 }, 0.5)
    .to(pull.state, { lift: 1, duration: 0.1, ease: 'power2.out' }, 0.53)
    .to(pull.state, { pull: 1, duration: 0.26 }, 0.62)
    .to(pull.state, { gloss: 1, duration: 0.14, ease: 'power1.inOut' }, 0.7)
    .fromTo(pull.gloss, { '--shine': '160%' }, { '--shine': '-60%', duration: 0.12, ease: 'power1.inOut' }, 0.84)
    .to(lines, { scaleX: 1, duration: 0.06, ease: 'power2.out' }, 0.86)
    .to(subChars, { autoAlpha: 1, stagger: 0.004, duration: 0.02 }, 0.87)
    .to('.hero__script', { clipPath: 'inset(0 0% 0 0)', duration: 0.07, ease: 'power1.inOut' }, 0.91)
    .to({}, { duration: 0.03 })
  pull.render()

  // Once the name has landed, the polish catches the light every few
  // seconds, and on desktop it tilts toward the pointer.
  const idle = gsap.timeline({ repeat: -1, repeatDelay: 2.8, paused: true })
  idle.fromTo(pull.gloss, { '--shine': '160%' }, { '--shine': '-60%', duration: 1.5, ease: 'power1.inOut' })
  const tiltX = gsap.quickTo('.pull__tilt', 'rotationX', { duration: 0.9, ease: 'power3.out' })
  const tiltY = gsap.quickTo('.pull__tilt', 'rotationY', { duration: 0.9, ease: 'power3.out' })
  let landed = false
  if (window.matchMedia('(hover: hover)').matches)
    window.addEventListener('pointermove', (e) => {
      if (!landed) return
      tiltY((e.clientX / window.innerWidth - 0.5) * 30)
      tiltX((e.clientY / window.innerHeight - 0.5) * -18)
    })
  ScrollTrigger.create({
    trigger: '.hero',
    start: () => tl.scrollTrigger!.start + (tl.scrollTrigger!.end - tl.scrollTrigger!.start) * 0.97,
    end: () => tl.scrollTrigger!.end + window.innerHeight,
    onToggle: ({ isActive }) => {
      landed = isActive
      if (isActive) idle.restart(true)
      else {
        idle.pause()
        tiltX(0)
        tiltY(0)
      }
    },
  })
}

/** Reduced motion: the name already off the wall, title in place. */
function heroStatic(film: Film, count: number): void {
  const pull = createPull(film)
  film.frame = count - 1
  film.wall = 1
  Object.assign(pull.state, { lift: 1, pull: 1, gloss: 1 })
  splitChars($('.hero__sub-text'))
  const render = () => pull.render()
  window.addEventListener('resize', () => requestAnimationFrame(render))
  render()
}

// ---------- Sections ----------

/**
 * Photos fly in from the right in groups, settle over the name, then blur
 * away as the next group lands — on a loop while the section is on screen.
 */
function plates(): void {
  const sets = $$('.plates__set').map((s) => $$('img', s))
  let current = -1
  let timer = 0

  const land = (i: number) => {
    const imgs = sets[i]
    gsap.fromTo(
      imgs,
      { autoAlpha: 0, x: () => gsap.utils.random(260, 520), y: () => gsap.utils.random(-120, 160), rotation: () => gsap.utils.random(18, 40), scale: 1.18, filter: 'blur(10px)' },
      { autoAlpha: 1, x: 0, y: 0, rotation: 0, scale: 1, filter: 'blur(0px)', duration: 1.1, stagger: 0.12, ease: 'power3.out', overwrite: true },
    )
  }
  const leave = (i: number) => {
    gsap.to(sets[i], {
      autoAlpha: 0,
      x: () => gsap.utils.random(-160, -60),
      y: () => gsap.utils.random(-40, 60),
      scale: 0.92,
      filter: 'blur(12px)',
      duration: 0.7,
      stagger: 0.06,
      ease: 'power2.in',
      overwrite: true,
    })
  }
  const next = () => {
    if (current >= 0) leave(current)
    current = (current + 1) % sets.length
    gsap.delayedCall(current === 0 && timer === 0 ? 0 : 0.35, () => land(current))
  }
  const start = () => {
    if (timer) return
    next()
    timer = window.setInterval(next, 3400)
  }
  const stop = () => {
    clearInterval(timer)
    timer = 0
  }
  ScrollTrigger.create({ trigger: '.intro', start: 'top 70%', end: 'bottom top', onToggle: ({ isActive }) => (isActive ? start() : stop()) })
}

function introTimeline(): void {
  const mm = gsap.matchMedia()
  mm.add(desktop, () => {
    gsap
      .timeline({
        defaults: { ease: 'power2.out' },
        scrollTrigger: { trigger: '.intro', start: 'top top', end: '+=140%', scrub: 0.6, pin: '.intro__stage' },
      })
      .from('.intro__title span', { xPercent: -18, autoAlpha: 0, stagger: 0.12, duration: 0.4 }, 0)
      .from('.intro__card', { y: 60, autoAlpha: 0, duration: 0.3 }, 0.45)
      .to({}, { duration: 0.35 })
  })
  plates()
}

function socialTimeline(): void {
  const post = $('.post')
  const media = $('.post__media')
  // Scale that makes the post's video fill the screen, and the shift that centres it.
  const coverScale = () => {
    const r = media.getBoundingClientRect()
    const s = gsap.getProperty(post, 'scale') as number
    return Math.max(window.innerWidth / (r.width / s), window.innerHeight / (r.height / s)) * 1.02
  }
  const centreShift = () => {
    const head = $('.post__head').offsetHeight
    const foot = $('.post__foot').offsetHeight
    return ((foot - head) / 2) * coverScale()
  }

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: '.social',
      start: 'top top',
      end: '+=260%',
      scrub: 0.6,
      pin: '.social__stage',
      invalidateOnRefresh: true,
    },
  })
  tl.fromTo('.social__marquee', { xPercent: 0 }, { xPercent: -50, duration: 1 }, 0)
    .fromTo(post, { scale: 0.35, y: '40vh', rotate: -8, autoAlpha: 0 }, { scale: 1, y: 0, rotate: 0, autoAlpha: 1, duration: 0.25, ease: 'back.out(1.4)' }, 0.02)
    .from('.social__caption', { autoAlpha: 0, y: 30, duration: 0.12 }, 0.22)
    .to('.social__caption', { autoAlpha: 0, duration: 0.08 }, 0.5)
    .to(['.post__head', '.post__foot'], { autoAlpha: 0, duration: 0.08 }, 0.55)
    .to(post, { borderRadius: 0, duration: 0.3 }, 0.58)
    .to(post, { scale: coverScale, y: centreShift, duration: 0.32, ease: 'power2.inOut' }, 0.58)
}

/**
 * 3D gallery. Scroll first lifts the headline away and raises the deck, then
 * walks it card by card: `pos` is the (fractional) index of the front card.
 * Arrows and clicks jump the page to the matching scroll position.
 */
function deck(): void {
  const cards = $$('.deck__card')
  const n = cards.length
  const caption = $('.deck__caption')
  const index = $('.deck__index')
  const bar = $('.deck__progress span')
  $('.deck__total').textContent = String(n).padStart(2, '0')
  const state = { pos: 0 }
  let shown = -1

  const pose = (i: number) => {
    const o = i - state.pos
    const a = Math.abs(o)
    const side = Math.sign(o)
    // -50 centres the card on the deck's midpoint (left/top: 50% in CSS).
    return {
      xPercent: -50 + side * Math.min(a, 3) * 52 - side * Math.max(0, a - 1) * 12,
      yPercent: -50,
      z: -Math.min(a, 3.5) * 260,
      rotationY: -side * Math.min(a, 1) * 28,
      scale: 1 - Math.min(a, 3) * 0.04,
      autoAlpha: a > 3.2 ? 0 : 1 - Math.max(0, a - 1.8) * 0.6,
      filter: `blur(${Math.max(0, a - 0.6) * 3.2}px) brightness(${1 - Math.min(a, 2) * 0.06})`,
      zIndex: 40 - Math.round(a * 10),
    }
  }
  const layout = () => {
    cards.forEach((c, i) => gsap.set(c, pose(i)))
    const active = Math.round(state.pos)
    bar.style.transform = `scaleX(${n > 1 ? state.pos / (n - 1) : 1})`
    if (active === shown) return
    shown = active
    caption.textContent = cards[active].dataset.caption ?? ''
    index.textContent = String(active + 1).padStart(2, '0')
  }

  // Where in the pinned scroll the walk-through starts (after the lift).
  const WALK = 0.18
  let trigger: ScrollTrigger | null = null
  const go = (to: number) => {
    const target = gsap.utils.clamp(0, n - 1, to)
    if (trigger && lenis) {
      const y = trigger.start + (trigger.end - trigger.start) * (WALK + (1 - WALK) * (target / (n - 1)))
      lenis.scrollTo(y, { duration: 1.1 })
    } else gsap.to(state, { pos: target, duration: 0.8, ease: 'power3.out', onUpdate: layout })
  }

  for (const b of $$('.deck__arrows button'))
    b.addEventListener('click', () => go(Math.round(state.pos) + Number(b.dataset.dir)))
  cards.forEach((c, i) => c.addEventListener('click', () => go(i)))
  $('.deck').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(Math.round(state.pos) - 1)
    if (e.key === 'ArrowRight') go(Math.round(state.pos) + 1)
  })
  layout()

  if (reducedMotion) return
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: '.feature',
      start: 'top top',
      end: () => `+=${n * 55}%`,
      scrub: 0.6,
      pin: '.feature__stage',
      invalidateOnRefresh: true,
    },
  })
  tl.from('.feature__copy > *', { y: 40, autoAlpha: 0, stagger: 0.02, duration: 0.05, ease: 'power2.out' }, 0)
    .fromTo('.deck', { y: () => window.innerHeight * 0.42 }, { y: 0, duration: WALK - 0.04, ease: 'power2.inOut' }, 0.04)
    .to('.feature__copy', { y: () => -window.innerHeight * 0.35, autoAlpha: 0, duration: WALK - 0.06, ease: 'power2.in' }, 0.08)
    .to(state, { pos: n - 1, duration: 1 - WALK, onUpdate: layout }, WALK)
  trigger = tl.scrollTrigger!
}

function statement(): void {
  const el = $('.statement__text')
  const parts = (el.textContent ?? '').split(/(\*[^*]+\*)/).filter(Boolean)
  el.replaceChildren(
    ...parts.flatMap((part) => {
      const accent = part.startsWith('*')
      return part
        .replace(/\*/g, '')
        .split(/\s+/)
        .filter(Boolean)
        .flatMap((word) => [
          Object.assign(document.createElement('span'), { className: accent ? 'w w--accent' : 'w', textContent: word }),
          document.createTextNode(' '),
        ])
    }),
  )
  if (reducedMotion) return
  const words = $$('.w', el)
  ScrollTrigger.create({
    trigger: '.statement',
    start: 'top top',
    end: '+=110%',
    pin: '.statement__stage',
    scrub: true,
    onUpdate: ({ progress }) => {
      const on = Math.round(progress * 1.15 * words.length)
      words.forEach((w, i) => w.classList.toggle('is-on', i < on))
    },
  })
  gsap.from('.statement__link', { autoAlpha: 0, y: 20, scrollTrigger: { trigger: '.statement', start: 'top -60%', toggleActions: 'play none none reverse' } })
}

function revealTimeline(): void {
  gsap
    .timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: '.reveal', start: 'top top', end: '+=220%', scrub: 0.6, pin: '.reveal__stage' },
    })
    .fromTo('.reveal__name', { autoAlpha: 0, scale: 0.88, filter: 'blur(14px)' }, { autoAlpha: 1, scale: 1, filter: 'blur(0px)', duration: 0.3, ease: 'power2.out' }, 0)
    .from('.reveal__sub', { autoAlpha: 0, y: 20, duration: 0.15 }, 0.15)
    .fromTo('.reveal__frame', { clipPath: 'inset(100% 30% 0% 30% round 18px)' }, { clipPath: 'inset(62% 30% 0% 30% round 18px)', duration: 0.15 }, 0.25)
    .to('.reveal__frame', { clipPath: 'inset(0% 0% 0% 0% round 0px)', duration: 0.4, ease: 'power2.inOut' }, 0.45)
    .to(['.reveal__name', '.reveal__sub'], { autoAlpha: 0, duration: 0.15 }, 0.6)
    .from('.reveal__headline', { autoAlpha: 0, y: 50, duration: 0.15, ease: 'power2.out' }, 0.8)
}

function navState(): void {
  const nav = $('.nav')
  const solid = () => {
    const hero = $('.hero').getBoundingClientRect()
    nav.classList.toggle('is-solid', hero.bottom <= 64)
  }
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: solid })
  solid()
}

function smoothScroll(): void {
  const smooth = (lenis = new Lenis({ lerp: 0.1 }))
  smooth.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((t) => smooth.raf(t * 1000))
  gsap.ticker.lagSmoothing(0)
  for (const a of $$<HTMLAnchorElement>('a[href^="#"]')) {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href')!
      if (id.length < 2) return
      const target = id === '#top' ? 0 : document.querySelector<HTMLElement>(id)
      if (target === null) return
      e.preventDefault()
      smooth.scrollTo(target, { offset: id === '#top' ? 0 : -64, duration: 1.6 })
    })
  }
}

// ---------- Boot ----------

async function main(): Promise<void> {
  fillContact()
  autoplayVideos()

  const tier = pickTier()
  const seq = new FrameSequence(frames.count, tier)
  const film = createFilm(seq, tier)
  seq.start()
  // The word is matched to the wall sign by its ink, so its font must be in.
  await document.fonts.load('700 100px "Libre Caslon Text"').catch(() => {})

  if (reducedMotion) {
    heroStatic(film, frames.count)
    statement()
    deck()
    await preload(seq)
    $('.preloader').classList.add('is-done')
    navState()
    return
  }

  // Pinned sections must be set up top to bottom so each pin's spacing is known.
  smoothScroll()
  heroTimeline(film, frames.count)
  introTimeline()
  socialTimeline()
  deck()
  statement()
  revealTimeline()
  navState()

  await preload(seq)
  $('.preloader').classList.add('is-done')
  gsap.from('.hero__info > *', { y: 30, autoAlpha: 0, stagger: 0.08, duration: 1, ease: 'power3.out', delay: 0.2 })
  ScrollTrigger.refresh()
}

main()
