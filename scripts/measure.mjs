import { preview } from 'vite'
import { chromium } from 'playwright'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PORT = Number(process.env.PORT || 4181)
const server = await preview({ preview: { host: '127.0.0.1', port: PORT, strictPort: true } })
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
})
let code = 0
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
  await page.goto(`http://127.0.0.1:${PORT}/?capture=1`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__TINY_TD__?.ready && !window.__TINY_TD__.error)
  await page.evaluate(() => window.__TINY_TD__.setTimeScale(0))
  await page.waitForTimeout(1500)
  const idle = await page.evaluate(() => window.__TINY_TD__.getState())
  await page.evaluate(() => {
    const api = window.__TINY_TD__
    api.buy(2, 7, 'base')
    api.buy(2, 7, 'turret')
    api.startWave()
    api.setTimeScale(1)
  })
  await page.waitForTimeout(2500)
  const mid = await page.evaluate(() => window.__TINY_TD__.getState())
  const files = readdirSync('dist/assets').map((name) => {
    const size = statSync(join('dist/assets', name)).size
    return { name, size }
  })
  console.log(JSON.stringify({ idle, mid, files }, null, 2))
} catch (error) {
  code = 1
  console.error(error)
} finally {
  await browser.close()
  await server.close()
}
process.exit(code)
