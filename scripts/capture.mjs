import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'

const PORT = 4173
const URL = `http://127.0.0.1:${PORT}/?capture=1`
const OUT = '/opt/cursor/artifacts/screenshots'

const preview = spawn(
  'npx',
  ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  { stdio: 'inherit' },
)

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    if (preview.exitCode !== null) {
      throw new Error(`preview exited (${preview.exitCode}) before it was ready`)
    }
    try {
      const res = await fetch(URL)
      if (res.ok) {
        await delay(150)
        if (preview.exitCode !== null) {
          throw new Error(`preview exited (${preview.exitCode}); another server answered`)
        }
        return
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('preview exited')) throw error
    }
    await delay(200)
  }
  throw new Error('preview did not start')
}

try {
  await mkdir(OUT, { recursive: true })
  await waitForServer()
  if (preview.exitCode !== null) {
    throw new Error(`preview exited (${preview.exitCode}); refusing to screenshot a different server`)
  }
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-angle=swiftshader',
      '--use-gl=angle',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--enable-unsafe-swiftshader',
    ],
  })
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  })
  page.on('pageerror', (error) => {
    console.error('pageerror', error.message)
  })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__TINY_TD__?.ready && !window.__TINY_TD__.error)

  await page.evaluate(() => {
    const api = window.__TINY_TD__
    api.buy(2, 7, 'base')
    api.buy(2, 7, 'turret')
    api.buy(2, 7, 'middle-a')
    api.buy(3, 4, 'base')
    api.buy(3, 4, 'ballista')
    api.startWave()
  })
  await delay(1600)
  await page.screenshot({ path: `${OUT}/portrait_gameplay.png` })

  await page.evaluate(() => {
    const api = window.__TINY_TD__
    api.setGold(400)
    api.buy(2, 7, 'middle-c')
    api.buy(2, 7, 'middle-b')
    api.buy(2, 7, 'roof-b')
    api.buy(2, 7, 'cannon')
    api.cameraFocus(2, 7, 6.2)
  })
  await delay(500)
  await page.screenshot({ path: `${OUT}/stacked_tower.png` })

  await page.evaluate(() => {
    window.__TINY_TD__.retry()
    window.__TINY_TD__.cameraFocus(2.7, 0.45, 5.2)
    window.__TINY_TD__.debugAbduct()
  })
  await delay(620)
  await page.screenshot({ path: `${OUT}/pet_abduction.png` })

  await page.evaluate(() => window.__TINY_TD__.debugWin())
  await delay(250)
  await page.screenshot({ path: `${OUT}/win_screen.png` })

  await page.evaluate(() => {
    window.__TINY_TD__.retry()
    window.__TINY_TD__.debugLose()
  })
  await delay(250)
  await page.screenshot({ path: `${OUT}/lose_screen.png` })

  await page.setViewportSize({ width: 844, height: 390 })
  await page.evaluate(() => {
    window.__TINY_TD__.retry()
    window.__TINY_TD__.buy(2, 7, 'base')
    window.__TINY_TD__.buy(2, 7, 'turret')
    window.__TINY_TD__.buy(2, 7, 'middle-c')
    window.__TINY_TD__.startWave()
  })
  await delay(900)
  await page.screenshot({ path: `${OUT}/landscape_gameplay.png` })

  await browser.close()
  console.log('screenshots written to', OUT)
} finally {
  preview.kill('SIGTERM')
}
