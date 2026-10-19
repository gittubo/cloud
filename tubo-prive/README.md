# Tubo Privé — med spa & beauty clinic site

A separate, self-contained site (not part of the Just10 Group site at the repo root).
One cinematic scroll story, modelled on the reference walkthrough:

| # | Section | What happens |
|---|---|---|
| 01 | Hero | Scroll walks from the street through the glass doors into the lobby; the gold **Tubo Privé** name rises as the room softens |
| 02 | Intro | Huge wine-to-gold name, treatment photos fan in, intro card |
| 03 | Social | Dark moment: an Instagram-style post pops up over the sliding "Beauty clinic in Lagos" text, then opens out full screen |
| 04 | Gallery | "Glow in 30 minutes!" with a 3D card deck that spreads as you scroll (arrows, click or ←/→ to browse) |
| 05 | Statement | Headline fills in word by word |
| 06 | Reveal | Silver name on soft haze opens onto the facial film — "Golden hour in the treatment room" |
| 07–09 | Treatments, Reviews, Visit | Menu, reviews, Lagos map, hours, contact and a booking form that sends to WhatsApp |

## Run it

```bash
cd tubo-prive
npm install
npm run dev        # local dev server
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/
npm run shots      # after build: desktop + mobile screenshots into .shots/
```

`dist/` uses relative paths, so it can be uploaded to any static host or subfolder.

## Media

Originals live in `media/source/` (`entrance.mp4`, `facial.mp4`, `nails.mp4`, `lashes.mp4`, `photos/`).
`npm run media` (needs ffmpeg) regenerates everything in `public/`:
hero frames in `public/frames/{hd,sd}/` plus `src/frames.generated.json`, muted web clips with posters in
`public/media/`, and WebP photos in `public/photos/`. To swap the hero film, replace `entrance.mp4` and re-run.

## Before launch — placeholders to replace

- **Contact & socials**: everything in `src/content.ts` except the city (phone, WhatsApp number, email,
  street address, hours, Instagram/TikTok/Facebook/X links and handles). The map pin follows `mapQuery`.
- **Reviews**: the three quotes in `index.html` (marked `PLACEHOLDER`) — use real client reviews.
- **Treatment menu**: names and durations in `index.html` are a suggested starting menu.
- The logo is a simple leaf mark drawn in SVG (`#sprig` in `index.html`, `public/favicon.svg`); swap in the
  clinic's real logo file when available.

Visitors who prefer reduced motion get a static page; slow or data-saver connections and phones get the
lighter `sd` hero frames (force with `?tier=hd` / `?tier=sd`).
