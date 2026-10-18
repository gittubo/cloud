// Shared by every page: fonts and styles, navigation and footer, smooth
// scrolling, the scroll-scrubbed film, the preloader and small helpers.
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource-variable/archivo'
import './styles.css'

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

import { brand, contact, pages, type PageId, type Stat } from './content'
import manifest from './frames.generated.json'
import { FrameSequence, renderFrame, type Tier } from './sequence'

gsap.registerPlugin(ScrollTrigger)
export { gsap, ScrollTrigger }

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** "*accent*" -> <em>accent</em>; everything else escaped. */
export function rich(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return esc.replace(/\*(.+?)\*/g, '<em>$1</em>')
}

export function formatStat(s: Stat, v: number): string {
  const n = v.toLocaleString('en-US', {
    minimumFractionDigits: s.decimals ?? 0,
    maximumFractionDigits: s.decimals ?? 0,
  })
  return `${s.prefix ?? ''}${n}${s.suffix ?? ''}`
}

// ---------- Frames ----------

export type ChapterFrames = { id: string; start: number; end: number; scroll: number }

export function chapter(id: string): ChapterFrames {
  const c = manifest.chapters.find((c) => c.id === id)
  if (!c) throw new Error(`No frames for chapter "${id}"`)
  return c
}

export function pickTier(): Tier {
  const forced = new URLSearchParams(location.search).get('tier')
  if (forced === 'hd' || forced === 'sd') return forced
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (conn?.saveData || /2g|3g/.test(conn?.effectiveType ?? '')) return 'sd'
  return 'hd'
}

/** URL of one frame of the full film, for stills and backgrounds. */
export function stillUrl(id: string, frac = 0.5, tier: Tier = 'hd'): string {
  const c = chapter(id)
  const n = Math.round(c.start + (c.end - c.start) * frac)
  return `${import.meta.env.BASE_URL}frames/${tier}/f${String(n).padStart(5, '0')}.webp`
}

/** A sequence covering the given chapters, which must be consecutive. */
export function sequenceFor(...ids: string[]): FrameSequence {
  return new FrameSequence(chapter(ids[0]).start, chapter(ids[ids.length - 1]).end, pickTier())
}

/**
 * Draws seq into the .film canvas (and the blurred .ambient canvas if present)
 * whenever state.frame changes. Returns the state to tween.
 */
export function createFilm(seq: FrameSequence, onResize?: () => void): { frame: number } {
  const film = $<HTMLCanvasElement>('.film')
  const ctx = film.getContext('2d', { alpha: false })!
  const ambient = document.querySelector<HTMLCanvasElement>('.ambient')
  const actx = ambient?.getContext('2d', { alpha: false })
  const state = { frame: 0 }
  let drawn = -1
  let dirty = true

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const r = film.getBoundingClientRect()
    film.width = Math.round(r.width * dpr)
    film.height = Math.round(r.height * dpr)
    dirty = true
    onResize?.()
  }
  resize()
  window.addEventListener('resize', resize)

  seq.onLoad = () => void (dirty = true)
  gsap.ticker.add(() => {
    if (!dirty && Math.abs(drawn - state.frame) < 0.001) return
    renderFrame(ctx, seq, state.frame)
    if (actx) renderFrame(actx, seq, Math.round(state.frame))
    seq.setPlayhead(state.frame)
    drawn = state.frame
    dirty = false
  })
  return state
}

/**
 * Where a source frame (720×1280) lands inside the .panel element, given the
 * canvas cover-fit — so overlays can be pinned to things in the footage.
 */
export function frameRect(panel: HTMLElement, aspect = manifest.aspect): { x: number; y: number; w: number; h: number } {
  const r = panel.getBoundingClientRect()
  const scale = Math.max(r.width / aspect, r.height)
  const w = scale * aspect
  const h = scale
  return { x: (r.width - w) / 2, y: (r.height - h) / 2, w, h }
}

