// Tubo Privé — one scroll story: walk in from the street, then the clinic
// unfolds section by section. Every pinned section is a scrubbed GSAP
// timeline; visitors who prefer reduced motion get a static page.
import '@fontsource/anton/400.css'
import '@fontsource-variable/cormorant-garamond'
import '@fontsource-variable/manrope'
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

function heroTimeline(film: { frame: number; zoom: number }, count: number): void {
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: '.hero', start: 'top top', end: '+=340%', scrub: 0.6, pin: '.hero__stage' },
  })
  tl.to(film, { frame: count - 1, duration: 0.8 }, 0)
    .to(film, { zoom: 1.08, duration: 1, ease: 'power1.in' }, 0)
    .to('.cue', { autoAlpha: 0, duration: 0.05 }, 0)
    .to('.hero__info', { autoAlpha: 0, y: -40, duration: 0.14 }, 0.5)
    // Soften the lobby (and its wall sign) so the gold name reads cleanly over it.
    .to('.hero__film', { opacity: 0.5, filter: 'blur(8px)', duration: 0.25 }, 0.68)
    .fromTo(
      '.hero__title',
      { autoAlpha: 0, y: 80, scale: 0.86 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.24, ease: 'power2.out' },
      0.7,
    )
    .to({}, { duration: 0.08 })
}

// ---------- Sections ----------

function introTimeline(): void {
  const fan = $$('.intro__fan img')
  const mm = gsap.matchMedia()
  mm.add(desktop, () => {
    const tl = gsap.timeline({
      defaults: { ease: 'power2.out' },
      scrollTrigger: { trigger: '.intro', start: 'top top', end: '+=140%', scrub: 0.6, pin: '.intro__stage' },
    })
    tl.from('.intro__title span', { xPercent: -18, autoAlpha: 0, stagger: 0.12, duration: 0.4 }, 0)
      .from(fan, { x: '55vw', y: 120, rotate: 28, autoAlpha: 0, stagger: 0.12, duration: 0.45 }, 0.1)
      .from('.intro__card', { y: 60, autoAlpha: 0, duration: 0.3 }, 0.55)
      .to({}, { duration: 0.2 })
  })
  mm.add('(max-width: 960px)', () => {
    gsap.from(fan, {
      x: 160,
      rotate: 20,
      autoAlpha: 0,
      stagger: 0.1,
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: { trigger: '.intro__fan', start: 'top 85%' },
    })
  })
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

function deck(): void {
  const cards = $$('.deck__card')
  const n = cards.length
  const caption = $('.deck__caption')
  const index = $('.deck__index')
  $('.deck__total').textContent = String(n).padStart(2, '0')
  const state = { active: 0, spread: reducedMotion ? 1 : 0 }

  const pose = (i: number) => {
    let o = (i - state.active + n) % n
    if (o > n / 2) o -= n // offsets run -2..3 around the front card
    const s = state.spread
    const a = Math.abs(o)
    // -50 centres the card on the deck's midpoint (left/top: 50% in CSS).
    return {
      xPercent: -50 + o * (58 * s + 4),
      yPercent: -50 + a * (6 - 4 * s),
      rotationY: -o * 16 * s,
      rotation: o * 3 * (1 - s),
      z: -a * (140 * s + 30),
      scale: 1 - a * 0.04,
      autoAlpha: a > 2.5 ? 0 : 1,
      zIndex: n - a,
    }
  }
  const layout = (animate: boolean) => {
    cards.forEach((c, i) => (animate ? gsap.to(c, { ...pose(i), duration: 0.8, ease: 'power3.out', overwrite: 'auto' }) : gsap.set(c, pose(i))))
    caption.textContent = cards[state.active].dataset.caption ?? ''
    index.textContent = String(state.active + 1).padStart(2, '0')
  }
  const go = (to: number) => {
    state.active = (to + n) % n
    layout(true)
  }

  for (const b of $$('.deck__arrows button')) b.addEventListener('click', () => go(state.active + Number(b.dataset.dir)))
  cards.forEach((c, i) => c.addEventListener('click', () => go(i)))
  $('.deck').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(state.active - 1)
    if (e.key === 'ArrowRight') go(state.active + 1)
  })
  layout(false)

  if (reducedMotion) return
  const mm = gsap.matchMedia()
  mm.add(desktop, () => {
    gsap.timeline({
      scrollTrigger: { trigger: '.feature', start: 'top top', end: '+=120%', scrub: 0.6, pin: '.feature__stage' },
    })
      .from('.feature__copy > *', { y: 40, autoAlpha: 0, stagger: 0.08, duration: 0.3 }, 0)
      .to(state, { spread: 1, duration: 0.7, ease: 'power1.inOut', onUpdate: () => layout(false) }, 0.15)
      .to({}, { duration: 0.15 })
  })
  mm.add('(max-width: 960px)', () => {
    gsap.to(state, {
      spread: 0.55,
      ease: 'power1.out',
      onUpdate: () => layout(false),
      scrollTrigger: { trigger: '.deck', start: 'top 85%', end: 'center 50%', scrub: 0.6 },
    })
  })
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
  const lenis = new Lenis({ lerp: 0.1 })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((t) => lenis.raf(t * 1000))
  gsap.ticker.lagSmoothing(0)
  for (const a of $$<HTMLAnchorElement>('a[href^="#"]')) {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href')!
      if (id.length < 2) return
      const target = id === '#top' ? 0 : document.querySelector<HTMLElement>(id)
      if (target === null) return
      e.preventDefault()
      lenis.scrollTo(target, { offset: id === '#top' ? 0 : -64, duration: 1.6 })
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
