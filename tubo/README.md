# Tubo — nails & beauty salon site

A separate, self-contained site (not part of the Just10 Group site at the repo root), built on the same
scroll-story design as the Tubo Privé site, recoloured in porcelain, blush, fuchsia and lacquer black.

| # | Section | What happens |
|---|---|---|
| 01 | Hero | Scroll walks from the street through the glass doors to reception. The **Tubo** lettering on the wall then comes off it: a live 3D copy takes the sign's exact place (the wall behind is painted out), tips off its mounts leaving a shadow on the wall, swings toward you to show its depth while focus racks off the lobby, and lands as glossy pink lacquer over "Nails & Beauty Salon" and "Relax · Refresh · Rejuvenate". A polish gleam then crosses it every few seconds and, on desktop, it tilts toward the pointer |
| 02 | Intro | Huge plum-to-pink name; groups of nail photos keep flying in over it and swapping on a loop |
| 03 | Social | Dark moment: an Instagram-style post (a nail reel made from the photos) pops up over the sliding "Nail salon in Lagos" text, then opens out full screen |
| 04 | Lookbook | "Sets that stop traffic" lifts away and a 3D coverflow takes over: scrolling walks it card by card, with caption, counter and progress bar (arrows, click or ←/→ jump to a card) |
| 05 | Statement | Headline fills in word by word |
| 06 | Reveal | Pearl name on soft pink haze opens onto the lobby film — "Your chair is ready" |
| 07–09 | Treatments, Reviews, Visit | Menu, reviews, Lagos map, hours, contact and a booking form that sends to WhatsApp |

## Run it

```bash
cd tubo
npm install
npm run dev        # local dev server
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/
npm run shots      # after build: desktop + mobile screenshots into .shots/
                   # (STOPS="2.4,3.4" ONLY=desktop narrows it; CHROMIUM_PATH picks the browser)
```

`dist/` uses relative paths, so it can be uploaded to any static host or subfolder.

## Media

Originals live in `media/source/`: `entrance.mp4` (landscape walk-in, used on desktops and landscape
tablets), `entrance-portrait.mp4` (vertical walk-in, used on phones and portrait tablets) and `photos/`.
`npm run media` (needs ffmpeg) regenerates everything in `public/`: hero frames in
`public/frames/{land,port}/{hd,sd}/` plus `src/frames.generated.json`, the painted-out wall (`wall.webp`)
and its soft-focus copy (`wall-blur.webp`), the lobby loops and nail reel in `public/media/`, and WebP
photos in `public/photos/`.

If either entrance film changes, re-measure the wall sign in its last frame and update both `FILMS` in
`src/main.ts` and the sign boxes in `scripts/build-media.sh` — the pulled-out name is matched to it.

## Speed

Each screen downloads only its own film and only what it needs to open: the page is ready to scroll once
the first frame is in (about 0.3 MB), and the rest of the film streams in nearest-first while the visitor
looks at the storefront. Photos and clips below the hero load as you approach them. `public/_headers`
sets long-lived caching on Netlify. Measured with throttled Chrome: ready to scroll in about 0.5 s on fast
connections, 0.8 s on 4G and 1.7 s on slow 4G, on desktop, tablet and phone alike.

## Before launch — placeholders to replace

- **Contact & socials**: everything in `src/content.ts` (phone, WhatsApp number, email, street address,
  city, hours, Instagram/TikTok/Facebook/X links and handles). The city is assumed to be Lagos; the map pin follows `mapQuery`.
- **Reviews**: the three quotes in `index.html` (marked `PLACEHOLDER`) — use real client reviews.
- **Treatment menu**: names and durations in `index.html` are a suggested starting menu.
- The logo mark is a swirl drawn in SVG after the "o" on the sign (`#swirl` in `index.html`,
  `public/favicon.svg`); swap in the salon's real logo file when available.

Visitors who prefer reduced motion get a static page with the name already off the wall; slow or
data-saver connections get the lighter `sd` hero frames (force with `?tier=hd` / `?tier=sd`).
