import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'

const bundle = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../dist/index.html'), 'utf8').match(
  /index-[^"]+\.js/,
)?.[0]
if (!bundle) throw new Error('dist bundle missing')

const PORT = Number(process.env.PORT || 4173)
const URL = `http://127.0.0.1:${PORT}/?capture=1`
const OUT = '/opt/cursor/artifacts/screenshots'

const preview = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  { stdio: 'inherit', detached: true },
)

function stopPreview() {
  if (preview.exitCode !== null || preview.pid == null) return
  try {
    process.kill(-preview.pid, 'SIGKILL')
  } catch {
    try {
      preview.kill('SIGKILL')
    } catch {
      /* already gone */
    }
  }
}

async function clipTray(page) {
  return page.evaluate(() => {
    const buttons = [...document.querySelectorAll('#tray button')]
    const rects = buttons.map((button) => button.getBoundingClientRect()).filter((rect) => rect.width > 2 && rect.height > 2)
    if (!rects.length) return { x: 0, y: 0, width: 0, height: 0 }
    const left = Math.max(0, Math.min(...rects.map((rect) => rect.left)))
    const top = Math.max(0, Math.min(...rects.map((rect) => rect.top)))
    const right = Math.min(window.innerWidth, Math.max(...rects.map((rect) => rect.right)))
    const bottom = Math.min(window.innerHeight, Math.max(...rects.map((rect) => rect.bottom)))
    return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
  })
}

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
  const served = await page.content()
  if (!served.includes(bundle)) throw new Error(`preview is not serving ${bundle}`)
  await page.waitForFunction(() => window.__TINY_TD__?.ready && !window.__TINY_TD__.error)

  await page.evaluate(() => {
    const api = window.__TINY_TD__
    api.buy(2, 7, 'base')
    api.buy(2, 7, 'turret')
    api.buy(2, 7, 'middle-a')
    api.buy(3, 4, 'base')
    api.buy(3, 4, 'ballista')
    api.startWave()
    api.deselect()
  })
  await delay(1400)
  await page.evaluate(() => window.__TINY_TD__.setTimeScale(0))
  await page.waitForFunction(() => document.querySelectorAll('.fly-coin').length === 0)
  const portraitFrame = await page.evaluate(() => {
    const api = window.__TINY_TD__
    return {
      spawn: api.project(1, 10.4, 0.55),
      chick: api.project(3.02, 0.12, 0.5),
      fox: api.project(4.22, 0.26, 0.55),
      dog: api.project(1.72, 0.28, 0.55),
      end: api.project(3, 0.1, 0.45),
    }
  })
  console.log('portrait frame', JSON.stringify(portraitFrame))
  for (const [name, point] of Object.entries(portraitFrame)) {
    if (!point || point.x < 16 || point.x > 374 || point.y < 96 || point.y > 720) {
      throw new Error(`portrait framing missed ${name}: ${JSON.stringify(point)}`)
    }
  }
  await page.screenshot({ path: `${OUT}/portrait_gameplay.png` })
  const river = await page.evaluate(() => {
    const pts = []
    for (let x = 0.4; x <= 6.2; x += 0.35) {
      const p = window.__TINY_TD__.project(x, 5)
      if (p) pts.push(p)
    }
    return pts
  })
  if (river.length > 2) {
    const xs = river.map((p) => p.x)
    const ys = river.map((p) => p.y)
    const scale = 2
    const clip = {
      x: Math.max(0, Math.floor(Math.min(...xs) * scale)),
      y: Math.max(0, Math.floor((Math.min(...ys) - 18) * scale)),
      width: Math.ceil((Math.max(...xs) - Math.min(...xs)) * scale),
      height: Math.ceil(48 * scale),
    }
    await page.screenshot({ path: `${OUT}/river_crop.png`, clip: {
      x: clip.x / scale,
      y: clip.y / scale,
      width: clip.width / scale,
      height: clip.height / scale,
    } })
    console.log('river crop css', JSON.stringify(clip))
  }

  await page.evaluate(() => {
    const api = window.__TINY_TD__
    api.setGold(400)
    api.buy(2, 7, 'middle-c')
    api.buy(2, 7, 'middle-b')
    api.buy(2, 7, 'roof-b')
    api.buy(2, 7, 'cannon')
    api.deselect()
    api.cameraLook(6.23, 8.66, -4.89, 2, 2.6, 7)
  })
  await delay(500)
  const towerFrame = await page.evaluate(() => ({
    spire: window.__TINY_TD__.project(2, 7, 5.6),
    base: window.__TINY_TD__.project(2, 7, 0.3),
  }))
  console.log('tower frame', JSON.stringify(towerFrame))
  if (!towerFrame.spire || towerFrame.spire.y < 110 || !towerFrame.base || towerFrame.base.y > 680) {
    throw new Error(`stacked tower hits the HUD: ${JSON.stringify(towerFrame)}`)
  }
  await page.screenshot({ path: `${OUT}/stacked_tower.png` })

  await page.setViewportSize({ width: 360, height: 780 })
  await page.evaluate(() => {
    const api = window.__TINY_TD__
    api.cameraFocus(3, 4.6, 15.2)
    api.select(2, 7)
  })
  await delay(350)
  const boxes = await page.evaluate(() => {
    const card = document.querySelector('#card')?.getBoundingClientRect()
    const buttons = [...document.querySelectorAll('#tray button')].map((button) => {
      const rect = button.getBoundingClientRect()
      return {
        id: button.dataset.part,
        text: button.innerText.replace(/\s+/g, ' '),
        overflow: [...button.querySelectorAll('span')].some((span) => span.scrollWidth > span.clientWidth + 1),
        thumb: (button.querySelector('.thumb')?.naturalWidth ?? 0) > 8,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        r: Math.round(rect.right),
        b: Math.round(rect.bottom),
      }
    })
    return { card: card && { x: card.x, y: card.y, r: card.right, b: card.bottom, w: card.width }, buttons }
  })
  console.log('panel', JSON.stringify(boxes))
  await page.screenshot({ path: `${OUT}/build_panel.png` })
  await page.screenshot({ path: `${OUT}/build_panel_360.png` })
  const labelClip = await clipTray(page)
  if (labelClip.width < 8) throw new Error(`shop labels missing at 360: ${JSON.stringify(boxes)}`)
  await page.screenshot({ path: `${OUT}/shop_labels_360.png`, clip: labelClip })

  await page.setViewportSize({ width: 320, height: 780 })
  await delay(300)
  const boxes320 = await page.evaluate(() => {
    const card = document.querySelector('#card')?.getBoundingClientRect()
    const buttons = [...document.querySelectorAll('#tray button')].map((button) => {
      const rect = button.getBoundingClientRect()
      return {
        id: button.dataset.part,
        text: button.innerText.replace(/\s+/g, ' '),
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        r: Math.round(rect.right),
        b: Math.round(rect.bottom),
        w: Math.round(rect.width),
      }
    })
    return { card: card && { x: card.x, y: card.y, r: card.right, b: card.bottom, w: card.width }, buttons }
  })
  console.log('panel320', JSON.stringify(boxes320))
  await page.screenshot({ path: `${OUT}/build_panel_320.png` })
  const labelClip320 = await clipTray(page)
  if (labelClip320.width < 8) throw new Error(`shop labels missing at 320: ${JSON.stringify(boxes320)}`)
  await page.screenshot({ path: `${OUT}/shop_labels_320.png`, clip: labelClip320 })
  await page.setViewportSize({ width: 390, height: 844 })

  await page.evaluate(() => {
    window.__TINY_TD__.retry()
    window.__TINY_TD__.cameraFocus(3, 1.1, 9.2)
    window.__TINY_TD__.debugAbduct()
  })
  await delay(680)
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
    window.__TINY_TD__.deselect()
  })
  await delay(900)
  await page.screenshot({ path: `${OUT}/landscape_gameplay.png` })

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.evaluate(() => {
    window.__TINY_TD__.retry()
    window.__TINY_TD__.buy(2, 7, 'base')
    window.__TINY_TD__.buy(2, 7, 'turret')
    window.__TINY_TD__.buy(3, 4, 'base')
    window.__TINY_TD__.buy(3, 4, 'ballista')
    window.__TINY_TD__.startWave()
    window.__TINY_TD__.deselect()
  })
  await delay(900)
  await page.screenshot({ path: `${OUT}/desktop_1280x800.png` })

  await browser.close()
  console.log('screenshots written to', OUT)
} finally {
  stopPreview()
}
