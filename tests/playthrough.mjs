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

  const hint = await page.locator('#hint').textContent()
  if (!hint?.toLowerCase().includes('weapon')) throw new Error(`hint missing: ${hint}`)
  const coach = await page.locator('#coach-text').textContent()
  if (!coach?.toLowerCase().includes('pad')) throw new Error(`coach missing: ${coach}`)

  if (process.env.ONLY !== '23') {
  await page.evaluate(() => window.__TINY_TD__.cameraFocus(2, 7, 11))
  await delay(100)
  const point = await page.evaluate(() => window.__TINY_TD__.project(2, 7))
  if (!point) throw new Error('cell did not project')
  await page.touchscreen.tap(point.x, point.y)
  await page.locator('[data-part="base"]').waitFor({ timeout: 3000 })
  await page.locator('[data-part="base"]').click()
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

  await page.locator('#start').click()
  await page.evaluate(() => window.__TINY_TD__.setTimeScale(8))
  const after = await waitUntil(
    page,
    'wave 1',
    (state) => state.phase === 'breather' || state.phase === 'defeat' || state.phase === 'victory',
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

  await page.evaluate(() => {
    const api = window.__TINY_TD__
    api.retry()
    api.setTimeScale(14)
    api.buy(2, 7, 'base')
    api.buy(2, 7, 'turret')
    api.buy(2, 7, 'middle-a')
    api.startWave()
  })
  const underbuiltStart = Date.now()
  let underbuilt = null
  while (Date.now() - underbuiltStart < 150000) {
    underbuilt = await stateOf(page)
    if (underbuilt?.phase === 'victory' || underbuilt?.phase === 'defeat') break
    if (underbuilt?.phase === 'breather') await page.evaluate(() => window.__TINY_TD__.startWave())
    await delay(200)
  }
  console.log('one tower', JSON.stringify(underbuilt))
  if (underbuilt?.phase !== 'defeat' || underbuilt.wave > 5) {
    throw new Error(`a single tower should lose early: ${JSON.stringify(underbuilt)}`)
  }

  const spamPlan = [
    [2, 7, 'base'],
    [2, 7, 'turret'],
    [2, 7, 'middle-a'],
    [3, 7, 'base'],
    [3, 7, 'turret'],
    [3, 7, 'middle-a'],
    [5, 7, 'base'],
    [5, 7, 'turret'],
    [5, 7, 'middle-a'],
    [3, 4, 'base'],
    [3, 4, 'turret'],
    [3, 4, 'middle-a'],
    [4, 2, 'base'],
    [4, 2, 'turret'],
    [4, 2, 'middle-a'],
    [2, 7, 'middle-a'],
    [3, 7, 'middle-a'],
    [5, 7, 'middle-a'],
    [3, 4, 'middle-a'],
    [4, 2, 'middle-a'],
    [2, 7, 'upgrade'],
    [3, 7, 'upgrade'],
    [5, 7, 'upgrade'],
    [3, 4, 'upgrade'],
    [4, 2, 'upgrade'],
  ]
  await page.evaluate(() => {
    window.__spamCursor = 0
    window.__TINY_TD__.retry()
    window.__TINY_TD__.setTimeScale(12)
    window.__TINY_TD__.startWave()
  })
  const spamStart = Date.now()
  let spam = null
  while (Date.now() - spamStart < 180000) {
    await page.evaluate((steps) => {
      const api = window.__TINY_TD__
      let cursor = window.__spamCursor ?? 0
      for (let n = 0; n < 6 && cursor < steps.length; n++) {
        const [x, z, part] = steps[cursor]
        if (!api.buy(x, z, part)) break
        cursor += 1
      }
      window.__spamCursor = cursor
    }, spamPlan)
    spam = await stateOf(page)
    if (spam?.phase === 'victory' || spam?.phase === 'defeat') break
    if (spam?.phase === 'breather' || spam?.phase === 'ready') await page.evaluate(() => window.__TINY_TD__.startWave())
    await delay(150)
  }
  console.log('turret spam', JSON.stringify({ ...spam, log: undefined }))
  if (spam?.log?.length) {
    console.log('spam balance')
    for (const row of spam.log) {
      console.log(
        `${row.wave} | ${row.gold} | ${row.kills} | ${row.leaks} | ${row.pets} | ${row.rescues} | ${row.abductions} | ${row.gate}`,
      )
    }
  }
  if (!spam || (spam.phase !== 'victory' && spam.phase !== 'defeat')) {
    throw new Error(`turret spam did not finish: ${JSON.stringify(spam)}`)
  }
  if ((spam.towers ?? 0) < 3) throw new Error(`turret spam did not build: ${JSON.stringify(spam)}`)
  if (spam.phase === 'victory' && spam.pets >= 5 && spam.leaks === 0) {
    throw new Error(`turret spam should lose pets or the run: ${JSON.stringify(spam)}`)
  }

  await page.evaluate(() => {
    window.__planCursor = 0
    window.__TINY_TD__.retry()
    window.__TINY_TD__.setTimeScale(12)
  })
  const plan = [
    [2, 7, 'base'],
    [2, 7, 'turret'],
    [2, 7, 'middle-a'],
    [3, 7, 'base'],
    [3, 7, 'ballista'],
    [3, 7, 'middle-c'],
    [5, 7, 'base'],
    [5, 7, 'cannon'],
    [5, 7, 'roof-b'],
    [2, 7, 'middle-c'],
    [2, 7, 'roof-b'],
    [3, 4, 'base'],
    [3, 4, 'turret'],
    [3, 4, 'middle-a'],
    [4, 2, 'base'],
    [4, 2, 'catapult'],
    [4, 2, 'middle-c'],
    [4, 2, 'roof-a'],
    [3, 7, 'roof-c'],
    [5, 7, 'middle-a'],
    [3, 4, 'middle-c'],
    [2, 7, 'middle-b'],
    [3, 7, 'middle-a'],
    [3, 7, 'middle-b'],
    [5, 7, 'middle-c'],
    [3, 4, 'middle-b'],
    [3, 4, 'roof-a'],
    [4, 2, 'middle-a'],
    [4, 2, 'middle-b'],
    [5, 7, 'middle-b'],
    [2, 7, 'upgrade'],
    [3, 7, 'upgrade'],
    [5, 7, 'upgrade'],
    [3, 4, 'upgrade'],
    [4, 2, 'upgrade'],
    [3, 7, 'upgrade'],
    [3, 4, 'upgrade'],
    [2, 7, 'upgrade'],
    [5, 7, 'upgrade'],
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
  if (finalState.gold > 150) throw new Error(`mixed defense hoarded gold: ${JSON.stringify(finalState)}`)
  }

  function planFromPads(pads) {
    const [a, b, c, d, e] = pads
    const step = (pad, part) => [pad[0], pad[1], part]
    return [
      step(a, 'base'),
      step(a, 'turret'),
      step(a, 'middle-a'),
      step(b, 'base'),
      step(b, 'ballista'),
      step(b, 'middle-c'),
      step(c, 'base'),
      step(c, 'cannon'),
      step(c, 'roof-b'),
      step(a, 'middle-c'),
      step(a, 'roof-b'),
      step(d, 'base'),
      step(d, 'turret'),
      step(d, 'middle-a'),
      step(e, 'base'),
      step(e, 'catapult'),
      step(e, 'middle-c'),
      step(e, 'roof-a'),
      step(b, 'roof-c'),
      step(c, 'middle-a'),
      step(d, 'middle-c'),
      step(a, 'middle-b'),
      step(b, 'middle-a'),
      step(b, 'middle-b'),
      step(c, 'middle-c'),
      step(d, 'middle-b'),
      step(d, 'roof-a'),
      step(e, 'middle-a'),
      step(e, 'middle-b'),
      step(c, 'middle-b'),
      step(a, 'upgrade'),
      step(b, 'upgrade'),
      step(c, 'upgrade'),
      step(d, 'upgrade'),
      step(e, 'upgrade'),
      step(b, 'upgrade'),
      step(d, 'upgrade'),
      step(a, 'upgrade'),
      step(c, 'upgrade'),
      step(e, 'upgrade'),
    ]
  }

  async function finishLevel(levelId) {
    await page.evaluate((id) => {
      const api = window.__TINY_TD__
      api.startLevel(id)
      api.setTimeScale(14)
      const hint = api.getState().hint
      api.buy(hint.x, hint.z, 'base')
      api.buy(hint.x, hint.z, 'turret')
      api.buy(hint.x, hint.z, 'middle-a')
      api.startWave()
    }, levelId)
    const oneStart = Date.now()
    let one = null
    while (Date.now() - oneStart < 120000) {
      one = await stateOf(page)
      if (one?.error) throw new Error(one.error)
      if (one?.phase === 'victory' || one?.phase === 'defeat') break
      if (one?.phase === 'breather' || one?.phase === 'ready') {
        await page.evaluate(() => window.__TINY_TD__.startWave())
      }
      await delay(150)
    }
    console.log(`level ${levelId} one tower`, JSON.stringify({ ...one, log: undefined }))
    if (!one || one.phase !== 'defeat') {
      throw new Error(`level ${levelId} one tower should lose: ${JSON.stringify(one)}`)
    }

    const pads = one.pads
    const plan = planFromPads(pads)
    await page.evaluate(() => {
      window.__planCursor = 0
      window.__TINY_TD__.retry()
      window.__TINY_TD__.setTimeScale(12)
    })
    const buyNext = () =>
      page.evaluate((steps) => {
        const api = window.__TINY_TD__
        const cursor = window.__planCursor ?? 0
        const step = steps[cursor]
        if (!step) return cursor
        const [x, z, part] = step
        if (api.buy(x, z, part)) window.__planCursor = cursor + 1
        return window.__planCursor
      }, plan)
    const started = Date.now()
    let done = null
    while (Date.now() - started < 150000) {
      let bought = false
      for (let n = 0; n < 8; n++) {
        const before = await page.evaluate(() => window.__planCursor ?? 0)
        const after = await buyNext()
        if (after === before) break
        bought = true
      }
      done = await stateOf(page)
      if (done?.error) throw new Error(done.error)
      if (done?.phase === 'victory' || done?.phase === 'defeat') break
      const cursor = await page.evaluate(() => window.__planCursor ?? 0)
      if (cursor >= plan.length) {
        await page.evaluate((spots) => {
          for (const [x, z] of spots) window.__TINY_TD__.buy(x, z, 'upgrade')
        }, pads)
      }
      if (!bought && (done?.phase === 'ready' || done?.phase === 'breather')) {
        await page.evaluate(() => window.__TINY_TD__.startWave())
      }
      await delay(150)
    }
    console.log(`level ${levelId} mixed`, JSON.stringify({ ...done, log: undefined }))
    if (done?.log) {
      console.log(`balance level ${levelId}`)
      console.log('wave | gold | kills | leaks | pets | rescues | abductions | gate | came')
      for (const row of done.log) {
        console.log(
          `${row.wave} | ${row.gold} | ${row.kills} | ${row.leaks} | ${row.pets} | ${row.rescues} | ${row.abductions} | ${row.gate} | ${row.came}`,
        )
      }
    }
    if (!done || done.phase !== 'victory') {
      throw new Error(`level ${levelId} mixed defense lost: ${JSON.stringify(done)}`)
    }
    if (done.abductions < 1 || done.rescues < 1) {
      throw new Error(`level ${levelId} mixed defense skipped rescue: ${JSON.stringify(done)}`)
    }
    if (done.gold > 180) throw new Error(`level ${levelId} mixed defense hoarded gold: ${JSON.stringify(done)}`)
    const closest = Math.min(done.gate ?? 99, ...(done.log ?? []).map((row) => row.gate ?? 99))
    console.log(`level ${levelId} closest gate`, closest)
    if (levelId === 2) {
      if (done.leaks !== 0 || done.pets < 5) {
        throw new Error(`level 2 should hold every pet under pressure: ${JSON.stringify(done)}`)
      }
      const near = (done.log ?? []).filter((row) => row.gate > 0.15 && row.gate < 2.35)
      if (near.length < 2) {
        throw new Error(`level 2 needs two waves within about 2 of the gate: ${JSON.stringify(done.log)}`)
      }
    }
    if (levelId === 3) {
      if (done.stars < 2 || done.stars > 3 || done.pets < 3 || done.pets > 4) {
        throw new Error(`level 3 should finish on 2 or 3 stars after losing a pet: ${JSON.stringify(done)}`)
      }
    }
  }

  await finishLevel(2)
  await finishLevel(3)

  if (errors.length) throw new Error(errors.join('\n'))
  console.log('glCopySubTexture warnings', glCopies)
  console.log('playthrough ok')
} catch (error) {
  code = 1
  console.error(error)
} finally {
  if (browser) await browser.close()
  if (server) await server.close()
}
process.exit(code)
