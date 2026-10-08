import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'
import { preview } from 'vite'

const PORT = 4173
const URL = `http://127.0.0.1:${PORT}/?capture=1`

const errors = []
let browser = null
let server = null

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(URL)
      if (res.ok) return
    } catch {
      /* preview still booting */
    }
    await delay(200)
  }
  throw new Error('preview did not start')
}

function stateOf(page) {
  return page.evaluate(() => window.__TINY_TD__?.getState())
}

async function waitUntil(page, label, predicate, timeout = 20000) {
  const start = Date.now()
  let last = null
  while (Date.now() - start < timeout) {
    last = await stateOf(page)
    if (last?.error) throw new Error(`${label}: ${last.error}`)
    if (predicate(last)) return last
    await delay(100)
  }
  throw new Error(`${label} timed out. Last state ${JSON.stringify(last)}`)
}

let code = 0
try {
  server = await preview({
    preview: { host: '127.0.0.1', port: PORT, strictPort: true },
  })
  await waitForServer()
  browser = await chromium.launch({
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
    deviceScaleFactor: 1,
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  const abortedAudio = []
  page.on('requestfailed', (request) => {
    const url = request.url()
    if (!url.includes('/assets/audio/')) return
    abortedAudio.push(`${request.failure()?.errorText ?? 'failed'} ${url}`)
  })
  let glCopies = 0
  page.on('console', (msg) => {
    const text = msg.text()
    if (/copySubTexture|offset overflows/i.test(text)) glCopies += 1
    if (msg.type() === 'error') errors.push(`console: ${text}`)
  })

  await page.goto(URL, { waitUntil: 'networkidle' })
  const ready = await waitUntil(page, 'load', (state) => state?.ready && state.phase === 'ready')
  if (ready.pets !== 5) throw new Error(`expected 5 pets, got ${ready.pets}`)
  const kind = await page.evaluate(() => window.__TINY_TD__.cellKind(2, 7))
  if (kind !== 'build') throw new Error(`hint cell is ${kind}`)

  const hand = await page.locator('#hand-line').textContent()
  if (!hand?.toLowerCase().includes('tap')) throw new Error(`hand missing: ${hand}`)

  if (process.env.ONLY !== '23') {
  await page.evaluate(() => window.__TINY_TD__.cameraFocus(2, 7, 11))
  await delay(100)
  const point = await page.evaluate(() => window.__TINY_TD__.project(2, 7))
  if (!point) throw new Error('cell did not project')
  await page.touchscreen.tap(point.x, point.y)
  await page.locator('[data-part="turret"]').waitFor({ timeout: 3000 })
  await page.locator('[data-part="turret"]').click()
  const built = await stateOf(page)
  if (built.towers !== 1) throw new Error(`tower was not placed via tap: ${JSON.stringify(built)}`)
  if (built.gold >= ready.gold) throw new Error('gold did not drop')

  const beforeZoom = built.zoom
  await page.mouse.move(195, 420)
  await page.mouse.wheel(0, -200)
  await page.mouse.move(160, 430)
  await page.mouse.down()
  await page.mouse.move(210, 470, { steps: 4 })
  await page.mouse.up()
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    const fire = (type, id, x, y) =>
      canvas.dispatchEvent(
        new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }),
      )
    fire('pointerdown', 3, 120, 400)
    fire('pointerdown', 4, 220, 400)
    fire('pointermove', 3, 100, 400)
    fire('pointermove', 4, 250, 400)
    fire('pointerup', 3, 100, 400)
    fire('pointerup', 4, 250, 400)
  })
  const zoomed = await stateOf(page)
  if (zoomed.zoom === beforeZoom) throw new Error('zoom did not change from wheel or pinch')

  const drag = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    const api = window.__TINY_TD__
    const fire = (type, x, y) =>
      canvas.dispatchEvent(
        new PointerEvent(type, { pointerId: 9, clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }),
      )
    fire('pointerdown', 180, 420)
    const samples = []
    for (let i = 0; i < 6; i++) {
      fire('pointermove', 180, 420 + (i + 1) * 14)
      samples.push(api.getState().targetZ)
    }
    fire('pointerup', 180, 510)
    return samples
  })
  let dragChanges = 0
  for (let i = 1; i < drag.length; i++) if (drag[i] !== drag[i - 1]) dragChanges += 1
  console.log('drag samples', drag.join(', '))
  if (dragChanges < 4) throw new Error(`camera drag skipped frames: ${drag.join(', ')}`)

  await page.locator('#start').click()
  await page.evaluate(() => window.__TINY_TD__.setTimeScale(8))
  const after = await waitUntil(
    page,
    'wave 1',
    (state) => state.kills >= 1 || state.phase === 'defeat' || state.phase === 'victory' || state.leaks > 0,
    25000,
  )
  if (after.spawned < 6) throw new Error(`wave did not spawn: ${JSON.stringify(after)}`)
  if (after.kills < 1) throw new Error(`no kills: ${JSON.stringify(after)}`)
  if (after.phase === 'defeat') throw new Error(`lost wave 1: ${JSON.stringify(after)}`)
  if (after.leaks > 0) throw new Error(`wave 1 lost a pet: ${JSON.stringify(after)}`)
  console.log('wave 1', JSON.stringify(after))

  await page.setViewportSize({ width: 1280, height: 800 })
  await delay(200)
  const wide = await stateOf(page)
  if (!wide.ready || wide.error) throw new Error(`landscape broke: ${JSON.stringify(wide)}`)
  await page.setViewportSize({ width: 390, height: 844 })
  await delay(100)

  await page.evaluate(() => {
    const api = window.__TINY_TD__
    api.retry()
    api.setTimeScale(14)
    api.buy(2, 7, 'turret')
    api.startWave()
  })
  const underbuiltStart = Date.now()
  let underbuilt = null
  while (Date.now() - underbuiltStart < 150000) {
    underbuilt = await stateOf(page)
    if (underbuilt?.phase === 'victory' || underbuilt?.phase === 'defeat') break
    if (underbuilt?.phase === 'breather' || underbuilt?.phase === 'ready') {
      await page.evaluate(() => window.__TINY_TD__.startWave())
    }
    await delay(200)
  }
  console.log('one tower', JSON.stringify(underbuilt))
  if (underbuilt?.phase !== 'defeat') {
    throw new Error(`a single tower should lose: ${JSON.stringify(underbuilt)}`)
  }

  await page.evaluate(() => {
    window.__planCursor = 0
    window.__TINY_TD__.retry()
    window.__TINY_TD__.setTimeScale(12)
  })
  const plan = [
    [2, 7, 'turret'],
    [3, 7, 'ballista'],
    [5, 7, 'cannon'],
    [3, 4, 'turret'],
    [4, 2, 'catapult'],
    [2, 7, 'upgrade'],
    [3, 7, 'upgrade'],
    [5, 7, 'upgrade'],
    [3, 4, 'upgrade'],
    [4, 2, 'upgrade'],
    [2, 7, 'upgrade'],
    [3, 7, 'upgrade'],
    [5, 7, 'upgrade'],
    [4, 2, 'upgrade'],
    [3, 4, 'upgrade'],
    [3, 7, 'upgrade'],
    [4, 2, 'upgrade'],
  ]
  const buyNext = () =>
    page.evaluate((steps) => {
      const api = window.__TINY_TD__
      const cursor = (window.__planCursor ??= 0)
      const step = steps[cursor]
      if (!step) return cursor
      const [x, z, part] = step
      if (api.buy(x, z, part)) window.__planCursor = cursor + 1
      return window.__planCursor
    }, plan)

  const started = Date.now()
  let finalState = null
  while (Date.now() - started < 180000) {
    let bought = false
    for (let n = 0; n < 8; n++) {
      const before = await page.evaluate(() => window.__planCursor ?? 0)
      const after = await buyNext()
      if (after === before) break
      bought = true
    }
    finalState = await stateOf(page)
    if (finalState?.error) throw new Error(finalState.error)
    if (finalState?.phase === 'victory' || finalState?.phase === 'defeat') break
    const cursor = await page.evaluate(() => window.__planCursor ?? 0)
    if (cursor >= plan.length) {
      await page.evaluate(() => {
        const spots = [
          [2, 7],
          [3, 7],
          [5, 7],
          [3, 4],
          [4, 2],
        ]
        for (const [x, z] of spots) window.__TINY_TD__.buy(x, z, 'upgrade')
      })
    }
    if (!bought && (finalState?.phase === 'ready' || finalState?.phase === 'breather')) {
      await page.evaluate(() => window.__TINY_TD__.startWave())
    }
    await delay(200)
  }
  console.log('full game', JSON.stringify(finalState))
  if (finalState?.log) {
    console.log('balance')
    console.log('wave | gold | kills | leaks | pets | rescues | abductions | gate | came')
    for (const row of finalState.log) {
      console.log(
        `${row.wave} | ${row.gold} | ${row.kills} | ${row.leaks} | ${row.pets} | ${row.rescues} | ${row.abductions} | ${row.gate} | ${row.came}`,
      )
    }
  }
  if (!finalState || (finalState.phase !== 'victory' && finalState.phase !== 'defeat')) {
    throw new Error(`full game did not finish: ${JSON.stringify(finalState)}`)
  }
  if (finalState.phase !== 'victory') {
    throw new Error(`mixed defense lost: ${JSON.stringify(finalState)}`)
  }
  if (finalState.abductions < 1) throw new Error(`mixed defense was never pressured: ${JSON.stringify(finalState)}`)
  if (finalState.rescues < 1) throw new Error(`mixed defense never rescued a pet: ${JSON.stringify(finalState)}`)
  }

  for (const levelId of [2, 3]) {
    const loaded = await page.evaluate((id) => {
      window.__TINY_TD__.startLevel(id)
      return window.__TINY_TD__.getState()
    }, levelId)
    console.log(`level ${levelId} load`, JSON.stringify({ level: loaded.level, phase: loaded.phase, pets: loaded.pets }))
    if (loaded.level !== levelId || loaded.phase !== 'ready' || loaded.pets !== 5) {
      throw new Error(`level ${levelId} did not load: ${JSON.stringify(loaded)}`)
    }
  }

  if (abortedAudio.length) throw new Error(`audio downloads were cancelled:\n${abortedAudio.join('\n')}`)
  if (errors.length) throw new Error(errors.join('\n'))
  console.log('glCopySubTexture warnings', glCopies)
  console.log('aborted audio', abortedAudio.length)
  console.log('playthrough ok')
} catch (error) {
  code = 1
  console.error(error)
} finally {
  if (browser) await browser.close()
  if (server) await server.close()
}
process.exit(code)
