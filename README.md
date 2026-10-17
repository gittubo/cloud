# Just10 Group — cinematic scroll site

A single-page site that tells the story of a build as you scroll: bare earth →
structure → finished resort → lobby → the glass doors swing open onto the
**Just10 Group** name → terrace → aerial → suites, followed by services,
process and contact.

## Run it

```bash
npm install
npm run dev        # local dev server
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/
```

## How it works

- **Footage** — the three source clips in `media/source/` are one continuous
  camera move. `npm run frames` (Python 3 + ffmpeg) cuts them into WebP frame
  sequences in `public/frames/{hd,sd}/` and writes the chapter manifest
  `src/frames.generated.json`. Each chapter has its own sampling rate and
  scroll length, set in `CHAPTERS` at the top of `scripts/build-frames.py`.
- **Logo** — `npm run brand` splits `media/source/logo.png` into aligned layers
  (`public/brand/`) so the monogram, divider, "Just10" and "GROUP" can animate
  in one by one.
- **Playback** — `src/sequence.ts` streams frames nearest-first and draws them
  to a canvas, crossfading neighbours so low-fps chapters stay smooth.
  `src/main.ts` pins the stage and drives one GSAP ScrollTrigger timeline
  (smoothed by Lenis): film, captions, the door reveal and the hand-off of the
  logo into the nav.
- **Copy** — every word lives in `src/content.ts`.
- **Reduced motion** — visitors who ask for it get one still per chapter with
  normal scrolling; slow or data-saver connections get the lighter `sd` frames
  (force either with `?tier=hd` / `?tier=sd`).

## Before launch

Placeholders in `src/content.ts` must be replaced with real details: the
statistics, contact email, phone and address. The enquiry form opens the
visitor's email app; connect it to a form service if one is preferred.

## Review screenshots

```bash
npm run build && npm run shots   # writes .shots/ (desktop + mobile)
```

Set `CHROMIUM_PATH` to use an installed Chromium instead of Playwright's own.
