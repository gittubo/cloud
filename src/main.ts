import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource-variable/archivo'
import './styles.css'

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

import { brand, chapters, contact, process, services, type Chapter, type Stat } from './content'
import manifest from './frames.generated.json'
import { FrameSequence, renderFrame, type Tier } from './sequence'

gsap.registerPlugin(ScrollTrigger)

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T

/** "*accent*" -> <em>accent</em>; everything else escaped. */
function rich(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return esc.replace(/\*(.+?)\*/g, '<em>$1</em>')
}

function formatStat(s: Stat, v: number): string {
  const n = v.toLocaleString('en-US', {
    minimumFractionDigits: s.decimals ?? 0,
    maximumFractionDigits: s.decimals ?? 0,
  })
  return `${s.prefix ?? ''}${n}${s.suffix ?? ''}`
}

type Span = { id: string; start: number; end: number; t0: number; len: number; copy: Chapter }

// Chapter frame ranges from the asset pipeline, joined with their copy and
// laid out on one timeline measured in viewport-heights of scrolling.
const spans: Span[] = (() => {
  let t = 0
  return manifest.chapters.map((m) => {
    const copy = chapters.find((c) => c.id === m.id) ?? { id: m.id, rail: m.id }
    const span = { id: m.id, start: m.start, end: m.end, t0: t, len: m.scroll, copy }
    t += m.scroll
    return span
  })
})()
const span = (id: string) => spans.find((s) => s.id === id)!
const at = (id: string, frac: number) => span(id).t0 + span(id).len * frac
const TOTAL = spans.reduce((n, s) => n + s.len, 0)

function pickTier(): Tier {
  const forced = new URLSearchParams(location.search).get('tier')
  if (forced === 'hd' || forced === 'sd') return forced
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (conn?.saveData || /2g|3g/.test(conn?.effectiveType ?? '')) return 'sd'
  return 'hd'
}

