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
await page.addInitScript(() => {
  localStorage.setItem('tiny-td-dmg', '1')
  localStorage.setItem('tiny-td-tutorial-v1', '1')
  localStorage.setItem('tiny-td-settings', JSON.stringify({ sound: false, music: false, haptics: false, damage: true, quality: 'auto' }))
})
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__TINY_TD__?.getState?.().ready)
await page.evaluate(() => {
  const api = window.__TINY_TD__
  api.buy(2, 7, 'turret')
  api.buy(3, 7, 'cannon')
  api.buy(5, 7, 'ballista')
  api.setTimeScale(8)
  api.startWave()
})
await delay(600)
const samples = []
const combat = []
const start = Date.now()
let lastWave = 0
while (Date.now() - start < 90000) {
  const snap = await page.evaluate(() => {
    const state = window.__TINY_TD__.getState()
    const perf = window.__TINY_TD__.perf()
    return {
      wave: state.wave,
      phase: state.phase,
      enemies: state.enemies,
      geometries: perf.geometries,
      textures: perf.textures,
      programs: perf.programs,
      playResizes: perf.playResizes,
      playCompiles: perf.playCompiles,
      playUploads: perf.playUploads,
      uploadsPerSec: perf.uploadsPerSec,
      popupsPerSec: perf.popupsPerSec,
      soundsPerSec: perf.soundsPerSec,
      tier: perf.tier,
      dpr: perf.dpr,
      canvas: perf.canvas,
      tierChanges: perf.tierChanges,
      log: perf.log,
    }
  })
  if (snap.wave !== lastWave) {
    samples.push(snap)
    lastWave = snap.wave
  }
  if (snap.phase === 'wave') combat.push(snap)
  if (snap.wave >= 4 && snap.phase === 'breather') break
  if (snap.phase === 'victory' || snap.phase === 'defeat') break
  if (snap.phase === 'breather' || snap.phase === 'ready') await page.evaluate(() => window.__TINY_TD__.startWave())
  await delay(200)
}
const end = await page.evaluate(() => {
  const state = window.__TINY_TD__.getState()
  return { wave: state.wave, phase: state.phase, ...window.__TINY_TD__.perf() }
})
const rates = combat.map((row) => row.uploadsPerSec)
const maxUp = rates.length ? Math.max(...rates) : 0
const avgUp = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0
const geos = samples.map((row) => row.geometries)
const texs = samples.map((row) => row.textures)
const progs = samples.map((row) => row.programs)
console.log(JSON.stringify({
  waves: samples.map((row) => ({
    wave: row.wave,
    phase: row.phase,
    geo: row.geometries,
    tex: row.textures,
    prog: row.programs,
    playResizes: row.playResizes,
    playCompiles: row.playCompiles,
    playUploads: row.playUploads,
  })),
  combatSamples: combat.length,
  uploadsPerSec: { max: maxUp, avg: Number(avgUp.toFixed(2)) },
  flat: {
    geo: Math.max(...geos) - Math.min(...geos),
    tex: Math.max(...texs) - Math.min(...texs),
    prog: Math.max(...progs) - Math.min(...progs),
  },
  end: {
    playResizes: end.playResizes,
    playCompiles: end.playCompiles,
    playUploads: end.playUploads,
    geometries: end.geometries,
    textures: end.textures,
    programs: end.programs,
    tier: end.tier,
    dpr: end.dpr,
    canvas: end.canvas,
    tierChanges: end.tierChanges,
    log: end.log,
    phase: end.phase,
    wave: end.wave,
  },
}, null, 2))
await browser.close()
await server.close()
