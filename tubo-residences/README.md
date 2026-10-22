# Tubo Residences — residence explorer (concept)

A concept sales website for Tubo Residences. It is built on photo-realistic
renders, so visitors can:

- see each apartment's availability drawn on the tower
- open its floor plan
- look at the view
- switch between day, overcast and night

The renders in `public/renders/` are AI-generated concept images, not
pictures of a real building.

## Run it

```bash
cd tubo-residences
npm install
npm run dev        # local dev server
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/
```

`dist/` is a static site that can be hosted anywhere (Netlify, Vercel,
S3, GitHub Pages…).

## What's on screen

| Part | What it does |
|---|---|
| Time-of-day slider (top) | Crossfades the tower between its real day, overcast and night renders. The other photos are colour-graded to follow it |
| **Location** | Aerial render of the seafront with the tower and nearby places pinned. Tap the tower to dive in |
| **Apartments** | Every residence traced on the tower photo in its status colour: blue available, yellow reserved, red sold. Hover for details; tap to zoom in and select |
| Filters (› on the right) | Status, bedrooms and floor range; the list and the tower update together |
| Residence card | Mini plan, bedrooms, floor, area and **Floor plan**, tied to the apartment by a leader line |
| Floor plan | Key plan, full layout, area, price, **Window view**, **Add to compare**, **Download floor plan** (SVG sheet) and **Enquire** (email) |
| Window view | **View 1**: the living room and its sea view. **View 2**: out over the bay |
| **Compare** | Up to four residences side by side |
| **Gallery** | All the renders |
| **Highlights** | Project facts and selling points |

`?apartment=1804` in the URL opens straight onto a residence.

## The renders

| File | Used for |
|---|---|
| `tower-day.jpg` | The main tower view; the apartments were traced on it |
| `tower-overcast.jpg`, `tower-night.jpg` | Edits of the day render with the same framing, so the traced apartments still line up |
| `aerial.jpg` | Location view |
| `interior.jpg` | Window view 1 and the gallery |

To replace the tower render, also re-measure the balcony slabs in
`src/facade.ts`. The apartment outlines are drawn from those numbers.

Worth adding later: a sunrise render (an edit of `tower-day.jpg` in the
same framing), a dedicated balcony view, more interiors, and higher-resolution
versions. The current images are 1344 × 752.

## Placeholders

Everything marked `PLACEHOLDER` in `src/data.ts` is made up:

- the sales email
- the unit mix and areas
- availability (generated)
- nearby places
- the highlights copy

The floor plans in `src/plans.ts` are indicative drawings.

## How it's built

- `src/main.ts`: the interface, the photo stage and the flow between views.
- `src/facade.ts`: where each apartment sits on the tower render.
- `src/data.ts`: the residence schedule and copy.
- `src/plans.ts`: the SVG floor plans, key plans and the download sheet.
- `src/styles.css`: all styling, including the phone layout.
