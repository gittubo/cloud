// Screenshots of key story moments, for review. Needs `npm run build` first.
// Usage: node scripts/shots.mjs [outDir]
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const out = process.argv[2] ?? '.shots'
mkdirSync(out, { recursive: true })

const PORT = 4179
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))

// [name, chapter id, fraction through chapter] — or a selector to scroll to.
const moments = [
  ['01-hero', 'ground', 0],
  ['02-structure', 'frame', 0.45],
  ['03-envelope', 'finish', 0.5],
  ['04-design', 'vision', 0.5],
  ['05-arrival', 'arrival', 0.5],
  ['06-lobby', 'lobby', 0.5],
  ['07-doors-opening', 'doors', 0.72],
  ['08-name-revealed', 'doors', 0.99],
  ['09-terrace-hold', 'terrace', 0.2],
  ['10-handoff', 'terrace', 0.4],
  ['11-statement', 'terrace', 0.58],
  ['12-stats', 'terrace', 0.9],
  ['13-suites', 'suites', 0.5],
  ['14-services', '#services'],
  ['15-contact', '#contact'],
]

const viewports = [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 }],
]

// CHROMIUM_PATH points at a pre-installed browser when Playwright's own build is absent.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
try {
  for (const [label, viewport] of viewports) {
    const { isMobile, deviceScaleFactor, ...size } = viewport
    const page = await browser.newPage({ viewport: size, isMobile, deviceScaleFactor })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`http://localhost:${PORT}/`)
    await page.waitForSelector('html.is-ready', { timeout: 30000 })
    await page.waitForTimeout(1800)
    for (const [name, target, frac] of moments) {
      await page.evaluate(
        ([target, frac]) => {
          const s = window.__story
          const y = target.startsWith('#')
            ? document.querySelector(target).getBoundingClientRect().top + window.scrollY
            : (s.at(target, frac) / 100) * window.innerHeight
          s.lenis.scrollTo(y, { immediate: true, force: true })
        },
        [target, frac ?? 0],
      )
      await page.waitForTimeout(1600)
      await page.screenshot({ path: `${out}/${label}-${name}.jpg`, quality: 80 })
    }
    console.log(label, errors.length ? `page errors: ${errors.join(' | ')}` : 'no page errors')
    await page.close()
  }
} finally {
  await browser.close()
  server.kill()
}
