// The Resort: out through the doors onto the terrace, across the pool to the
// tower, then up into the aerial — with the project's numbers.
import { $, countUp, createFilm, dismissPreloader, formatStat, gsap, initScroll, pinStory, reducedMotion, renderChrome, renderNext, rich, runPreloader, ScrollTrigger, sequenceFor, stillUrl } from '../core'
import { resort } from '../content'

const TOTAL = 460

function build(counting: boolean): void {
  const r = resort
  $('.overlays').innerHTML = `
    <article class="ov ov--hero" data-ov="hero">
      <p class="eyebrow">${r.eyebrow}</p>
      <h1 class="title-caps">${rich(r.hero.title)}</h1>
      <p class="body">${r.hero.body}</p>
    </article>
    <article class="ov" data-ov="project">
      <h2 class="title-caps">${rich(r.project.title)}</h2>
      <p class="body">${r.project.body}</p>
      <dl class="specs">${r.project.specs.map((s) => `<div><dt>${s.label}</dt><dd>${s.value}</dd></div>`).join('')}</dl>
      <a class="link-arrow" href="./suites.html">Explore the suites <i aria-hidden="true">→</i></a>
    </article>
    <article class="ov ov--statement" data-ov="statement">
      <h2 class="title-caps title-caps--xl">${rich(r.statement)}</h2>
    </article>
    <article class="ov ov--numbers" data-ov="numbers">
      <p class="eyebrow">From first survey to final handover</p>
      <ol class="bignums">${r.numbers
        .map((n, i) => `<li><span class="bignums__n" data-n="${i}">${counting ? '0' : formatStat(n, n.value)}</span><span class="bignums__l"><b>${n.label}</b>${n.note ?? ''}</span></li>`)
        .join('')}</ol>
    </article>`
}

function initCinematic(): void {
  const seq = sequenceFor('terrace')
  seq.start()
  const state = createFilm(seq)
  initScroll()

  const tl = gsap.timeline({ defaults: { ease: 'none' } })
  tl.to(state, { frame: seq.count - 1, duration: TOTAL }, 0)

  const T = (f: number) => TOTAL * f
  const ov = (id: string) => $(`[data-ov="${id}"]`)
  const show = (id: string, from: number, to?: number) => {
    const el = ov(id)
    tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: T(0.01) }, T(from))
    tl.fromTo(el.children, { y: 50, opacity: 0, filter: 'blur(8px)' }, { y: 0, opacity: 1, filter: 'blur(0px)', stagger: T(0.012), duration: T(0.06), ease: 'power3.out' }, T(from))
    if (to !== undefined) tl.to(el, { autoAlpha: 0, y: -40, duration: T(0.04), ease: 'power1.in' }, T(to))
  }

  tl.to(ov('hero'), { autoAlpha: 0, y: -40, duration: T(0.04), ease: 'power1.in' }, T(0.16))
  show('project', 0.22, 0.44)
  tl.fromTo(ov('project').querySelectorAll('.specs > div'), { opacity: 0, y: 16 }, { opacity: 1, y: 0, stagger: T(0.01), duration: T(0.04) }, T(0.27))
  show('statement', 0.5, 0.68)
  show('numbers', 0.72)
  resort.numbers.forEach((n, i) => countUp(tl, $(`[data-n="${i}"]`), n, T(0.75 + i * 0.03), T(0.1), true))
  pinStory(tl, TOTAL)

  runPreloader(seq).then(() => {
    dismissPreloader()
    gsap.from('[data-ov="hero"] > *', { y: 50, opacity: 0, filter: 'blur(8px)', stagger: 0.12, duration: 1.3, delay: 0.4, ease: 'power3.out' })
    ScrollTrigger.refresh()
  })
  Object.assign(window, { __story: { at: (_: string, f: number) => T(f) } })
}

function initStatic(): void {
  document.documentElement.classList.add('is-static')
  $('.story').innerHTML = `<figure class="still"><img src="${stillUrl('terrace', 0.05)}" alt="" /><div class="overlays">${$('.overlays').innerHTML}</div></figure>`
  $('.preloader').remove()
}

renderChrome('resort')
renderNext('resort')
if (reducedMotion) {
  build(false)
  initStatic()
} else {
  build(true)
  initCinematic()
}
