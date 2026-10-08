import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'
import { preview } from 'vite'

const PORT = 4173
const URL = `http://127.0.0.1:${PORT}/?capture=1&perf=1`

const server = await preview({ preview: { host: '127.0.0.1', port: PORT, strictPort: true } })
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__TINY_TD__?.getState?.().ready)
await page.evaluate(() => {
  const api = window.__TINY_TD__
  api.buy(2, 7, 'turret')
  api.buy(3, 7, 'cannon')
  api.buy(5, 7, 'ballista')
  api.setTimeScale(10)
  api.startWave()
})
const samples = []
const start = Date.now()
let lastWave = 0
while (Date.now() - start < 90000) {
  const snap = await page.evaluate(() => {
    const state = window.__TINY_TD__.getState()
    const perf = window.__TINY_TD__.perf()
    return { wave: state.wave, phase: state.phase, ...perf }
  })
  if (snap.wave !== lastWave || snap.phase === 'victory' || snap.phase === 'defeat') {
    samples.push(snap)
    lastWave = snap.wave
  }
  if (snap.wave >= 3 && (snap.phase === 'breather' || snap.phase === 'wave' && snap.wave > 3)) break
  if (snap.phase === 'victory' || snap.phase === 'defeat') break
  if (snap.phase === 'breather' || snap.phase === 'ready') await page.evaluate(() => window.__TINY_TD__.startWave())
  await delay(150)
}
const end = await page.evaluate(() => window.__TINY_TD__.perf())
console.log(JSON.stringify({ samples, end }, null, 2))
await browser.close()
await server.close()
