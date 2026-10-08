import type * as THREE from 'three'

export interface PerfSnapshot {
  fps: number
  p95: number
  worst: number
  steps: number
  draws: number
  triangles: number
  geometries: number
  textures: number
  programs: number
  popupsPerSec: number
  soundsPerSec: number
  uploadsPerSec: number
  tier: string
  dpr: number
  canvas: string
  resizes: number
  compiles: number
  playResizes: number
  playCompiles: number
  playUploads: number
  tierChanges: number
  log: string[]
}

type TierName = 'low' | 'mid' | 'high'

/**
 * Phone overlay (?perf=1 or ?debug=1). Counts the things that made combat hitch:
 * canvas resizes, shader compiles, and texture uploads.
 */
class PerfMonitor {
  enabled = false
  playing = false
  resizes = 0
  compiles = 0
  playResizes = 0
  playCompiles = 0
  uploads = 0
  playUploads = 0
  popups = 0
  sounds = 0
  steps = 0
  tierChanges = 0
  tier: TierName | string = 'high'
  readonly log: string[] = []
  private frames: number[] = []
  private popupTimes: number[] = []
  private soundTimes: number[] = []
  private uploadTimes: number[] = []
  private hooked = false
  private root: HTMLElement | null = null
  private graph: HTMLCanvasElement | null = null
  private readEl: HTMLElement | null = null
  private logEl: HTMLElement | null = null
  private lastDraw = 0
  onToggle: ((key: 'damage' | 'sound' | 'shadows' | 'tier', value: string | boolean) => void) | null = null

  attach(renderer: THREE.WebGLRenderer): void {
    const params = new URLSearchParams(location.search)
    this.enabled = params.has('perf') || params.has('debug')
    if (this.hooked) return
    this.hooked = true
    const gl = renderer.getContext()
    const compile = gl.compileShader.bind(gl)
    gl.compileShader = (shader: WebGLShader) => {
      this.noteCompile()
      return compile(shader)
    }
    const image = gl.texImage2D.bind(gl)
    const sub = gl.texSubImage2D.bind(gl)
    gl.texImage2D = ((...args: unknown[]) => {
      this.noteUpload()
      return (image as (...inner: unknown[]) => void)(...args)
    }) as typeof gl.texImage2D
    gl.texSubImage2D = ((...args: unknown[]) => {
      this.noteUpload()
      return (sub as (...inner: unknown[]) => void)(...args)
    }) as typeof gl.texSubImage2D
    if (this.enabled) this.mount()
  }