export function runPreloader(seq: FrameSequence): Promise<void> {
  const pre = document.querySelector<HTMLElement>('.preloader')
  if (!pre) return Promise.resolve()
  const pct = $('.preloader__pct', pre)
  const bar = $('.preloader__bar span', pre)
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

export function dismissPreloader(): void {
  document.documentElement.classList.add('is-ready')
  const pre = document.querySelector('.preloader')
  if (!pre) return
  gsap.to(pre, { clipPath: 'inset(0 0 100% 0)', duration: 1.1, ease: 'power3.inOut', onComplete: () => pre.remove() })
}

// ---------- Scrolling ----------

export function initScroll(): Lenis | null {
  if (reducedMotion) return null
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
  return lenis
}

/**
 * Pins .stage for `total` vh of scrolling and scrubs tl across it, updating
 * the bottom timeline (.hud) as it goes.
 */
export function pinStory(tl: gsap.core.Timeline, total: number): void {
  tl.set({}, {}, total)
  const fill = document.querySelector<HTMLElement>('.hud__track i')
  const pct = document.querySelector<HTMLElement>('.hud__pct')
  ScrollTrigger.create({
    trigger: '.story',
    start: 'top top',
    end: () => `+=${(total / 100) * window.innerHeight}`,
    pin: '.stage',
    scrub: true,
    animation: tl,
    invalidateOnRefresh: true,
    onUpdate: (st) => {
      if (fill) fill.style.transform = `scaleX(${st.progress})`
      if (pct) pct.textContent = String(Math.round(st.progress * 100)).padStart(3, '0')
    },
  })
}

/** Fade-and-rise for blocks as they enter the viewport. */
export function revealOnScroll(selector: string): void {
  if (reducedMotion) return
  gsap.utils.toArray<HTMLElement>(selector).forEach((el) =>
    gsap.from(el, { y: 50, opacity: 0, duration: 1.1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%' } }),
  )
}

/**
 * Counts a number up as part of a scrubbed timeline. With scramble, the
 * digits flicker before they settle, like an instrument readout.
 */
export function countUp(tl: gsap.core.Timeline, el: HTMLElement, stat: Stat, position: number, duration: number, scramble = false): void {
  const o = { v: 0 }
  const final = formatStat(stat, stat.value)
  tl.to(o, {
    v: 1,
    duration,
    ease: 'power2.out',
    onUpdate: () => {
      if (o.v >= 1) return void (el.textContent = final)
      if (!scramble) return void (el.textContent = formatStat(stat, stat.value * o.v))
      el.textContent = final.replace(/\d/g, (d, i) => (Math.random() > o.v + i * 0.05 ? String(Math.floor(Math.random() * 10)) : d))
    },
  }, position)
}

// ---------- Navigation, footer, next-page card ----------

const num = (i: number) => String(i + 1).padStart(2, '0')

export function renderChrome(page: PageId): void {
  const nav = $('.nav')
  nav.innerHTML = `
    <a class="nav__logo" href="./" aria-label="${brand.name} — home">
      <img src="/brand/logo-full.png" alt="${brand.name}" width="1155" height="409" />
    </a>
    <nav class="nav__links" aria-label="Main">
      ${pages
        .map((p, i) => `<a href="${p.href}"${p.id === page ? ' aria-current="page"' : ''}><span>${num(i)}</span>${p.label}</a>`)
        .join('')}
    </nav>
    <div class="nav__actions">
      <a class="nav__cta" href="./contact.html">Start a project</a>
      <button class="nav__menu" type="button" aria-expanded="false" aria-controls="menu">Menu</button>
    </div>
    <div class="menu" id="menu" hidden>
      <ol>
        ${pages.map((p, i) => `<li><a href="${p.href}"${p.id === page ? ' aria-current="page"' : ''}><span>${num(i)}</span>${rich(p.title)}</a></li>`).join('')}
      </ol>
    </div>`
  const button = $<HTMLButtonElement>('.nav__menu', nav)
  const menu = $('.menu', nav)
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true'
    button.setAttribute('aria-expanded', String(open))
    button.textContent = open ? 'Close' : 'Menu'
    menu.hidden = !open
    nav.classList.toggle('nav--open', open)
  })

  const footer = document.querySelector('.footer')
  if (footer) {
    footer.innerHTML = `
      <img src="/brand/logo-full-light.png" alt="${brand.name}" width="1155" height="409" />
      <p class="footer__tag">${brand.tagline}</p>
      <nav class="footer__links" aria-label="Footer">${pages.map((p) => `<a href="${p.href}">${p.label}</a>`).join('')}</nav>
      <p class="footer__contact"><a href="mailto:${contact.email}">${contact.email}</a> · ${contact.phone}</p>
      <p class="footer__legal">© ${new Date().getFullYear()} ${brand.name}. All rights reserved.</p>`
  }
}

const nextStill: Record<PageId, () => string> = {
  home: () => stillUrl('ground', 0),
  resort: () => stillUrl('terrace', 0.05),
  suites: () => stillUrl('tower', 0.45),
  services: () => stillUrl('frame', 0.5),
  contact: () => stillUrl('doors', 1),
}

/** Full-screen invitation to the following page, at the bottom of each page. */
export function renderNext(page: PageId): void {
  const el = document.querySelector('.next')
  if (!el) return
  const n = (pages.findIndex((p) => p.id === page) + 1) % pages.length
  const next = pages[n]
  el.innerHTML = `
    <a class="next__link" href="${next.href}">
      <img class="next__bg" src="${nextStill[next.id]()}" alt="" loading="lazy" />
      <span class="next__eyebrow">Next — ${num(n)}</span>
      <span class="next__title">${rich(next.title)}</span>
      <span class="next__go">Continue <i aria-hidden="true">→</i></span>
    </a>`
}
