// Landing page: the build from bare earth to the lobby doors, ending as the
// doors swing open onto the Just10 Group name.
import { $, chapter, countUp, createFilm, dismissPreloader, gsap, initScroll, reducedMotion, renderChrome, renderNext, rich, runPreloader, ScrollTrigger, sequenceFor, stillUrl } from '../core'
import { brand, chapters } from '../content'

type Span = (typeof chapters)[number] & { start: number; end: number; t0: number; len: number }

/** Scroll held on the finished logo before the page lets go, in vh. */
const FINALE = 130

const spans: Span[] = (() => {
  let t = 0
  return chapters.map((c) => {
    const f = chapter(c.id)
    const span = { ...c, start: f.start, end: f.end, t0: t, len: f.scroll }
    t += f.scroll
    return span
  })
})()
const span = (id: string) => spans.find((s) => s.id === id)!
const at = (id: string, frac: number) => span(id).t0 + span(id).len * frac
const FILM = spans.reduce((n, s) => n + s.len, 0)
const TOTAL = FILM + FINALE

function statsHtml(s: Span, counting: boolean): string {
  if (!s.stats) return ''
  return `<dl class="stats">${s.stats
    .map((st, i) => `<div><dt>${st.label}</dt><dd data-stat="${i}">${counting ? '0' : st.value.toLocaleString('en-US')}${counting ? '' : st.suffix ?? ''}</dd></div>`)
    .join('')}</dl>`
}

function buildCaptions(): void {
  $('.captions').innerHTML = spans
    .filter((s) => s.title)
    .map(
      (s) => `
        <article class="caption" data-id="${s.id}">
          <p class="eyebrow">${s.eyebrow}</p>
          <h2>${rich(s.title!)}</h2>
          ${s.body ? `<p class="body">${s.body}</p>` : ''}
          ${statsHtml(s, true)}
        </article>`,
    )
    .join('')
  $('.rail').innerHTML = spans
    .map((s, i) => `<li data-id="${s.id}"><span>${String(i + 1).padStart(2, '0')}</span>${s.rail}</li>`)
    .join('')
  $('.reveal__tagline').textContent = brand.tagline
}

function initCinematic(): void {
  // Local frame index: the sequence starts at the first landing chapter.
  const base = spans[0].start
  const seq = sequenceFor(spans[0].id, spans[spans.length - 1].id)
  seq.start()
  const state = createFilm(seq)
  initScroll()

  const tl = gsap.timeline({ defaults: { ease: 'none' } })
  for (const s of spans) tl.to(state, { frame: s.end - base, duration: s.len }, s.t0)

  for (const s of spans) {
    const el = document.querySelector<HTMLElement>(`.caption[data-id="${s.id}"]`)
    if (!el) continue
    if (s.id !== 'ground') {
      tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: s.len * 0.05 }, s.t0 + s.len * 0.08)
      tl.fromTo(
        el.querySelectorAll('.eyebrow, h2, .body, .stats'),
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, stagger: s.len * 0.03, duration: s.len * 0.14, ease: 'power2.out' },
        s.t0 + s.len * 0.08,
      )
    }
    s.stats?.forEach((st, i) => countUp(tl, $(`dd[data-stat="${i}"]`, el), st, s.t0 + s.len * 0.18, s.len * 0.3))
    tl.to(el, { autoAlpha: 0, y: -30, duration: s.len * 0.12, ease: 'power1.in' }, s.t0 + s.len * 0.82)
  }

  // The doors swing open and the name appears in the widening gap.
  const doors = span('doors').len
  const logo = $('.reveal__logo')
  const layer = (n: string) => $(`.layer--${n}`)
  tl.fromTo('.bloom', { opacity: 0 }, { opacity: 0.55, duration: doors * 0.35, ease: 'sine.inOut' }, at('doors', 0.5))
  tl.fromTo('.reveal', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, at('doors', 0.58))
  tl.fromTo(logo, { clipPath: 'inset(-60% 50% -60% 50%)' }, { clipPath: 'inset(-60% -30% -60% -30%)', duration: doors * 0.34, ease: 'power2.inOut' }, at('doors', 0.58))
  tl.fromTo(layer('mark'), { opacity: 0, scale: 1.18, filter: 'blur(14px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: doors * 0.22, ease: 'power3.out' }, at('doors', 0.6))
  tl.fromTo(layer('divider'), { scaleY: 0 }, { scaleY: 1, duration: doors * 0.12, ease: 'power2.out' }, at('doors', 0.72))
  tl.fromTo(layer('just10'), { opacity: 0, x: -40, filter: 'blur(10px)' }, { opacity: 1, x: 0, filter: 'blur(0px)', duration: doors * 0.18, ease: 'power3.out' }, at('doors', 0.74))
  tl.fromTo(layer('group'), { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: doors * 0.14, ease: 'power3.out' }, at('doors', 0.82))
  tl.fromTo('.reveal__tagline', { opacity: 0, letterSpacing: '0.6em' }, { opacity: 1, letterSpacing: '0.32em', duration: FINALE * 0.15, ease: 'power2.out' }, at('doors', 0.95))

  // Finale: the name holds in the doorway and the way on appears beneath it.
  tl.to('.bloom', { opacity: 0.3, duration: FINALE * 0.3 }, FILM)
  tl.fromTo('.reveal__actions', { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: FINALE * 0.15, ease: 'power2.out' }, FILM + FINALE * 0.15)
  tl.fromTo('.nav__logo', { autoAlpha: 0 }, { autoAlpha: 1, duration: FINALE * 0.1 }, FILM + FINALE * 0.85)
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
      const i = t >= FILM ? spans.length - 1 : Math.max(0, spans.findIndex((s) => t < s.t0 + s.len))
      rail.forEach((li, j) => li.classList.toggle('is-active', j === i))
      bar.style.transform = `scaleY(${st.progress})`
    },
  })

  // Handle for screenshot scripts and debugging.
  Object.assign(window, { __story: { at: (id: string, f: number) => (id === 'finale' ? FILM + FINALE * f : at(id, f)) } })

  runPreloader(seq).then(() => {
    dismissPreloader()
    gsap.from('.caption[data-id="ground"] > *', { y: 40, opacity: 0, stagger: 0.12, duration: 1.2, delay: 0.5, ease: 'power3.out' })
    ScrollTrigger.refresh()
  })
}

/** Reduced motion: one still per chapter, then the name over the open doors. */
function initStatic(): void {
  document.documentElement.classList.add('is-static')
  $('.story').innerHTML = spans
    .map((s) => {
      if (s.id === 'doors') {
        return `<figure class="still still--reveal"><img src="${stillUrl('doors', 1)}" alt="" />
          <div class="still__logo"><img src="/brand/logo-full.png" alt="${brand.name}" /><p>${brand.tagline}</p>
          <p class="reveal__actions"><a class="button" href="./resort.html">Discover the resort →</a></p></div></figure>`
      }
      return `<figure class="still"><img src="${stillUrl(s.id)}" alt="" loading="lazy" />
        <div class="caption"><p class="eyebrow">${s.eyebrow}</p><h2>${rich(s.title!)}</h2><p class="body">${s.body}</p>${statsHtml(s, false)}</div></figure>`
    })
    .join('')
  $('.preloader').remove()
}

renderChrome('home')
renderNext('home')
if (reducedMotion) initStatic()
else {
  buildCaptions()
  initCinematic()
}
