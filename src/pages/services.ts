// Services: what Just10 Group builds and how — a long editorial scroll.
import { $, gsap, initScroll, reducedMotion, renderChrome, renderNext, revealOnScroll, rich, stillUrl } from '../core'
import { process, services } from '../content'

$('.page-hero__bg').setAttribute('src', stillUrl('frame', 0.55))
$('.service-list').innerHTML = services
  .map(
    (s, i) => `
    <li class="service">
      <span class="service__n">${String(i + 1).padStart(2, '0')}</span>
      <h3 class="title-caps">${rich(s.title)}</h3>
      <p>${s.body}</p>
      <img class="service__still" src="${stillUrl(s.still, 0.6, 'sd')}" alt="" loading="lazy" />
    </li>`,
  )
  .join('')
$('.steps').innerHTML = process
  .map((s, i) => `<li><span class="service__n">${String(i + 1).padStart(2, '0')}</span><h3>${s.title}</h3><p>${s.body}</p></li>`)
  .join('')

renderChrome('services')
renderNext('services')
initScroll()
document.documentElement.classList.add('is-ready')
if (!reducedMotion) {
  gsap.from('.page-hero__inner > *', { y: 60, opacity: 0, filter: 'blur(10px)', stagger: 0.14, duration: 1.4, ease: 'power3.out', delay: 0.2 })
  gsap.fromTo('.page-hero__bg', { scale: 1.15 }, { scale: 1, duration: 2.4, ease: 'power2.out' })
}
revealOnScroll('.service, .steps li, .section-head')
