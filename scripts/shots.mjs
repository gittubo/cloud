// Screenshots of key moments on every page, for review. Needs `npm run build` first.
// Usage: node scripts/shots.mjs [outDir] [pageFilter]
// CHROMIUM_PATH points at a pre-installed browser when Playwright's own build is absent.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const out = process.argv[2] ?? '.shots'
const only = process.argv[3]
mkdirSync(out, { recursive: true })

const PORT = 4179
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))

// Per page: [name, chapter id, fraction] (scrubbed film position) or [name, selector].
const pages = {
  index: [
    ['hero', 'ground', 0],
    ['lobby', 'lobby', 0.5],
    ['doors-opening', 'doors', 0.72],
    ['name', 'doors', 0.99],
    ['finale', 'finale', 0.6],
    ['next', '.next'],
  ],
  resort: [
    ['hero', 'page', 0],
    ['project', 'page', 0.34],
    ['statement', 'page', 0.6],
    ['numbers', 'page', 0.95],
  ],
  suites: [
    ['hero', 'tower', 0.02],
    ['scan-a', 'tower', 0.24],
    ['scan-b', 'tower', 0.5],
    ['locked', 'tower', 0.84],
    ['dive', 'dive', 0.25],
    ['room-01', 'rooms', 0.07],
    ['room-03', 'rooms', 0.38],
    ['finale', 'rooms', 0.97],
  ],
  services: [
    ['hero', '#top'],
    ['list', '.service-list'],
    ['process', '.process-page'],
  ],
  contact: [
    ['hero', '#top'],
    ['form', '.contact'],
  ],
}

const viewports = [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 }],
]

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
try {
  for (const [label, viewport] of viewports) {
    const { isMobile, deviceScaleFactor, ...size } = viewport
    for (const [page, moments] of Object.entries(pages)) {
      if (only && page !== only) continue
      const tab = await browser.newPage({ viewport: size, isMobile, deviceScaleFactor })
      const errors = []
      tab.on('pageerror', (e) => errors.push(e.message))
      await tab.goto(`http://localhost:${PORT}/${page === 'index' ? '' : `${page}.html`}`)
      await tab.waitForSelector('html.is-ready', { timeout: 30000 })
      await tab.waitForTimeout(1800)
      for (const [name, target, frac] of moments) {
        await tab.evaluate(
          ([target, frac]) => {
            const y = target.startsWith('#') || target.startsWith('.')
              ? document.querySelector(target).getBoundingClientRect().top + window.scrollY
              : (window.__story.at(target, frac) / 100) * window.innerHeight
            window.scrollTo(0, y)
          },
          [target, frac ?? 0],
        )
        await tab.waitForTimeout(1500)
        await tab.screenshot({ path: `${out}/${label}-${page}-${name}.jpg`, quality: 80 })
      }
      console.log(label, page, errors.length ? `page errors: ${errors.join(' | ')}` : 'no page errors')
      await tab.close()
    }
  }
} finally {
  await browser.close()
  server.kill()
}
