// Tubo Privé — one scroll story: walk in from the street, then the clinic
// unfolds section by section. Every pinned section is a scrubbed GSAP
// timeline; visitors who prefer reduced motion get a static page.
import '@fontsource/anton/400.css'
import '@fontsource-variable/cormorant-garamond'
import '@fontsource-variable/manrope'
import '@fontsource-variable/bodoni-moda/wght.css'
import './styles.css'

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

import { contact, socials, whatsappLink } from './content'
import frames from './frames.generated.json'
import { FrameSequence, renderFrame, type Tier } from './sequence'

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
      'Hello Tubo Privé, I would like to book a visit.',
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

function createFilm(seq: FrameSequence) {
  const canvas = $<HTMLCanvasElement>('.hero__film')
  const ctx = canvas.getContext('2d', { alpha: false })!
  const state = { frame: 0, zoom: 1 }
  let dirty = true

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

  let last = { frame: -1, zoom: -1 }
  gsap.ticker.add(() => {
    if (!dirty && last.frame === state.frame && last.zoom === state.zoom) return
    seq.setPlayhead(state.frame)
    renderFrame(ctx, seq, state.frame, state.zoom)
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

/** Gold name: letters, then the subtitle lines, then a sweep of light. */
function luxTitle() {
  const lux = $('.lux')
  const chars = splitChars(lux)
  const flare = lux.appendChild(Object.assign(document.createElement('span'), { className: 'lux__flare' }))
  const subChars = splitChars($('.hero__sub-text'))
  const lines = $$('.hero__sub i')
  return { lux, chars, flare, subChars, lines }
}

function heroTimeline(film: { frame: number; zoom: number }, count: number): void {
  const t = luxTitle()
  gsap.set('.hero__title', { autoAlpha: 1 })
  gsap.set(t.chars, { autoAlpha: 0, yPercent: 30, scale: 1.25, filter: 'blur(10px)' })
  gsap.set(t.subChars, { autoAlpha: 0 })
  gsap.set(t.lines, { scaleX: 0 })

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: '.hero', start: 'top top', end: '+=380%', scrub: 0.6, pin: '.hero__stage' },
  })
  tl.to(film, { frame: count - 1, duration: 0.72 }, 0)
    .to(film, { zoom: 1.06, duration: 1, ease: 'power1.in' }, 0)
    .to('.cue', { autoAlpha: 0, duration: 0.05 }, 0)
    // The lobby stays sharp, only dimmed, so the gold reads against it.
    .to('.hero__film', { opacity: 0.72, duration: 0.2 }, 0.5)
    .to(t.chars, { autoAlpha: 1, yPercent: 0, scale: 1, filter: 'blur(0px)', stagger: 0.022, duration: 0.09, ease: 'power2.out' }, 0.52)
    .to(t.lines, { scaleX: 1, duration: 0.1, ease: 'power2.out' }, 0.7)
    .to(t.subChars, { autoAlpha: 1, stagger: 0.006, duration: 0.03 }, 0.72)
    .fromTo(t.lux, { '--shine': '160%' }, { '--shine': '-60%', duration: 0.2, ease: 'power1.inOut' }, 0.78)
    .fromTo(t.flare, { '--flare': '-10%' }, { '--flare': '110%', duration: 0.2, ease: 'power1.inOut' }, 0.78)
    .to(t.flare, { opacity: 1, duration: 0.04 }, 0.78)
    .to(t.flare, { opacity: 0, duration: 0.05 }, 0.93)
    .to({}, { duration: 0.04 })

  // Once the name is up, the gleam keeps passing over it every few seconds.
  const idle = gsap.timeline({ repeat: -1, repeatDelay: 3.2, paused: true })
  idle
    .fromTo(t.lux, { '--shine': '160%' }, { '--shine': '-60%', duration: 1.4, ease: 'power1.inOut' }, 0)
    .fromTo(t.flare, { '--flare': '-10%' }, { '--flare': '110%', duration: 1.4, ease: 'power1.inOut' }, 0)
    .fromTo(t.flare, { opacity: 0 }, { opacity: 1, duration: 0.3, yoyo: true, repeat: 1, repeatDelay: 0.8 }, 0)
  ScrollTrigger.create({
    trigger: '.hero',
    start: () => tl.scrollTrigger!.start + (tl.scrollTrigger!.end - tl.scrollTrigger!.start) * 0.98,
    end: () => tl.scrollTrigger!.end + window.innerHeight,
    onToggle: ({ isActive }) => (isActive ? idle.restart(true) : idle.pause()),
  })
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

  const seq = new FrameSequence(frames.count, pickTier())
  const film = createFilm(seq)
  seq.start()

  if (reducedMotion) {
    luxTitle()
    statement()
    deck()
    film.frame = frames.count - 1
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