function buildCopySections(): void {
  const list = (items: { title: string; body: string }[]) =>
    items
      .map((s, i) => `<li><span class="num">${String(i + 1).padStart(2, '0')}</span><h3>${s.title}</h3><p>${s.body}</p></li>`)
      .join('')
  $('.services__grid').innerHTML = list(services)
  $('.process__steps').innerHTML = list(process)
  $('.contact__details').innerHTML = `
    <li><a href="mailto:${contact.email}">${contact.email}</a></li>
    <li><a href="tel:${contact.phone.replace(/\s/g, '')}">${contact.phone}</a></li>
    <li>${contact.address}</li>`
  $('.footer__tag').textContent = brand.tagline
  $('.year').textContent = String(new Date().getFullYear())
  $('.reveal__tagline').textContent = brand.tagline

  // No backend yet: hand the enquiry to the visitor's mail client.
  $<HTMLFormElement>('.contact__form').addEventListener('submit', (e) => {
    e.preventDefault()
    const data = new FormData(e.target as HTMLFormElement)
    const subject = `Project enquiry — ${data.get('type')} — ${data.get('name')}`
    const body = `${data.get('message')}\n\n${data.get('name')}\n${data.get('email')}`
    location.href = `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  })
}

function statsHtml(stats: Stat[], counting: boolean): string {
  return `<dl class="stats">${stats
    .map((s, i) => `<div><dt>${s.label}</dt><dd data-stat="${i}">${formatStat(s, counting ? 0 : s.value)}</dd></div>`)
    .join('')}</dl>`
}

function buildCaptions(): void {
  $('.captions').innerHTML = spans
    .map(({ id, copy }) => {
      if (id === 'terrace') {
        return `
          <article class="caption caption--statement" data-id="statement"><h2>${rich(brand.statement)}</h2></article>
          <article class="caption caption--stats" data-id="terrace">
            <p class="eyebrow">${copy.eyebrow}</p>
            ${statsHtml(copy.stats ?? [], true)}
          </article>`
      }
      if (!copy.title) return ''
      return `
        <article class="caption" data-id="${id}">
          <p class="eyebrow">${copy.eyebrow}</p>
          <h2>${rich(copy.title)}</h2>
          ${copy.body ? `<p class="body">${copy.body}</p>` : ''}
          ${copy.stats ? statsHtml(copy.stats, true) : ''}
        </article>`
    })
    .join('')
  $('.rail').innerHTML = spans
    .map((s, i) => `<li data-id="${s.id}"><span>${String(i + 1).padStart(2, '0')}</span>${s.copy.rail}</li>`)
    .join('')
}

/** Counts each stat in a caption up from zero, as part of the scrubbed timeline. */
function countUp(tl: gsap.core.Timeline, root: Element, stats: Stat[], position: number, duration: number): void {
  root.querySelectorAll<HTMLElement>('dd[data-stat]').forEach((dd) => {
    const stat = stats[Number(dd.dataset.stat)]
    const o = { v: 0 }
    tl.to(o, { v: stat.value, duration, ease: 'power2.out', onUpdate: () => void (dd.textContent = formatStat(stat, o.v)) }, position)
  })
}

function initCinematic(seq: FrameSequence): void {
  const film = $<HTMLCanvasElement>('.film')
  const ctx = film.getContext('2d', { alpha: false })!
  const actx = $<HTMLCanvasElement>('.ambient').getContext('2d', { alpha: false })!
  const state = { frame: 0 }
  let drawn = -1
  let dirty = true

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const r = film.getBoundingClientRect()
    film.width = Math.round(r.width * dpr)
    film.height = Math.round(r.height * dpr)
    dirty = true
  }
  resize()
  window.addEventListener('resize', resize)

  seq.onLoad = () => void (dirty = true)
  gsap.ticker.add(() => {
    if (!dirty && Math.abs(drawn - state.frame) < 0.001) return
    renderFrame(ctx, seq, state.frame)
    renderFrame(actx, seq, Math.round(state.frame))
    seq.setPlayhead(state.frame)
    drawn = state.frame
    dirty = false
  })

  const lenis = new Lenis({ lerp: 0.09 })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((t) => lenis.raf(t * 1000))
  gsap.ticker.lagSmoothing(0)
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) =>
    a.addEventListener('click', (e) => {
      const target = a.getAttribute('href')!
      e.preventDefault()
      lenis.scrollTo(target === '#top' ? 0 : target, { duration: 1.6 })
    }),
  )

  const tl = gsap.timeline({ defaults: { ease: 'none' } })

  // The film itself: one linear tween per chapter.
  for (const s of spans) tl.to(state, { frame: s.end, duration: s.len }, s.t0)

  // Chapter captions rise in and fade out inside their chapter.
  for (const s of spans) {
    const el = document.querySelector<HTMLElement>(`.caption[data-id="${s.id}"]`)
    if (!el || s.id === 'terrace') continue
    if (s.id !== 'ground') {
      tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: s.len * 0.05 }, s.t0 + s.len * 0.08)
      tl.fromTo(
        el.querySelectorAll('.eyebrow, h2, .body, .stats'),
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, stagger: s.len * 0.03, duration: s.len * 0.14, ease: 'power2.out' },
        s.t0 + s.len * 0.08,
      )
    }
    if (s.copy.stats) countUp(tl, el, s.copy.stats, s.t0 + s.len * 0.18, s.len * 0.3)
    tl.to(el, { autoAlpha: 0, y: -30, duration: s.len * 0.12, ease: 'power1.in' }, s.t0 + s.len * 0.82)
  }

  // Doors: the name appears in the widening gap as the glass swings open.
  const doors = span('doors').len
  const terrace = span('terrace').len
  const logo = $('.reveal__logo')
  const layer = (n: string) => $(`.layer--${n}`)
  tl.fromTo('.bloom', { opacity: 0 }, { opacity: 0.55, duration: doors * 0.35, ease: 'sine.inOut' }, at('doors', 0.5))
  tl.fromTo('.reveal', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, at('doors', 0.58))
  tl.fromTo(logo, { clipPath: 'inset(-60% 50% -60% 50%)' }, { clipPath: 'inset(-60% -30% -60% -30%)', duration: doors * 0.34, ease: 'power2.inOut' }, at('doors', 0.58))
  tl.fromTo(layer('mark'), { opacity: 0, scale: 1.18, filter: 'blur(14px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: doors * 0.22, ease: 'power3.out' }, at('doors', 0.6))
  tl.fromTo(layer('divider'), { scaleY: 0 }, { scaleY: 1, duration: doors * 0.12, ease: 'power2.out' }, at('doors', 0.72))
  tl.fromTo(layer('just10'), { opacity: 0, x: -40, filter: 'blur(10px)' }, { opacity: 1, x: 0, filter: 'blur(0px)', duration: doors * 0.18, ease: 'power3.out' }, at('doors', 0.74))
  tl.fromTo(layer('group'), { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: doors * 0.14, ease: 'power3.out' }, at('doors', 0.82))
  tl.fromTo('.reveal__tagline', { opacity: 0, letterSpacing: '0.6em' }, { opacity: 1, letterSpacing: '0.32em', duration: terrace * 0.1, ease: 'power2.out' }, at('doors', 0.95))

  // Terrace: hold while the camera steps outside, then hand the logo to the nav.
  const anchor = $('.reveal__anchor')
  const navLogo = $('.nav__logo')
  const navImg = $('.nav__logo img')
  const delta = () => {
    const a = anchor.getBoundingClientRect()
    const n = navImg.getBoundingClientRect()
    return { x: n.left + n.width / 2 - (a.left + a.width / 2), y: n.top + n.height / 2 - (a.top + a.height / 2), s: n.width / a.width }
  }
  tl.to('.reveal__tagline', { opacity: 0, y: -10, duration: terrace * 0.06 }, at('terrace', 0.28))
  tl.to('.bloom', { opacity: 0, duration: terrace * 0.2 }, at('terrace', 0.2))
  tl.to('.reveal__glow', { opacity: 0, duration: terrace * 0.08 }, at('terrace', 0.24))
  tl.to(logo, { x: () => delta().x, y: () => delta().y, scale: () => delta().s, duration: terrace * 0.2, ease: 'power2.inOut' }, at('terrace', 0.3))
  tl.fromTo(navLogo, { autoAlpha: 0 }, { autoAlpha: 1, duration: terrace * 0.04 }, at('terrace', 0.47))
  tl.to('.reveal', { autoAlpha: 0, duration: terrace * 0.03 }, at('terrace', 0.5))

  const statement = $('.caption--statement')
  tl.fromTo(statement, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: terrace * 0.08, ease: 'power2.out' }, at('terrace', 0.5))
  tl.to(statement, { autoAlpha: 0, y: -30, duration: terrace * 0.06, ease: 'power1.in' }, at('terrace', 0.66))
  const stats = $('.caption--stats')
  tl.fromTo(stats, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: terrace * 0.06, ease: 'power2.out' }, at('terrace', 0.74))
  countUp(tl, stats, span('terrace').copy.stats ?? [], at('terrace', 0.76), terrace * 0.14)
  tl.to(stats, { autoAlpha: 0, y: -30, duration: terrace * 0.05 }, at('terrace', 0.95))

  tl.to('.cue', { autoAlpha: 0, duration: 8 }, 2)
  tl.set({}, {}, TOTAL)

  const rail = [...document.querySelectorAll<HTMLElement>('.rail li')]
  const bar = $('.progress span')
  ScrollTrigger.create({
    trigger: '.story',
    start: 'top top',
    end: () => `+=${(TOTAL / 100) * window.innerHeight}`,
    pin: '.stage',
    scrub: true,
    animation: tl,
    invalidateOnRefresh: true,
    onUpdate: (st) => {
      const t = st.progress * TOTAL
      const i = Math.max(0, spans.findIndex((s) => t < s.t0 + s.len))
      rail.forEach((li, j) => li.classList.toggle('is-active', j === i))
      bar.style.transform = `scaleY(${st.progress})`
    },
  })

  // Post-story sections drift in.
  gsap.utils.toArray<HTMLElement>('.section-head, .services__grid li, .process__steps li, .contact > *').forEach((el) =>
    gsap.from(el, { y: 50, opacity: 0, duration: 1.1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%' } }),
  )

  // Handle for screenshot scripts and debugging.
  Object.assign(window, { __story: { tl, state, lenis, TOTAL, at } })
}

/** Reduced motion: no pinning or scrubbing — a still per chapter, captions in flow. */
function initStatic(seq: FrameSequence): void {
  document.documentElement.classList.add('is-static')
  const still = (frame: number, inner: string, extra = '') =>
    `<figure class="still ${extra}"><img src="${seq.url(frame)}" alt="" loading="lazy" />${inner}</figure>`
  $('.story').innerHTML = spans
    .map((s) => {
      if (s.id === 'doors') {
        return still(s.end, `<div class="still__logo"><img src="/brand/logo-full.png" alt="Just10 Group" /><p>${brand.tagline}</p></div>`, 'still--reveal')
      }
      if (s.id === 'terrace') {
        return still(s.end, `<div class="caption"><h2>${rich(brand.statement)}</h2><p class="eyebrow">${s.copy.eyebrow}</p>${statsHtml(s.copy.stats ?? [], false)}</div>`)
      }
      if (!s.copy.title) return ''
      const mid = Math.round((s.start + s.end) / 2)
      return still(mid, `<div class="caption"><p class="eyebrow">${s.copy.eyebrow}</p><h2>${rich(s.copy.title)}</h2><p class="body">${s.copy.body}</p>${s.copy.stats ? statsHtml(s.copy.stats, false) : ''}</div>`)
    })
    .join('')
}

function runPreloader(seq: FrameSequence): Promise<void> {
  const pct = $('.preloader__pct')
  const bar = $('.preloader__bar span')
  const started = performance.now()
  return new Promise((resolve) => {
    const tick = () => {
      const p = Math.min(1, seq.loaded / seq.bootstrapSize)
      pct.textContent = `${Math.round(p * 100)}%`
      bar.style.transform = `scaleX(${p})`
      if (p >= 1 || performance.now() - started > 9000) return resolve()
      requestAnimationFrame(tick)
    }
    tick()
  })
}

async function main(): Promise<void> {
  buildCopySections()
  const seq = new FrameSequence(manifest.count, pickTier())

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    initStatic(seq)
    $('.preloader').remove()
    return
  }

  buildCaptions()
  seq.start()
  initCinematic(seq)
  await runPreloader(seq)
  document.documentElement.classList.add('is-ready')
  gsap.to('.preloader', {
    clipPath: 'inset(0 0 100% 0)',
    duration: 1.1,
    ease: 'power3.inOut',
    onComplete: () => $('.preloader').remove(),
  })
  gsap.from('.caption[data-id="ground"] > *', { y: 40, opacity: 0, stagger: 0.12, duration: 1.2, delay: 0.5, ease: 'power3.out' })
  ScrollTrigger.refresh()
}

main()
