import { execFileSync, spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
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

function stateOf(page) {
  return page.evaluate(() => window.__TINY_TD__?.getState())
}

async function overflowReport(page) {
  return page.evaluate(() => {
    const offenders = []
    const nodes = document.querySelectorAll('#tray span, #preview span, #banner-chips span, #card-stats, #start, #count, #wave span')
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue
      const style = getComputedStyle(node)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      if (node.scrollWidth > node.clientWidth + 1) {
        offenders.push({
          text: node.textContent?.replace(/\s+/g, ' ').slice(0, 40) ?? '',
          w: node.clientWidth,
          sw: node.scrollWidth,
        })
      }
    }
    return offenders
  })
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

async function reportBoard(page, label, opts = {}) {
  const board = await page.evaluate(() => {
    const state = window.__TINY_TD__.getState()
    return {
      width: state.board.width,
      height: state.board.height,
      zoom: state.zoom,
      level: state.level,
      tier: state.tier,
      w: window.innerWidth,
      h: window.innerHeight,
    }
  })
  console.log(`board ${label}`, JSON.stringify(board))
  if (opts.minWidth != null && board.width < opts.minWidth) {
    throw new Error(`${label} playable width ${board.width} is under ${opts.minWidth}`)
  }
  if (opts.minHeight != null && board.height < opts.minHeight) {
    throw new Error(`${label} playable height ${board.height} is under ${opts.minHeight}`)
  }
  return board
}

async function assertCoach(page, label) {
  const coach = await page.evaluate(() => {
    const bubble = document.querySelector('#coach')
    const card = document.querySelector('#card')
    if (!(bubble instanceof HTMLElement) || bubble.hidden) return null
    const box = bubble.getBoundingClientRect()
    const panel = card instanceof HTMLElement && !card.hidden ? card.getBoundingClientRect() : null
    return {
      side: bubble.dataset.side ?? '',
      top: box.top,
      bottom: box.bottom,
      left: box.left,
      right: box.right,
      cardTop: panel ? panel.top : null,
      w: window.innerWidth,
      h: window.innerHeight,
    }
  })
  console.log('coach', label, JSON.stringify(coach))
  if (!coach || coach.top < -1 || coach.left < -1 || coach.right > coach.w + 1 || coach.bottom > coach.h + 1) {
    throw new Error(`${label} bubble is off screen: ${JSON.stringify(coach)}`)
  }
  if (label.includes('step 2')) {
    if (coach.side !== 'down') throw new Error(`${label} should point down at the weapons: ${coach.side}`)
    if (coach.cardTop != null && coach.bottom > coach.cardTop + 8) {
      throw new Error(`${label} bubble covers the weapon row: ${JSON.stringify(coach)}`)
    }
  }
  return coach
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
    deviceScaleFactor: 1,
  })
  page.on('pageerror', (error) => {
    console.error('pageerror', error.message)
  })
  await page.goto(URL, { waitUntil: 'networkidle' })
  const served = await page.content()
  if (!served.includes(bundle)) throw new Error(`preview is not serving ${bundle}`)
  await page.waitForFunction(() => window.__TINY_TD__?.ready && !window.__TINY_TD__.error)
  await page.evaluate(() => window.__TINY_TD__.debugSettings())
  await page.locator('[data-quality="high"]').click()
  await page.locator('#sheet-close').click()
  await delay(200)

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
  const portraitBoard = await reportBoard(page, '390 level 1', { minWidth: 0.9 })
  const portraitZoom = portraitBoard.zoom
  const chrome = await page.evaluate(() => {
    const top = document.querySelector('#top')?.getBoundingClientRect().bottom ?? 64
    const bar = document.querySelector('#actions')?.getBoundingClientRect().top ?? window.innerHeight - 64
    return { top, bar, w: window.innerWidth }
  })
  for (const [name, point] of Object.entries(portraitFrame)) {
    if (!point || point.x < 2 || point.x > chrome.w - 2 || point.y < chrome.top - 2 || point.y > chrome.bar + 2) {
      throw new Error(`portrait framing missed ${name}: ${JSON.stringify(point)} chrome ${JSON.stringify(chrome)}`)
    }
  }
  await page.screenshot({ path: `${OUT}/portrait_gameplay.png` })
  await page.screenshot({ path: `${OUT}/level1_390.png` })
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
  const overflow320 = await overflowReport(page)
  if (overflow320.length) throw new Error(`label overflow at 320: ${JSON.stringify(overflow320)}`)
  await page.screenshot({ path: `${OUT}/build_panel_320.png` })
  const labelClip320 = await clipTray(page)
  if (labelClip320.width < 8) throw new Error(`shop labels missing at 320: ${JSON.stringify(boxes320)}`)
  await page.screenshot({ path: `${OUT}/shop_labels_320.png`, clip: labelClip320 })
  await page.setViewportSize({ width: 320, height: 780 })
  await page.evaluate(() => {
    window.__TINY_TD__.retry()
    window.__TINY_TD__.debugPreview()
    window.__TINY_TD__.deselect()
  })
  await delay(200)
  const preview320 = await page.locator('#preview').innerText()
  if (!preview320.includes('Turret/Frost')) throw new Error(`preview missing chip at 320: ${preview320}`)
  if (preview320.includes('\n') && /,\s*$/m.test(preview320)) {
    throw new Error(`preview wrapped mid-phrase at 320: ${preview320}`)
  }
  const hud320 = await page.evaluate(() => {
    const tops = ['#gold', '#wave', '#pets', '#mute'].map((sel) => {
      const rect = document.querySelector(sel)?.getBoundingClientRect()
      return rect ? Math.round(rect.top) : null
    })
    const wave = document.querySelector('#wave span')?.textContent ?? ''
    const start = document.querySelector('#start')?.textContent ?? ''
    const count = document.querySelector('#count')?.textContent ?? ''
    const actions = document.querySelector('#actions')?.getBoundingClientRect()
    return { tops, wave, start, count, actionsBottom: actions ? Math.round(actions.bottom) : null, height: window.innerHeight }
  })
  console.log('hud320', JSON.stringify(hud320))
  if (hud320.tops.some((top) => top == null || Math.abs(top - hud320.tops[0]) > 6)) {
    throw new Error(`HUD wrapped at 320: ${JSON.stringify(hud320)}`)
  }
  if (hud320.wave.includes('s') || hud320.wave.toLowerCase().includes('clear')) {
    throw new Error(`wave pill is not fixed: ${hud320.wave}`)
  }
  if (!/^\d+s$/.test(hud320.count)) throw new Error(`countdown missing: ${hud320.count}`)
  if (hud320.start.includes('s')) throw new Error(`call button still shows the timer: ${hud320.start}`)
  if (hud320.actionsBottom == null || hud320.actionsBottom > hud320.height) {
    throw new Error(`actions offscreen at 320: ${JSON.stringify(hud320)}`)
  }
  const previewOverflow = await overflowReport(page)
  if (previewOverflow.length) throw new Error(`preview overflow at 320: ${JSON.stringify(previewOverflow)}`)
  await page.screenshot({ path: `${OUT}/preview_320.png` })
  await page.screenshot({ path: `${OUT}/hud_countdown_320.png` })

  await page.setViewportSize({ width: 320, height: 568 })
  await delay(200)
  await page.evaluate(() => {
    const api = window.__TINY_TD__
    api.retry()
    api.setTimeScale(0)
    api.setGold(400)
    api.buy(2, 7, 'base')
    api.buy(2, 7, 'turret')
    api.select(2, 7)
  })
  await delay(250)
  const fit568 = await page.evaluate(() => {
    const actions = document.querySelector('#actions')?.getBoundingClientRect()
    const card = document.querySelector('#card')?.getBoundingClientRect()
    const buttons = [...document.querySelectorAll('#tray button')].map((button) => {
      const rect = button.getBoundingClientRect()
      return { id: button.dataset.part, b: Math.round(rect.bottom), t: Math.round(rect.top) }
    })
    return {
      height: window.innerHeight,
      actionsBottom: actions ? Math.round(actions.bottom) : null,
      cardBottom: card ? Math.round(card.bottom) : null,
      fade: document.querySelector('#card')?.classList.contains('fade') ?? false,
      buttons,
    }
  })
  console.log('fit568', JSON.stringify(fit568))
  if (fit568.actionsBottom == null || fit568.actionsBottom > fit568.height + 1) {
    throw new Error(`build panel hides the call button at 320x568: ${JSON.stringify(fit568)}`)
  }
  const overflow568 = await overflowReport(page)
  if (overflow568.length) throw new Error(`label overflow at 320x568: ${JSON.stringify(overflow568)}`)
  await page.screenshot({ path: `${OUT}/build_panel_320x568.png` })

  await page.setViewportSize({ width: 390, height: 844 })
  await delay(200)
  await page.evaluate(() => {
    window.__TINY_TD__.retry()
    window.__TINY_TD__.debugPreview()
    window.__TINY_TD__.deselect()
  })
  await delay(200)
  const previewText = await page.locator('#preview').innerText()
  if (!previewText.includes('Turret/Frost')) throw new Error(`preview missing chip: ${previewText}`)
  await page.screenshot({ path: `${OUT}/preview_weak.png` })

  await page.evaluate(() => {
    const api = window.__TINY_TD__
    api.retry()
    api.debugPop()
    api.deselect()
    api.setTimeScale(0)
  })
  await delay(250)
  await page.screenshot({ path: `${OUT}/portrait_matchup.png` })

  await page.evaluate(() => {
    const api = window.__TINY_TD__
    api.retry()
    api.setTimeScale(1)
    api.debugAbduct()
  })
  await delay(420)
  await page.evaluate(() => window.__TINY_TD__.setTimeScale(0))
  const carryState = await stateOf(page)
  console.log('carry', JSON.stringify(carryState))
  if (!carryState?.carries) throw new Error('abduction did not start')
  await page.screenshot({ path: `${OUT}/pet_carry.png` })
  await page.screenshot({ path: `${OUT}/pet_abduction.png` })
  await page.evaluate(() => {
    window.__TINY_TD__.setTimeScale(1)
    window.__TINY_TD__.debugRescue()
  })
  await delay(220)
  await page.evaluate(() => window.__TINY_TD__.setTimeScale(0))
  await page.screenshot({ path: `${OUT}/pet_rescue.png` })

  await page.evaluate(() => {
    const api = window.__TINY_TD__
    api.retry()
    api.setTimeScale(0)
    api.setGold(400)
    api.buy(2, 7, 'base')
    api.buy(2, 7, 'turret')
    api.buy(2, 7, 'upgrade')
    api.select(2, 7)
  })
  await delay(300)
  const upgrade = await page.evaluate(() => {
    const stats = document.querySelector('#card-stats')?.textContent ?? ''
    const upgradeBtn = document.querySelector('[data-part="upgrade"] img.thumb')
    const actions = document.querySelector('#actions')?.getBoundingClientRect()
    const preview = document.querySelector('#preview')?.getBoundingClientRect()
    const card = document.querySelector('#card')?.getBoundingClientRect()
    return {
      stats,
      thumb: upgradeBtn instanceof HTMLImageElement ? upgradeBtn.src : '',
      actionsTop: actions ? Math.round(actions.top) : null,
      cardBottom: card ? Math.round(card.bottom) : null,
      previewBottom: preview && preview.height > 2 ? Math.round(preview.bottom) : null,
      height: window.innerHeight,
    }
  })
  console.log('upgrade', JSON.stringify(upgrade))
  if (!upgrade.stats.includes('●') || /tier/i.test(upgrade.stats)) {
    throw new Error(`tier pips missing: ${upgrade.stats}`)
  }
  if (!upgrade.thumb.includes('star')) throw new Error(`upgrade thumb is not a star: ${upgrade.thumb}`)
  if (upgrade.actionsTop == null || upgrade.cardBottom == null || upgrade.cardBottom > upgrade.actionsTop + 2) {
    throw new Error(`upgrade card covers the call button: ${JSON.stringify(upgrade)}`)
  }
  await page.screenshot({ path: `${OUT}/upgrade_ui.png` })

  await page.evaluate(() => {
    const api = window.__TINY_TD__
    api.retry()
    api.setTimeScale(0)
    api.debugBoss()
    api.deselect()
  })
  await delay(250)
  const banner = await page.evaluate(() => {
    const node = document.querySelector('#banner')
    const rect = node?.getBoundingClientRect()
    const title = document.querySelector('#banner-title')?.textContent ?? ''
    const chips = document.querySelectorAll('#banner-chips .bchip').length
    return {
      hidden: node instanceof HTMLElement ? node.hidden : true,
      title,
      chips,
      top: rect ? Math.round(rect.top) : null,
      height: rect ? Math.round(rect.height) : null,
      bottom: rect ? Math.round(rect.bottom) : null,
    }
  })
  console.log('banner', JSON.stringify(banner))
  if (banner.hidden || banner.title !== 'Boss wave' || banner.chips < 3) {
    throw new Error(`boss banner missing chips: ${JSON.stringify(banner)}`)
  }
  if (banner.bottom == null || banner.bottom > 220 || (banner.height ?? 999) > 150) {
    throw new Error(`boss banner still covers the board: ${JSON.stringify(banner)}`)
  }
  await page.screenshot({ path: `${OUT}/boss_wave.png` })

  await page.evaluate(() => window.__TINY_TD__.debugWin())
  await delay(250)
  const win = await page.evaluate(() => {
    const banner = document.querySelector('#banner')
    const icon = document.querySelector('#end-icon')
    return {
      bannerHidden: banner instanceof HTMLElement ? banner.hidden : true,
      popups: document.querySelectorAll('.fly-coin').length,
      icon: icon instanceof HTMLImageElement ? icon.src.slice(0, 32) : '',
    }
  })
  console.log('win', JSON.stringify(win))
  if (!win.bannerHidden) throw new Error('boss banner stayed up behind the win card')
  if (!win.icon.startsWith('data:')) throw new Error(`win heart is still a flat icon: ${win.icon}`)
  await page.screenshot({ path: `${OUT}/win_screen.png` })
  await page.screenshot({ path: `${OUT}/win_stars.png` })

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
    const api = window.__TINY_TD__
    api.retry()
    api.debugPop()
    api.deselect()
    api.setTimeScale(0)
  })
  await delay(300)
  const desktop = await stateOf(page)
  console.log('desktop zoom', desktop?.zoom, 'portrait zoom', portraitZoom)
  await reportBoard(page, 'desktop level 1', { minHeight: 0.72 })
  await page.screenshot({ path: `${OUT}/desktop_1280x800.png` })
  await page.screenshot({ path: `${OUT}/desktop_midwave.png` })
  await page.screenshot({ path: `${OUT}/desktop_level1.png` })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.__TINY_TD__.debugTitle())
  await delay(700)
  await page.screenshot({ path: `${OUT}/title_portrait.png` })
  await page.evaluate(() => {
    localStorage.setItem('tiny-td-stars', JSON.stringify({ 1: 3, 2: 2 }))
    window.__TINY_TD__.debugTitle()
  })
  await delay(400)
  await page.screenshot({ path: `${OUT}/level_select.png` })

  await page.evaluate(() => {
    const api = window.__TINY_TD__
    api.startLevel(1)
    api.debugCoach(1)
  })
  await delay(300)
  await page.screenshot({ path: `${OUT}/tutorial_1.png` })
  await page.screenshot({ path: `${OUT}/tutorial_hint.png` })
  await page.evaluate(() => {
    const api = window.__TINY_TD__
    const hint = api.getState().hint
    api.buy(hint.x, hint.z, 'base')
    api.debugCoach(2)
  })
  await delay(250)
  await page.screenshot({ path: `${OUT}/tutorial_2.png` })
  await page.screenshot({ path: `${OUT}/tut_390_step2.png` })
  await assertCoach(page, '390 step 2')
  await page.evaluate(() => window.__TINY_TD__.debugCoach(3))
  await delay(200)
  await page.screenshot({ path: `${OUT}/tutorial_3.png` })
  await page.evaluate(() => window.__TINY_TD__.debugCoach(4))
  await delay(200)
  await page.screenshot({ path: `${OUT}/tutorial_4.png` })
  await page.screenshot({ path: `${OUT}/tut_390_step4.png` })
  await assertCoach(page, '390 step 4')
  await page.evaluate(() => window.__TINY_TD__.debugCoach(5))
  await delay(200)
  await page.screenshot({ path: `${OUT}/tutorial_5.png` })

  await page.evaluate(() => {
    const api = window.__TINY_TD__
    api.startLevel(2)
    const pads = api.getState().pads
    api.buy(pads[0][0], pads[0][1], 'base')
    api.buy(pads[0][0], pads[0][1], 'turret')
    api.buy(pads[1][0], pads[1][1], 'base')
    api.buy(pads[1][0], pads[1][1], 'ballista')
    api.startWave()
    api.deselect()
  })
  await delay(1200)
  await page.evaluate(() => window.__TINY_TD__.setTimeScale(0))
  await delay(200)
  await page.screenshot({ path: `${OUT}/level2_midwave.png` })
  await page.screenshot({ path: `${OUT}/level2_390.png` })
  await reportBoard(page, '390 level 2', { minWidth: 0.9 })

  await page.evaluate(() => window.__TINY_TD__.debugSettings())
  await page.locator('[data-quality="high"]').click()
  await page.locator('#sheet-close').click()
  await page.evaluate(() => {
    const api = window.__TINY_TD__
    api.startLevel(3)
    const pads = api.getState().pads
    api.buy(pads[0][0], pads[0][1], 'base')
    api.buy(pads[0][0], pads[0][1], 'turret')
    api.buy(pads[1][0], pads[1][1], 'base')
    api.buy(pads[1][0], pads[1][1], 'cannon')
    api.startWave()
    api.deselect()
  })
  await delay(1200)
  await page.evaluate(() => window.__TINY_TD__.setTimeScale(0))
  await delay(200)
  await page.screenshot({ path: `${OUT}/level3_snow.png` })
  await page.screenshot({ path: `${OUT}/level3_390.png` })
  await reportBoard(page, '390 level 3', { minWidth: 0.9 })

  await page.evaluate(() => window.__TINY_TD__.debugSettings())
  await delay(200)
  await page.screenshot({ path: `${OUT}/settings.png` })
  const settingsFit = await page.evaluate(() => {
    const close = document.querySelector('#sheet-close')
    if (!close) return null
    const box = close.getBoundingClientRect()
    return { top: box.top, bottom: box.bottom, height: window.innerHeight }
  })
  if (!settingsFit || settingsFit.bottom > settingsFit.height - 4 || settingsFit.top < 0) {
    throw new Error(`settings close is clipped: ${JSON.stringify(settingsFit)}`)
  }

  await page.locator('#sheet-close').click()
  await page.evaluate(() => {
    const api = window.__TINY_TD__
    api.startLevel(1)
    api.debugWin()
  })
  await delay(250)
  const nextBox = await page.locator('#next').boundingBox()
  if (!nextBox || nextBox.width < 40) throw new Error('win card is missing Next')
  await page.screenshot({ path: `${OUT}/win_next.png` })

  await page.evaluate(() => window.__TINY_TD__.debugLose())
  await delay(200)
  const loseCopy = await page.evaluate(() => ({
    next: document.querySelector('#next')?.hidden ?? true,
    levels: document.querySelector('#to-levels')?.textContent ?? '',
    levelsHidden: document.querySelector('#to-levels')?.hidden ?? true,
  }))
  if (!loseCopy.next || loseCopy.levelsHidden || !/levels/i.test(loseCopy.levels)) {
    throw new Error(`lose card should offer Levels: ${JSON.stringify(loseCopy)}`)
  }
  await page.screenshot({ path: `${OUT}/lose_card.png` })

  await page.setViewportSize({ width: 320, height: 568 })
  await page.evaluate(() => {
    const api = window.__TINY_TD__
    api.retry()
    api.buy(2, 7, 'base')
    api.buy(2, 7, 'turret')
    api.startWave()
    api.deselect()
    api.setTimeScale(0)
  })
  await delay(400)
  const hudRow = await page.evaluate(() => {
    const top = document.querySelector('#top')
    return top ? top.getBoundingClientRect().height : 0
  })
  if (hudRow > 56) throw new Error(`HUD wrapped at 320x568: ${hudRow}`)
  await reportBoard(page, '320 level 1', { minWidth: 0.9 })
  await page.screenshot({ path: `${OUT}/gameplay_320x568.png` })
  await page.screenshot({ path: `${OUT}/level1_320.png` })
  for (const id of [2, 3]) {
    await page.evaluate((level) => window.__TINY_TD__.startLevel(level), id)
    await delay(200)
    await reportBoard(page, `320 level ${id}`, { minWidth: 0.9 })
  }
  await page.evaluate(() => {
    const api = window.__TINY_TD__
    api.startLevel(1)
    api.setTimeScale(0)
    const hint = api.getState().hint
    api.buy(hint.x, hint.z, 'base')
    api.debugCoach(2)
  })
  await delay(300)
  await assertCoach(page, '320 step 2')
  await page.screenshot({ path: `${OUT}/tut_320_step2.png` })
  await page.evaluate(() => {
    const api = window.__TINY_TD__
    const hint = api.getState().hint
    api.buy(hint.x, hint.z, 'turret')
  })
  await delay(200)
  const closed = await page.evaluate(() => ({
    card: document.querySelector('#card') instanceof HTMLElement ? document.querySelector('#card').hidden : true,
    tutor: window.__TINY_TD__.getState().tutor,
  }))
  if (!closed.card || closed.tutor <= 2) {
    throw new Error(`tutorial weapon buy should close the panel: ${JSON.stringify(closed)}`)
  }
  await page.evaluate(() => window.__TINY_TD__.debugCoach(4))
  await delay(200)
  await assertCoach(page, '320 step 4')
  await page.screenshot({ path: `${OUT}/tut_320_step4.png` })
  await page.evaluate(() => window.__TINY_TD__.debugSettings())
  await delay(200)
  const settingsSmall = await page.evaluate(() => {
    const close = document.querySelector('#sheet-close')
    if (!close) return null
    const box = close.getBoundingClientRect()
    return { top: box.top, bottom: box.bottom, height: window.innerHeight, width: window.innerWidth }
  })
  if (!settingsSmall || settingsSmall.bottom > settingsSmall.height - 2) {
    throw new Error(`settings clipped at 320x568: ${JSON.stringify(settingsSmall)}`)
  }
  await page.screenshot({ path: `${OUT}/settings_320x568.png` })

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.locator('#sheet-close').click()
  await page.evaluate(() => window.__TINY_TD__.debugTitle())
  await delay(600)
  await page.screenshot({ path: `${OUT}/desktop_title.png` })
  await page.evaluate(() => {
    const api = window.__TINY_TD__
    api.startLevel(3)
    const pads = api.getState().pads
    api.buy(pads[0][0], pads[0][1], 'base')
    api.buy(pads[0][0], pads[0][1], 'turret')
    api.buy(pads[2][0], pads[2][1], 'base')
    api.buy(pads[2][0], pads[2][1], 'ballista')
    api.startWave()
    api.deselect()
    api.setTimeScale(0)
  })
  await delay(500)
  await page.screenshot({ path: `${OUT}/desktop_level3.png` })

  const iconUrl = await page.evaluate(() => window.__TINY_TD__.iconUrl())
  if (iconUrl?.startsWith('data:image/png')) {
    const buf = Buffer.from(iconUrl.split(',')[1], 'base64')
    writeFileSync('public/icons/icon-512.png', buf)
    writeFileSync('public/icons/apple-touch-icon.png', buf)
    writeFileSync('/tmp/ttd-icon-512.png', buf)
    execFileSync('python3', [
      '-c',
      'from PIL import Image; Image.open("public/icons/icon-512.png").resize((192,192), Image.Resampling.LANCZOS).save("public/icons/icon-192.png")',
    ])
  }

  await browser.close()
  console.log('screenshots written to', OUT)
} finally {
  stopPreview()
}
