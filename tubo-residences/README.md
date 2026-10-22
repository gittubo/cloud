# Tubo Residences — 3D residence explorer

An interactive sales website for Tubo Residences. Visitors explore the
development in real-time 3D. They can:

- see every apartment's availability on the tower itself
- open its floor plan
- stand on its balcony to see the view, at sunrise, by day, under cloud or at night

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
| Time-of-day slider (top) | Sunrise → day → overcast → night: sun, sky, clouds, fog, sea and lit windows all follow it |
| **Location** | Aerial view of the site, the city and the bay, with the two towers and nearby places pinned |
| **Apartments** | Every residence drawn on the tower in its status colour: blue available, yellow reserved, red sold. Hover for details, tap to select |
| Filters (› on the right) | Status, bedrooms, tower and floor range; the list and the 3D view update together |
| Residence card | Mini plan, bedrooms, floor, area and a **Floor plan** button, tied to the apartment by a leader line |
| Floor plan | Key plan of the floor, the full layout, area, price, **Window view**, **Add to compare**, **Download floor plan** (SVG sheet) and **Enquire** (email) |
| Window view | The camera stands on that apartment's balcony at its real height. **View 1** looks straight out, **View 2** turns along the coast, and you can drag to look around |
| **Compare** | Up to four residences side by side |
| **Gallery** | Five cinematic camera shots, each at its own time of day |
| **Highlights** | Project facts and selling points |

`?apartment=A1804` in the URL opens straight onto a residence, which is
handy for links in emails and ads.

## Before launch: replace the placeholders

Everything marked `PLACEHOLDER` in the source is illustrative:

- `src/data.ts`
  - `brand.salesEmail`: the address the Enquire button writes to
  - `towers`: number of floors and footprint
  - `slots`: the unit mix and areas per floor
  - `statusFor()`: availability is generated. Replace it with the live sales schedule (a JSON file or an API)
  - `places`: nearby points of interest and their walking or driving times
  - `highlights`: the selling points
- `src/plans.ts`: the three apartment layouts are indicative drawings. Swap them for the architect's plans (SVG or images)

## How it's built

- `src/scene.ts`: the Three.js world. The towers are generated from a
  floor-shape function, so the balconies ripple floor by floor. It also
  builds one selectable volume per residence, the city, the coast, the
  physical sky (`Sky` with clouds) and the time-of-day keyframes, and
  handles the camera flights.
- `src/data.ts`: the towers, the floor geometry and the residence schedule.
- `src/plans.ts`: the SVG floor plans, key plans and the download sheet.
- `src/main.ts`: the interface and the flow between views.
- `src/styles.css`: all styling, including the phone layout.