  mount(): void {
    if (this.root) return
    const root = document.createElement('aside')
    root.id = 'perf'
    root.innerHTML = `
      <canvas id="perf-graph" width="220" height="36"></canvas>
      <p id="perf-read"></p>
      <div id="perf-toggles">
        <button type="button" data-perf="damage">Numbers</button>
        <button type="button" data-perf="sound">Sound</button>
        <button type="button" data-perf="shadows">Shadows</button>
        <button type="button" data-perf-tier="low">Low</button>
        <button type="button" data-perf-tier="mid">Mid</button>
        <button type="button" data-perf-tier="high">High</button>
      </div>
      <ol id="perf-log"></ol>
    `
    document.body.append(root)
    this.root = root
    this.graph = root.querySelector('#perf-graph')
    this.readEl = root.querySelector('#perf-read')
    this.logEl = root.querySelector('#perf-log')
    root.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('button')
      if (!(button instanceof HTMLButtonElement)) return
      if (button.dataset.perf) this.onToggle?.(button.dataset.perf as 'damage' | 'sound' | 'shadows', true)
      if (button.dataset.perfTier) this.onToggle?.('tier', button.dataset.perfTier)
    })
  }

  noteResize(detail: string): void {
    this.resizes += 1
    if (this.playing) this.playResizes += 1
    this.push(`resize ${detail}`)
  }

  noteCompile(): void {
    this.compiles += 1
    if (this.playing) this.playCompiles += 1
    if (this.playing) this.push('shader compile')
  }

  noteUpload(): void {
    this.uploads += 1
    const now = performance.now()
    this.uploadTimes.push(now)
    if (this.playing) this.playUploads += 1
  }

  noteTier(detail: string): void {
    this.tierChanges += 1
    this.push(`tier ${detail}`)
  }

  notePopup(): void {
    this.popups += 1
    this.popupTimes.push(performance.now())
  }

  noteSound(): void {
    this.sounds += 1
    this.soundTimes.push(performance.now())
  }

  noteStep(count: number): void {
    this.steps = count
  }

  /** Call once per rendered frame with the raw frame delta in milliseconds. */
  sample(frameMs: number, renderer: THREE.WebGLRenderer, tier: string): void {
    this.tier = tier
    this.frames.push(frameMs)
    if (this.frames.length > 180) this.frames.shift()
    const now = performance.now()
    this.popupTimes = this.popupTimes.filter((t) => now - t < 1000)
    this.soundTimes = this.soundTimes.filter((t) => now - t < 1000)
    this.uploadTimes = this.uploadTimes.filter((t) => now - t < 1000)
    if (!this.enabled || !this.readEl || now - this.lastDraw < 250) return
    this.lastDraw = now
    const snap = this.snapshot(renderer)
    this.readEl.textContent = [
      `${snap.fps.toFixed(0)} fps`,
      `p95 ${snap.p95.toFixed(1)} ms`,
      `worst ${snap.worst.toFixed(1)}`,
      `steps ${snap.steps}`,
      `draws ${snap.draws}`,
      `tris ${snap.triangles}`,
      `geo ${snap.geometries}`,
      `tex ${snap.textures}`,
      `prog ${snap.programs}`,
      `pop ${snap.popupsPerSec}/s`,
      `sfx ${snap.soundsPerSec}/s`,
      `up ${snap.uploadsPerSec}/s`,
      `${snap.tier}`,
      `dpr ${snap.dpr}`,
      snap.canvas,
      `resize ${snap.playResizes}`,
      `compile ${snap.playCompiles}`,
    ].join(' · ')
    this.drawGraph()
    if (this.logEl) {
      this.logEl.textContent = ''
      for (const line of this.log.slice(-6)) {
        const item = document.createElement('li')
        item.textContent = line
        this.logEl.append(item)
      }
    }
  }

  snapshot(renderer: THREE.WebGLRenderer): PerfSnapshot {
    const sorted = [...this.frames].sort((a, b) => a - b)
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0
    const worst = sorted.length ? sorted[sorted.length - 1] : 0
    const avg = this.frames.reduce((sum, ms) => sum + ms, 0) / Math.max(1, this.frames.length)
    const canvas = renderer.domElement
    return {
      fps: avg > 0 ? 1000 / avg : 0,
      p95,
      worst,
      steps: this.steps,
      draws: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      programs: renderer.info.programs?.length ?? 0,
      popupsPerSec: this.popupTimes.length,
      soundsPerSec: this.soundTimes.length,
      uploadsPerSec: this.uploadTimes.length,
      tier: this.tier,
      dpr: renderer.getPixelRatio(),
      canvas: `${canvas.width}×${canvas.height}`,
      resizes: this.resizes,
      compiles: this.compiles,
      playResizes: this.playResizes,
      playCompiles: this.playCompiles,
      playUploads: this.playUploads,
      tierChanges: this.tierChanges,
      log: this.log.slice(-12),
    }
  }

  private drawGraph(): void {
    const canvas = this.graph
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(20, 16, 12, 0.55)'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#ffe08a'
    ctx.beginPath()
    const slice = this.frames.slice(-60)
    slice.forEach((ms, index) => {
      const x = (index / 59) * w
      const y = h - Math.min(h, (ms / 32) * h)
      if (index === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }

  private push(line: string): void {
    this.log.push(line)
    if (this.log.length > 24) this.log.shift()
  }
}

export const perf = new PerfMonitor()
