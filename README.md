# Just10 Group — cinematic scroll site

A cinematic, scroll-driven site that tells the story of a build:

| Page | File | What happens |
|---|---|---|
| 01 Home | `index.html` | Bare earth → structure → finished resort → lobby; the glass doors swing open onto the **Just10 Group** name |
| 02 The Resort | `resort.html` | Through the doors, across the terrace, up to the aerial; project specs and headline numbers |
| 03 Suites | `suites.html` | A beam of light scans the tower floor by floor, locks onto one, and the camera dives through its window into the rooms |
| 04 Services | `services.html` | Services and process |
| 05 Contact | `contact.html` | Enquiry form |

Each page ends with a full-screen card leading to the next.

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
  to a canvas, crossfading neighbours so low-fps chapters stay smooth. Each
  page loads only its own chapters' frames. `src/core.ts` holds what every
  page shares (nav, footer, next-page card, smooth scrolling via Lenis, the
  film player, pinning with GSAP ScrollTrigger); `src/pages/*.ts` holds each
  page's timeline.
- **Floor scan** — the floor positions are measured on the tower frame and
  stored in `suites.floors` in `src/content.ts`; change `lock` there to pick a
  different floor.
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
