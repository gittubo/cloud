// Review screenshots: serves dist/ and captures the scroll story at fixed
// points on desktop and mobile into .shots/. Run after `npm run build`.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const PORT = 4318
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
const url = `http://localhost:${PORT}/`

// Scroll positions in viewport heights; STOPS="2.3,2.6" and ONLY=desktop
// narrow a run, e.g. to step through the hero.
const stops = process.env.STOPS?.split(',').map(Number) ?? [0, 1.5, 2.4, 2.9, 3.4, 4.6, 5.8, 6.6, 7.6, 9, 10.4, 11.6, 12.8, 14, 15.2, 16.2, 17.2, 18.4, 19.6, 21, 23, 25]
const viewports = Object.fromEntries(
  Object.entries({
    desktop: { width: 1440, height: 900 },
    mobile: { width: 390, height: 844 },
  }).filter(([name]) => !process.env.ONLY || process.env.ONLY === name),
)

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('preview server did not start')
}

try {
  await waitForServer()
  mkdirSync('.shots', { recursive: true })
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  for (const [name, viewport] of Object.entries(viewports)) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForSelector('.preloader.is-done', { state: 'attached', timeout: 15000 })
    const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
    for (const s of stops) {
      const y = Math.min(max, Math.round(s * viewport.height))
      await page.evaluate((y) => window.scrollTo(0, y), y)
      await page.waitForTimeout(1400)
      await page.screenshot({ path: `.shots/${name}-${String(s).replace('.', '_')}.png` })
      if (y === max) break
    }
    console.log(`${name}: ${errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors'}`)
    await page.close()
  }
  await browser.close()
} finally {
  server.kill()
}
