// Contact: the enquiry form, over the open doors from the landing film.
import { $, gsap, initScroll, reducedMotion, renderChrome, revealOnScroll, stillUrl } from '../core'
import { contact } from '../content'

$('.page-hero__bg').setAttribute('src', stillUrl('doors', 1))
$('.contact__details').innerHTML = `
  <li><span>Email</span><a href="mailto:${contact.email}">${contact.email}</a></li>
  <li><span>Phone</span><a href="tel:${contact.phone.replace(/\s/g, '')}">${contact.phone}</a></li>
  <li><span>Office</span>${contact.address}</li>`

// No backend yet: hand the enquiry to the visitor's mail client.
$<HTMLFormElement>('.contact__form').addEventListener('submit', (e) => {
  e.preventDefault()
  const data = new FormData(e.target as HTMLFormElement)
  const subject = `Project enquiry — ${data.get('type')} — ${data.get('name')}`
  const body = `${data.get('message')}\n\n${data.get('name')}\n${data.get('email')}`
  location.href = `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
})

renderChrome('contact')
initScroll()
document.documentElement.classList.add('is-ready')
if (!reducedMotion) {
  gsap.from('.page-hero__inner > *', { y: 60, opacity: 0, filter: 'blur(10px)', stagger: 0.14, duration: 1.4, ease: 'power3.out', delay: 0.2 })
}
revealOnScroll('.contact > *')
