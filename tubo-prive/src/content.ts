// Contact details and socials, in one place.
// PLACEHOLDERS: everything below except the city must be replaced with the
// clinic's real details before launch. Elements carrying data-contact="<key>"
// in index.html are filled from here at load.

export const contact = {
  phone: '+234 800 000 0000',
  phoneHref: 'tel:+2348000000000',
  whatsappNumber: '2348000000000', // digits only, country code first
  email: 'hello@tuboprive.com',
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
  { label: 'Instagram', handle: '@tuboprive', href: 'https://instagram.com/' },
  { label: 'TikTok', handle: '@tuboprive', href: 'https://tiktok.com/' },
  { label: 'Facebook', handle: 'Tubo Privé', href: 'https://facebook.com/' },
  { label: 'X', handle: '@tuboprive', href: 'https://x.com/' },
]

export const whatsappLink = (text = 'Hello Tubo Privé, I would like to book a treatment.') =>
  `https://wa.me/${contact.whatsappNumber}?text=${encodeURIComponent(text)}`
