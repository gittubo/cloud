// Contact details and socials, in one place.
// PLACEHOLDERS: everything below except the city must be replaced with the
// salon's real details before launch. Elements carrying data-contact="<key>"
// in index.html are filled from here at load.

export const contact = {
  phone: '+234 800 000 0000',
  phoneHref: 'tel:+2348000000000',
  whatsappNumber: '2348000000000', // digits only, country code first
  email: 'hello@tubosalon.com',
  street: '00 Placeholder Street',
  city: 'Lagos, Nigeria',
  mapQuery: 'Lagos, Nigeria',
  hours: [
    ['Mon – Fri', '9:00 – 20:00'],
    ['Saturday', '9:00 – 19:00'],
    ['Sunday', '12:00 – 18:00'],
  ],
}

export const socials = [
  { label: 'Instagram', handle: '@tubosalon', href: 'https://instagram.com/' },
  { label: 'TikTok', handle: '@tubosalon', href: 'https://tiktok.com/' },
  { label: 'Facebook', handle: 'Tubo Nails & Beauty', href: 'https://facebook.com/' },
  { label: 'X', handle: '@tubosalon', href: 'https://x.com/' },
]

export const whatsappLink = (text = 'Hello Tubo, I would like to book an appointment.') =>
  `https://wa.me/${contact.whatsappNumber}?text=${encodeURIComponent(text)}`
