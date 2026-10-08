import * as THREE from 'three'
import { arrowTexture, loadAssets, renderAppIcon, renderPieceThumbnails, spawnModel } from './assets'
import { audio } from './audio'
import {
  BASE_COST,
  BASE_RANGE,
  BREATHER_SECONDS,
  ENEMIES,
  MAX_MIDDLES,
  MAX_TOWERS,
  MAX_UPGRADE,
  MIDDLES,
  PET_COUNT,
  ROOFS,
  SELL_RATIO,
  START_GOLD,
  UPGRADE_COST,
  WEAPONS,
  clearBonus,
  earlyBonus,
  matchup,
  stackCost,
  starCount,
  waveChips,
  wavePreview,
  type WaveChip,
  type EnemyKind,
  type MiddleId,
  type RoofId,
  type WeaponId,
} from './config'
import { Enemy } from './enemies'
import { Fx } from './fx'
import { LEVELS, levelById, type LevelDef } from './levels'
import { buildMap, cellKey, disposeMap, tickDiorama, type BuiltMap, type MapCell } from './map'
import { perf } from './perf'
import { Pet } from './pets'
import { buzz, levelUnlocked, loadSettings, markTutorial, saveSettings, saveStars, starsFor, tutorialSeen, type Settings } from './progress'
import { Tower } from './towers'
import { Hud, type ActionButton, type HandView, type SelectionView } from './ui'

interface Projectile {
  mesh: THREE.Object3D
  pos: THREE.Vector3
  vel: THREE.Vector3
  gravity: number
  age: number
  life: number
  damage: number
  splash: number
  slow: number
  shieldMul: number
  pierce: number
  weapon: WeaponId | null
  roof: RoofId | null
  splashHit: boolean
  homing: boolean
  speed: number
  target: Enemy | null
  hit: Set<number>
  alive: boolean
}

interface Carry {
  enemy: Enemy
  pet: Pet
  phase: 'beam' | 'flee'
  time: number
  beam: THREE.Object3D
  burst: THREE.Object3D
  glow: THREE.Mesh
  icon: THREE.Sprite
  spark: number
}

interface WaveRow {
  wave: number
  gold: number
  kills: number
  leaks: number
  pets: number
  rescues: number
  abductions: number
  came: string
  gate: number
}

type Phase = 'title' | 'ready' | 'wave' | 'breather' | 'victory' | 'defeat'
type Tier = 'low' | 'mid' | 'high'

const SPEED_KEY = 'tiny-td-speed'

const _v = new THREE.Vector3()
const _aim = new THREE.Vector3()
const _ground = new THREE.Vector3()

function segmentDistance(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  px: number,
  py: number,
  pz: number,
): number {
  const abx = bx - ax
  const aby = by - ay
  const abz = bz - az
  const ab2 = abx * abx + aby * aby + abz * abz || 1
  let t = ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / ab2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t), pz - (az + abz * t))
}

function isWeapon(id: string): id is WeaponId {
  return id in WEAPONS
}

function isMiddle(id: string): id is MiddleId {
  return id === 'a' || id === 'b' || id === 'c'
}

function isRoof(id: string): id is RoofId {
  return id === 'a' || id === 'b' || id === 'c'
}

const WEAPON_EFFECT: Record<WeaponId, string> = {
  ballista: 'Pierce',
  cannon: 'Splash',
  catapult: 'Slow',
  turret: 'Rapid',
}

function detectTier(): Tier {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const memory = nav.deviceMemory ?? 8
  if (memory <= 2) return 'low'
  if (memory <= 4) return 'mid'
  return 'high'
}

function skyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 256)
    g.addColorStop(0, '#79c6f0')
    g.addColorStop(0.42, '#b7e3f8')
    g.addColorStop(0.72, '#f6e2c4')
    g.addColorStop(1, '#f3c99a')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 4, 256)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  return tex
}

function snowSkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 256)
    g.addColorStop(0, '#6e9fd0')
    g.addColorStop(0.42, '#c5dff2')
    g.addColorStop(0.75, '#e7f3fb')
    g.addColorStop(1, '#d5e6f4')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 4, 256)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  return tex
}

const beamMat = new THREE.MeshLambertMaterial({
  color: 0xb7f3ff,
  emissive: 0x7adfff,
  emissiveIntensity: 0.9,
  transparent: true,
  opacity: 0.62,
  depthWrite: false,
})

function styleBeam(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.material = beamMat
    mesh.castShadow = false
    mesh.receiveShadow = false
  })
}

export class Game {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private raycaster = new THREE.Raycaster()
  private ndc = new THREE.Vector2()
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private clock = new THREE.Clock()
  private map!: BuiltMap
  private fx!: Fx
  private towers: Tower[] = []
  private enemies: Enemy[] = []
  private pets: Pet[] = []
  private projectiles: Projectile[] = []
  private carries: Carry[] = []
  private rescues = 0
  private abductions = 0
  private waveLog: WaveRow[] = []
  private showDamage = true
  private bannerTitle: string | null = null
  private bannerChips: WaveChip[] | null = null
  private bannerT = 0
  private effectiveAt = new Map<number, number>()
  private damageAt = new Map<number, number>()
  private lastEffective = -10
  private lastEffX = 0
  private lastEffZ = 0
  private effectiveStack = 0
  private highlight: THREE.Mesh
  private rangeMesh: THREE.Mesh
  private hintMarker: THREE.Sprite
  private selected: MapCell | null = null
  private phase: Phase = 'title'
  private gold = START_GOLD
  private waveIndex = 0
  private countdown = 0
  private countdownFull = 3.6
  private waveTime = 0
  private schedule: { time: number; kind: EnemyKind; entry: number; hpMul: number }[] = []
  private spawnIndex = 0
  private kills = 0
  private leaks = 0
  private spawned = 0
  private speedChoice = 1
  private forcedScale: number | null = null
  private paused = false
  private time = 0
  private shake = 0
  private fps = 60
  private fpsFrames = 0
  private fpsAccum = 0
  private target = new THREE.Vector3(2.6, 0.2, 4.7)
  private distance = 20.2
  private visualTime = 0
  private pitch = 0.76
  private azimuth = 2.8
  private lookY = 0.25
  private userCam = false
  private cameraLock: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number }>()
  private moved = false
  private lastPinch = 0
  private dragging = false
  private lastGround = new THREE.Vector3()
  private error: string | null = null
  private loopStarted = false
  private level: LevelDef = levelById(1)
  private selectedLevel = 1
  private tutorStep = 0
  private settings: Settings = loadSettings()
  private settingsOpen = false
  private tier: Tier = 'high'
  private tierReady = false
  private sun!: THREE.DirectionalLight
  private hemi!: THREE.HemisphereLight
  private ambient!: THREE.AmbientLight
  private rim!: THREE.DirectionalLight
  private fill!: THREE.DirectionalLight
  private skyGrass: THREE.Texture
  private skySnow: THREE.Texture
  private snowPoints: THREE.Points | null = null
  private snowFall: number[] = []
  private titleSpin = 0
  private waveGate = Infinity
  private runGate = Infinity
  private iconUrl = ''
  private padPulse: THREE.Mesh
  private ammoPools = new Map<string, THREE.Object3D[]>()
  private freeProjectiles: Projectile[] = []
  private rigs: Carry[] = []
  private glowGeo = new THREE.CylinderGeometry(0.16, 0.28, 1, 12, 1, true)
  private glowMat = new THREE.MeshBasicMaterial({
    color: 0xdff8ff,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  private enemyPool = new Map<EnemyKind, Enemy[]>()
  private padGlows: THREE.Object3D[] = []
  private viewRect = { w: 1, h: 1, left: 0, top: 0, hudBottom: 54 }
  private padGeo = new THREE.RingGeometry(0.42, 0.58, 28)
  private discGeo = new THREE.CircleGeometry(0.46, 20)
  private padGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffd27a,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  private discMat = new THREE.MeshLambertMaterial({ color: 0xd9d0c2 })
  private warmed = false
  private warmupAmmo: THREE.Object3D[] = []

  constructor(
    private app: HTMLElement,
    private hud: Hud,
  ) {
    const params = new URLSearchParams(location.search)
    const capture = params.has('capture')
    const detected = detectTier()
    this.tier = this.settings.quality === 'low' ? 'low' : this.settings.quality === 'high' ? 'high' : detected
    const savedSpeed = Number(localStorage.getItem(SPEED_KEY) || '1')
    this.speedChoice = savedSpeed === 2 ? 2 : 1
    this.showDamage = this.settings.damage
    this.skyGrass = skyTexture()
    this.skySnow = snowSkyTexture()
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.tier === 'high',
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: capture,
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.02
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.12, 90)
    this.app.prepend(this.renderer.domElement)

    this.scene.background = this.skyGrass
    this.scene.fog = new THREE.Fog(0xf6e2c8, 42, 82)
    this.ambient = new THREE.AmbientLight(0xfff1df, 0.3)
    this.scene.add(this.ambient)
    this.hemi = new THREE.HemisphereLight(0xfff4e4, 0x5c8644, 0.4)
    this.scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight(0xffd89a, 2.45)
    this.sun.position.set(11, 8.2, 6.5)
    this.sun.target.position.set(3, 0, 5)
    this.sun.shadow.camera.near = 0.5
    this.sun.shadow.camera.far = 42
    this.sun.shadow.camera.left = -11
    this.sun.shadow.camera.right = 11
    this.sun.shadow.camera.top = 13
    this.sun.shadow.camera.bottom = -13
    this.sun.shadow.bias = -0.001
    this.sun.shadow.normalBias = 0.03
    this.sun.shadow.radius = 1.6
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)
    this.applyTier(this.tier)
    this.rim = new THREE.DirectionalLight(0xffb15a, 0.72)
    this.rim.position.set(-8, 4.5, 10)
    this.scene.add(this.rim)
    this.fill = new THREE.DirectionalLight(0xc5e4ff, 0.08)
    this.fill.position.set(-6, 5, -4)
    this.scene.add(this.fill)

    this.highlight = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.5, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffe08a,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    )
    this.highlight.rotation.x = -Math.PI / 2
    this.highlight.visible = false
    this.scene.add(this.highlight)

    this.rangeMesh = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshBasicMaterial({
        color: 0x9dffc8,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    )
    this.rangeMesh.rotation.x = -Math.PI / 2
    this.rangeMesh.visible = false
    this.scene.add(this.rangeMesh)

    this.hintMarker = new THREE.Sprite(
      new THREE.SpriteMaterial({ transparent: true, depthWrite: false }),
    )
    this.hintMarker.scale.set(0.46, 0.46, 1)
    this.hintMarker.visible = false
    this.scene.add(this.hintMarker)

    this.padPulse = new THREE.Mesh(
      new THREE.RingGeometry(0.46, 0.62, 28),
      new THREE.MeshBasicMaterial({
        color: 0xffb15a,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    )
    this.padPulse.rotation.x = -Math.PI / 2
    this.padPulse.visible = false
    this.scene.add(this.padPulse)
  }

  async init(): Promise<void> {
    this.resize()
    window.addEventListener('resize', () => this.resize())
    this.hud.setLoading('Raising the meadow…')
    await loadAssets((ratio) => {
      this.hud.setLoading(`Raising the meadow… ${Math.round(ratio * 100)}%`)
    })
    renderPieceThumbnails()
    this.iconUrl = renderAppIcon()
    const arrow = await arrowTexture()
    ;(this.hintMarker.material as THREE.SpriteMaterial).map = arrow
    const capture = new URLSearchParams(location.search).has('capture')
    perf.attach(this.renderer)
    perf.onToggle = (key, value) => {
      if (key === 'damage') this.toggleDamage()
      if (key === 'sound') this.toggleMute()
      if (key === 'shadows') this.applyTier(this.renderer.shadowMap.enabled ? 'low' : 'high')
      if (key === 'tier' && (value === 'low' || value === 'mid' || value === 'high')) this.applyTier(value)
    }
    this.fx = new Fx(this.scene)
    this.installLevel(levelById(1), capture ? 'play' : 'title')
    if (document.fonts?.load) await document.fonts.load('400 28px "Kenney Future"')
    this.warmPools()
    const hideFx = this.fx.prime(this.renderer)
    const hideActors = this.revealForWarmup()
    await this.renderer.compileAsync(this.scene, this.camera)
    perf.playing = false
    this.updateCamera()
    this.renderer.render(this.scene, this.camera)
    hideFx()
    hideActors()
    perf.playResizes = 0
    perf.playCompiles = 0
    perf.playUploads = 0
    this.bindInput()
    this.hud.setLoading(null)
    this.expose()
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.renderer.setAnimationLoop(null)
        return
      }
      this.clock.getDelta()
      this.renderer.setAnimationLoop(() => this.frame())
    })
    if (!this.loopStarted) {
      this.loopStarted = true
      this.renderer.setAnimationLoop(() => this.frame())
    }
  }

  private applyTier(tier: Tier): void {
    const changed = this.tierReady && tier !== this.tier
    this.tier = tier
    this.tierReady = true
    if (changed) perf.noteTier(tier)
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const ratio = window.devicePixelRatio || 1
    const pixel = tier === 'low' ? 1 : tier === 'mid' ? Math.min(ratio, coarse ? 1.5 : 1.75) : Math.min(ratio, 2)
    const shadows = tier === 'high'
    const size = 1024
    const nextRatio = pixel
    if (this.renderer.getPixelRatio() !== nextRatio) this.renderer.setPixelRatio(nextRatio)
    const shadowChanged = this.renderer.shadowMap.enabled !== shadows
    this.renderer.shadowMap.enabled = shadows
    this.sun.castShadow = shadows
    this.sun.shadow.autoUpdate = false
    if (shadows) {
      this.sun.shadow.mapSize.set(size, size)
      if (shadowChanged) {
        this.sun.shadow.map?.dispose()
        this.sun.shadow.map = null
      }
      this.sun.shadow.needsUpdate = true
    }
    this.ensureSnow()
    if (this.renderer.domElement.isConnected) this.resize()
  }

  private touchBoard(): void {
    if (this.sun.castShadow) this.sun.shadow.needsUpdate = true
  }

  private applyBiome(biome: 'grass' | 'snow'): void {
    const fog = this.scene.fog as THREE.Fog
    if (biome === 'snow') {
      fog.color.set(0xd4e6f8)
      fog.near = 46
      fog.far = 88
      this.ambient.color.set(0xeaf3ff)
      this.ambient.intensity = 0.38
      this.hemi.color.set(0xd6eaff)
      this.hemi.groundColor.set(0x6d8eae)
      this.hemi.intensity = 0.48
      this.sun.color.set(0xf7fbff)
      this.sun.intensity = 5.4
      this.rim.color.set(0xb7d2ff)
      this.rim.intensity = 0.28
      this.fill.color.set(0x8ebfff)
      this.fill.intensity = 0.34
      this.renderer.toneMappingExposure = 1.55
      this.scene.background = this.skySnow
    } else {
      fog.color.set(0xf6e2c8)
      fog.near = 42
      fog.far = 82
      this.ambient.color.set(0xfff1df)
      this.ambient.intensity = 0.3
      this.hemi.color.set(0xfff4e4)
      this.hemi.groundColor.set(0x5c8644)
      this.hemi.intensity = 0.4
      this.sun.color.set(0xffd89a)
      this.sun.intensity = 2.45
      this.rim.color.set(0xffb15a)
      this.rim.intensity = 0.72
      this.fill.color.set(0xc5e4ff)
      this.fill.intensity = 0.08
      this.renderer.toneMappingExposure = 1.02
      this.scene.background = this.skyGrass
    }
    this.ensureSnow()
  }

  /** Falling snow is pooled and only drawn on the high tier. */
  private ensureSnow(): void {
    const on = this.tier === 'high' && this.level.biome === 'snow'
    if (!this.snowPoints) {
      const count = 180
      const arr = new Float32Array(count * 3)
      this.snowFall = []
      for (let i = 0; i < count; i++) {
        arr[i * 3] = 1.1 + Math.random() * 3.8
        arr[i * 3 + 1] = 2.4 + Math.random() * 3.4
        arr[i * 3 + 2] = 2.2 + Math.random() * 6.2
        this.snowFall.push(0.0035 + Math.random() * 0.007)
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
      this.snowPoints = new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          color: 0xf7fbff,
          size: 0.13,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          sizeAttenuation: true,
        }),
      )
      this.snowPoints.frustumCulled = false
      this.scene.add(this.snowPoints)
    }
    this.snowPoints.visible = on
  }

  private tickSnow(): void {
    const points = this.snowPoints
    if (!points?.visible) return
    const attr = points.geometry.getAttribute('position') as THREE.BufferAttribute
    const arr = attr.array as Float32Array
    for (let i = 0; i < this.snowFall.length; i++) {
      arr[i * 3 + 1] -= this.snowFall[i]
      arr[i * 3] += Math.sin(this.visualTime * 0.7 + i) * 0.0015
      if (arr[i * 3] < 0.9 || arr[i * 3] > 5.1) arr[i * 3] = 1.1 + Math.random() * 3.8
      if (arr[i * 3 + 2] < 1.8 || arr[i * 3 + 2] > 8.8) arr[i * 3 + 2] = 2.2 + Math.random() * 6.2
      if (arr[i * 3 + 1] < 2.05) {
        arr[i * 3 + 1] = 5.6
        arr[i * 3] = 1.1 + Math.random() * 3.8
        arr[i * 3 + 2] = 2.2 + Math.random() * 6.2
      }
    }
    attr.needsUpdate = true
  }

  private resize(): void {
    const width = this.app.clientWidth || window.innerWidth
    const height = this.app.clientHeight || window.innerHeight
    if (width < 2 || height < 2) return
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    const bufferW = Math.floor(width * this.renderer.getPixelRatio())
    const bufferH = Math.floor(height * this.renderer.getPixelRatio())
    const canvas = this.renderer.domElement
    if (canvas.width !== bufferW || canvas.height !== bufferH) {
      this.renderer.setSize(width, height, false)
      perf.noteResize(`${bufferW}x${bufferH}`)
    }
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    this.cacheView()
    this.hud.rememberLayout()
    this.applyFraming(!this.userCam)
  }

  private cacheView(): void {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const hud = document.querySelector('#top')?.getBoundingClientRect()
    this.viewRect.w = rect.width || 1
    this.viewRect.h = rect.height || 1
    this.viewRect.left = rect.left
    this.viewRect.top = rect.top
    this.viewRect.hudBottom = hud ? hud.bottom - rect.top : 54
  }

  /**
   * Meadow is a tall board seen from a 3/4 angle. Portrait looks up the path.
   * Wide screens turn that path sideways so the long axis fits the width.
   */
  private framing(): {
    fov: number
    pitch: number
    distance: number
    azimuth: number
    lookY: number
    tx: number
    ty: number
    tz: number
  } {
    const aspect = this.camera.aspect || 1
    const meadow = this.level?.id === 1
    const pose = meadow
      ? aspect < 1
        ? { fov: 32, pitch: 1.012, azimuth: Math.PI, lookY: 0.42 }
        : { fov: 34, pitch: 1.03, azimuth: Math.PI / 2, lookY: 0.38 }
      : aspect < 0.62
        ? { fov: 42, pitch: 0.76, azimuth: 2.8, lookY: 0.35 }
        : aspect < 1.05
          ? { fov: 38, pitch: 0.74, azimuth: 2.5, lookY: 0.28 }
          : { fov: 30, pitch: 0.72, azimuth: 2.25, lookY: 0.2 }
    if (!this.map) {
      const distance = aspect < 0.62 ? 20.2 : aspect < 1.05 ? 18.4 : 12.2
      const tx = aspect < 0.62 ? 2.6 : aspect < 1.05 ? 3 : 3.15
      const tz = aspect < 0.62 ? 4.7 : aspect < 1.05 ? 4.8 : 4.9
      return { ...pose, distance, tx, ty: pose.lookY, tz }
    }
    const solved = this.solveFrame(pose)
    return { ...pose, distance: solved.distance, tx: solved.tx, ty: pose.lookY, tz: solved.tz }
  }

  private viewInsets(): { w: number; h: number; l: number; t: number; r: number; b: number } {
    const w = this.app.clientWidth || window.innerWidth
    const h = this.app.clientHeight || window.innerHeight
    const topEl = document.querySelector('#top')
    const bar = document.querySelector('#actions')
    const topBox = topEl?.getBoundingClientRect()
    const barBox = bar?.getBoundingClientRect()
    let top = Math.max(48, Math.round((topBox?.bottom ?? 58) + 4))
    let bottom = barBox && barBox.top > top + 80 ? Math.round(barBox.top - 6) : h - 64
    if (this.phase === 'title' && w / Math.max(1, h) > 1.05) {
      const plate = document.querySelector('#title-copy')?.getBoundingClientRect()
      const band = document.querySelector('#title-band')?.getBoundingClientRect()
      if (plate && plate.height > 24 && plate.bottom > top) top = Math.round(plate.bottom + 14)
      if (band && band.top > top + 120) bottom = Math.min(bottom, Math.round(band.top - 12))
    }
    const side = this.level?.id === 1 ? 1 : Math.max(4, Math.round(w * 0.012))
    return { w, h, l: side, t: top, r: w - side, b: Math.min(h - 8, bottom) }
  }

  /** Corners of the path, the spawn lead-in, and the pet pen. Not the plinth. */
  private framePoints(): THREE.Vector3[] {
    if (this.level?.id === 1) {
      const cols = this.level.cols ?? 7
      const rows = this.level.rows ?? 14
      const pts: THREE.Vector3[] = []
      for (const x of [-0.18, cols - 1 + 0.18]) {
        for (const z of [-0.02, rows - 1 + 0.22]) pts.push(new THREE.Vector3(x, 0.2, z))
      }
      return pts
    }
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    const grow = (x: number, z: number, pad: number) => {
      minX = Math.min(minX, x - pad)
      maxX = Math.max(maxX, x + pad)
      minZ = Math.min(minZ, z - pad)
      maxZ = Math.max(maxZ, z + pad)
    }
    for (const point of this.map.points) grow(point.x, point.z, 0.4)
    for (const pet of this.level.pets) grow(pet.x, pet.z, 0.26)
    const pts: THREE.Vector3[] = []
    for (const x of [minX, maxX]) {
      for (const z of [minZ, maxZ]) {
        for (const y of [0.12, 0.85]) pts.push(new THREE.Vector3(x, y, z))
      }
    }
    return pts
  }

  private overflowAt(
    distance: number,
    tx: number,
    tz: number,
    pose: { fov: number; pitch: number; azimuth: number; lookY: number },
    points: THREE.Vector3[],
    safe: { w: number; h: number; l: number; t: number; r: number; b: number },
  ): number {
    const cam = this.camera
    cam.fov = pose.fov
    cam.aspect = safe.w / Math.max(1, safe.h)
    cam.updateProjectionMatrix()
    const horiz = Math.cos(pose.pitch) * distance
    cam.position.set(tx + Math.sin(pose.azimuth) * horiz, Math.sin(pose.pitch) * distance, tz + Math.cos(pose.azimuth) * horiz)
    cam.lookAt(tx, pose.lookY, tz)
    cam.updateMatrixWorld()
    let overflow = 0
    for (const point of points) {
      _v.copy(point).project(cam)
      if (_v.z > 1) {
        overflow += 400
        continue
      }
      const x = (_v.x * 0.5 + 0.5) * safe.w
      const y = (-_v.y * 0.5 + 0.5) * safe.h
      overflow += Math.max(0, safe.l - x) + Math.max(0, x - safe.r) + Math.max(0, safe.t - y) + Math.max(0, y - safe.b)
    }
    return overflow
  }

  private solveFrame(pose: { fov: number; pitch: number; azimuth: number; lookY: number }): {
    distance: number
    tx: number
    tz: number
  } {
    const points = this.framePoints()
    const safe = this.viewInsets()
    const meadow = this.level?.id === 1
    let cx = 0
    let cz = 0
    if (meadow) {
      for (const point of points) {
        cx += point.x
        cz += point.z
      }
      cx /= Math.max(1, points.length)
      cz /= Math.max(1, points.length)
    } else {
      for (const point of this.map.points) {
        cx += point.x
        cz += point.z
      }
      cx /= Math.max(1, this.map.points.length)
      cz /= Math.max(1, this.map.points.length)
    }
    const portrait = safe.w / Math.max(1, safe.h) < 0.85
    const reach = meadow ? 1 : 1.6
    const step = meadow ? 0.25 : 0.8
    let bestDist = 18
    let bestX = cx
    let bestZ = cz
    let bestScore = Infinity
    for (let ox = -reach; ox <= reach + 1e-6; ox += step) {
      for (let oz = -reach; oz <= reach + 1e-6; oz += step) {
        const tx = THREE.MathUtils.clamp(cx + ox, 0.45, meadow ? 5.7 : 5.55)
        const tz = THREE.MathUtils.clamp(cz + oz, 0.4, meadow ? 11.4 : 9.2)
        let lo = meadow ? 8 : 7
        let hi = meadow ? 58 : 40
        for (let i = 0; i < (meadow ? 12 : 11); i++) {
          const mid = (lo + hi) / 2
          const over = this.overflowAt(mid, tx, tz, pose, points, safe)
          if (over <= 0.6) hi = mid
          else lo = mid
        }
        const span = this.spanAt(hi, tx, tz, pose, points, safe)
        const widthShort = Math.max(0, (portrait ? 0.94 : 0.9) - span.width)
        const heightShort = Math.max(0, (portrait ? 0.7 : 0.78) - span.height)
        const score = meadow
          ? (1 - span.fill) * 500 + span.overflow * 40 + span.center * 28
          : widthShort * 240 + heightShort * (portrait ? 160 : 80) + span.center * (portrait ? 6 : 14) + span.overflow * 30
        if (score < bestScore) {
          bestScore = score
          bestDist = hi
          bestX = tx
          bestZ = tz
        }
      }
    }
    if (meadow) {
      for (let n = 0; n < 5; n++) {
        const span = this.spanAt(bestDist, bestX, bestZ, pose, points, safe)
        const errX = (span.minX + span.maxX) / 2 - safe.w / 2
        const errY = (span.minY + span.maxY) / 2 - (safe.t + safe.b) / 2
        if (Math.abs(errX) < 14 && Math.abs(errY) < 14) break
        const k = 0.007
        bestX = THREE.MathUtils.clamp(
          bestX + Math.cos(pose.azimuth) * errX * k + Math.sin(pose.azimuth) * errY * k,
          0.45,
          5.7,
        )
        bestZ = THREE.MathUtils.clamp(
          bestZ - Math.sin(pose.azimuth) * errX * k + Math.cos(pose.azimuth) * errY * k,
          0.4,
          11.4,
        )
        let lo = 8
        let hi = 58
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2
          const over = this.overflowAt(mid, bestX, bestZ, pose, points, safe)
          if (over <= 0.6) hi = mid
          else lo = mid
        }
        bestDist = hi
      }
    }
    return { distance: bestDist, tx: bestX, tz: bestZ }
  }

  private spanAt(
    distance: number,
    tx: number,
    tz: number,
    pose: { fov: number; pitch: number; azimuth: number; lookY: number },
    points: THREE.Vector3[],
    safe: { w: number; h: number; l: number; t: number; r: number; b: number },
  ): { width: number; height: number; center: number; overflow: number; fill: number; minX: number; maxX: number; minY: number; maxY: number } {
    const overflow = this.overflowAt(distance, tx, tz, pose, points, safe)
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const point of points) {
      _v.copy(point).project(this.camera)
      const x = (_v.x * 0.5 + 0.5) * safe.w
      const y = (-_v.y * 0.5 + 0.5) * safe.h
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
    const safeMidY = (safe.t + safe.b) / 2
    const center =
      Math.abs((minX + maxX) / 2 - safe.w / 2) / safe.w + Math.abs((minY + maxY) / 2 - safeMidY) / safe.h
    const gapW = Math.max(1, safe.r - safe.l)
    const gapH = Math.max(1, safe.b - safe.t)
    const insideW = Math.max(0, Math.min(maxX, safe.r) - Math.max(minX, safe.l))
    const insideH = Math.max(0, Math.min(maxY, safe.b) - Math.max(minY, safe.t))
    return {
      width: (maxX - minX) / Math.max(1, safe.w),
      height: (maxY - minY) / Math.max(1, safe.h),
      center,
      overflow,
      fill: (insideW * insideH) / (gapW * gapH),
      minX,
      maxX,
      minY,
      maxY,
    }
  }

  private boardSpan(): { width: number; height: number } {
    const w = this.app.clientWidth || window.innerWidth || 1
    const h = this.app.clientHeight || window.innerHeight || 1
    this.camera.updateMatrixWorld()
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const point of this.framePoints()) {
      _v.copy(point).project(this.camera)
      const x = (_v.x * 0.5 + 0.5) * w
      const y = (-_v.y * 0.5 + 0.5) * h
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
    return {
      width: Math.round(((maxX - minX) / w) * 1000) / 1000,
      height: Math.round(((maxY - minY) / h) * 1000) / 1000,
    }
  }

  private applyFraming(resetView: boolean): void {
    const frame = this.framing()
    this.camera.fov = frame.fov
    this.pitch = frame.pitch
    this.azimuth = frame.azimuth
    this.lookY = frame.lookY
    this.camera.updateProjectionMatrix()
    if (resetView) {
      this.distance = frame.distance
      this.target.set(frame.tx, frame.ty, frame.tz)
    }
    this.clampCamera()
  }

  private clampCamera(): void {
    const cols = this.level?.cols ?? 7
    const rows = this.level?.rows ?? 11
    this.target.x = THREE.MathUtils.clamp(this.target.x, 0.2, Math.max(5.8, cols - 1.2))
    this.target.z = THREE.MathUtils.clamp(this.target.z, 0.2, Math.max(9.8, rows - 1.2))
    this.distance = THREE.MathUtils.clamp(this.distance, 4.2, 72)
  }

  private updateCamera(): void {
    if (this.cameraLock) {
      this.camera.position.copy(this.cameraLock.pos)
      this.camera.lookAt(this.cameraLock.look)
      return
    }
    const horiz = Math.cos(this.pitch) * this.distance
    const kick = Math.min(0.11, this.shake)
    const bob = Math.sin(this.time * 18) * kick
    const orbit = this.phase === 'title' && !this.userCam ? this.titleSpin : 0
    const azimuth = this.azimuth + orbit
    this.camera.position.set(
      this.target.x + Math.sin(azimuth) * horiz + bob,
      Math.sin(this.pitch) * this.distance + Math.cos(this.time * 21) * kick * 0.65,
      this.target.z + Math.cos(azimuth) * horiz,
    )
    this.camera.lookAt(this.target.x, this.lookY, this.target.z)
  }

  private bindInput(): void {
    const canvas = this.renderer.domElement
    canvas.addEventListener('contextmenu', (event) => event.preventDefault())
    canvas.addEventListener('gesturestart', (event) => event.preventDefault())
    canvas.addEventListener('pointerdown', (event) => {
      audio.unlock()
      this.pointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        sx: event.clientX,
        sy: event.clientY,
      })
      try {
        canvas.setPointerCapture(event.pointerId)
      } catch {
        // Synthetic events used by the headless check have no live pointer.
      }
      this.moved = this.pointers.size > 1
      this.dragging = false
      this.lastPinch = 0
      if (this.pointers.size === 1) this.groundAt(event.clientX, event.clientY, this.lastGround)
    })
    canvas.addEventListener('pointermove', (event) => {
      const rec = this.pointers.get(event.pointerId)
      if (!rec) return
      rec.x = event.clientX
      rec.y = event.clientY
      if (Math.hypot(rec.x - rec.sx, rec.y - rec.sy) > 10) this.moved = true
      if (this.pointers.size >= 2) {
        this.applyPinch()
        return
      }
      if (!this.moved) return
      if (!this.groundAt(event.clientX, event.clientY, _ground)) return
      if (!this.dragging) {
        this.dragging = true
        this.lastGround.copy(_ground)
        return
      }
      this.target.x -= _ground.x - this.lastGround.x
      this.target.z -= _ground.z - this.lastGround.z
      this.userCam = true
      this.clampCamera()
      this.updateCamera()
      this.camera.updateMatrixWorld()
      if (this.groundAt(event.clientX, event.clientY, _ground)) this.lastGround.copy(_ground)
    })
    canvas.addEventListener('pointerup', (event) => this.endPointer(event))
    canvas.addEventListener('pointercancel', (event) => this.endPointer(event))
    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault()
        audio.unlock()
        this.distance *= Math.exp(event.deltaY * 0.0011)
        this.userCam = true
        this.clampCamera()
      },
      { passive: false },
    )
  }

  private endPointer(event: PointerEvent): void {
    const rec = this.pointers.get(event.pointerId)
    this.pointers.delete(event.pointerId)
    this.lastPinch = 0
    if (rec && !this.moved && this.pointers.size === 0) this.selectAt(event.clientX, event.clientY)
  }

  private applyPinch(): void {
    const pts = [...this.pointers.values()]
    if (pts.length < 2) return
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
    if (this.lastPinch > 0) {
      this.distance *= this.lastPinch / Math.max(8, dist)
      this.userCam = true
      this.clampCamera()
    }
    this.lastPinch = dist
    this.moved = true
  }

  private groundAt(clientX: number, clientY: number, out: THREE.Vector3): boolean {
    this.setNdc(clientX, clientY)
    this.raycaster.setFromCamera(this.ndc, this.camera)
    return this.raycaster.ray.intersectPlane(this.ground, out) !== null
  }

  private setNdc(clientX: number, clientY: number): void {
    const rect = this.viewRect
    this.ndc.x = ((clientX - rect.left) / rect.w) * 2 - 1
    this.ndc.y = -((clientY - rect.top) / rect.h) * 2 + 1
  }

  private selectAt(clientX: number, clientY: number): void {
    if (this.phase === 'title' || this.phase === 'victory' || this.phase === 'defeat' || this.paused) return
    this.setNdc(clientX, clientY)
    this.raycaster.setFromCamera(this.ndc, this.camera)
    const hits = this.raycaster.intersectObjects(this.map.picks, false)
    const cell = (hits[0]?.object.userData.cell as MapCell | undefined) ?? null
    if (!cell || cell.kind !== 'build') {
      this.selected = null
    } else {
      this.selected = cell
      audio.play('click')
      if (this.tutorStep === 1 && !this.towerAt(cell.x, cell.z)) this.advanceTutor('pad')
      if (this.tutorStep === 4 && this.towerAt(cell.x, cell.z)) this.advanceTutor('tower')
    }
    this.syncSelection()
    this.refreshHud()
  }

  private spawnPets(): void {
    for (const spot of this.level.pets) {
      const pet = new Pet(spot)
      this.pets.push(pet)
      this.scene.add(pet.group)
    }
  }

  private frame(): void {
    const raw = Math.min(this.clock.getDelta(), 0.1)
    perf.playing = !this.paused && (this.phase === 'wave' || this.phase === 'breather')
    this.fpsAccum += raw
    this.fpsFrames += 1
    if (this.fpsAccum >= 0.4) {
      this.fps = this.fpsFrames / this.fpsAccum
      this.fpsAccum = 0
      this.fpsFrames = 0
    }
    if (!this.paused) {
      let scaled = raw * (this.forcedScale ?? this.speedChoice)
      let guard = 0
      while (scaled > 0 && guard < 80) {
        const dt = Math.min(0.02, scaled)
        this.tick(dt)
        scaled -= dt
        guard += 1
      }
      perf.noteStep(guard)
      this.visualTime += raw
      if (this.phase === 'title') this.titleSpin += raw * 0.18
      if (this.map) tickDiorama(this.map, this.visualTime)
      this.tickSnow()
      this.refreshHud()
    }
    this.updateCamera()
    for (const enemy of this.enemies) enemy.billboard(this.camera)
    this.renderer.render(this.scene, this.camera)
    perf.sample(raw * 1000, this.renderer, this.tier)
  }

  private tick(dt: number): void {
    this.time += dt
    this.shake = Math.max(0, this.shake - dt * 3.2)
    if (this.bannerT > 0) {
      this.bannerT = Math.max(0, this.bannerT - dt)
      if (this.bannerT === 0) {
        this.bannerTitle = null
        this.bannerChips = null
      }
    }
    const playing = this.phase === 'ready' || this.phase === 'wave' || this.phase === 'breather'
    if (this.phase === 'wave') this.updateSpawns(dt)
    if (this.phase === 'ready' && this.level.id === 1 && (this.tutorStep === 0 || this.tutorStep >= 3)) {
      if (this.countdown <= 0) {
        this.countdownFull = 4
        this.countdown = this.countdownFull
      }
      this.countdown -= dt
      if (this.countdown <= 0) this.startWave(false)
    }
    if (this.phase === 'breather') {
      this.countdown -= dt
      if (this.countdown <= 0) this.startWave(false)
    }
    if (playing) {
      const arrived: Enemy[] = []
      const escaped: Enemy[] = []
      for (const enemy of this.enemies) {
        const step = enemy.update(dt, this.map.points, this.time)
        if (enemy.carrying) this.trackGate(enemy)
        if (step === 'arrived') arrived.push(enemy)
        if (step === 'escaped') escaped.push(enemy)
      }
      for (const enemy of arrived) this.onArrive(enemy)
      for (const enemy of escaped) this.onEscape(enemy)
      this.updateTowers(dt)
      this.updateProjectiles(dt)
      this.flushKills()
      this.updateCarries(dt)
      this.checkWaveClear()
    } else {
      this.updateCarries(dt)
    }
    const threat = this.phase === 'title' || this.enemies.some((enemy) => enemy.alive && enemy.pos.z < 2.6)
    for (const pet of this.pets) {
      if (pet.alive || pet.reserved) pet.update(dt)
      if (pet.alive && !pet.reserved) pet.setNervous(threat)
    }
    for (const tower of this.towers) tower.update(dt)
    this.fx.update(dt)
    if (this.hintMarker.visible) {
      this.hintMarker.position.y = 1.05 + Math.sin(this.time * 4) * 0.1
    }
    if (this.padPulse.visible) {
      const pulse = 1 + Math.sin(this.time * 5) * 0.14
      this.padPulse.scale.setScalar(pulse)
      ;(this.padPulse.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(this.time * 5) * 0.35
    }
  }

  private updateSpawns(dt: number): void {
    if (this.livingPets() <= 0) return
    this.waveTime += dt
    while (this.spawnIndex < this.schedule.length && this.schedule[this.spawnIndex].time <= this.waveTime) {
      const slot = this.schedule[this.spawnIndex]
      this.spawnEnemy(slot.kind, slot.hpMul, slot.entry)
      this.spawnIndex += 1
      this.spawned += 1
    }
  }

  private spawnEnemy(kind: EnemyKind, hpMul = 1, entry = 0): Enemy {
    const meadow = this.level.id === 1
    const speed = meadow ? (kind === 'scout' ? 1.32 : 1.08) : 1
    const enemy = this.takeEnemy(kind, hpMul, speed, meadow ? 1.9 : 1)
    const points = this.map.points
    const max = Math.max(1, points.length - 1)
    const index = Math.min(max - 1, Math.floor(Math.max(0, entry) * max))
    enemy.waypoint = index
    const spot = points[index]
    enemy.pos.set(spot.x, ENEMIES[kind].hover, spot.z)
    enemy.group.position.copy(enemy.pos)
    this.enemies.push(enemy)
    this.scene.add(enemy.group)
    return enemy
  }

  private takeEnemy(kind: EnemyKind, hpScale: number, speedScale: number, visualScale: number): Enemy {
    const list = this.enemyPool.get(kind) ?? []
    const enemy = list.pop() ?? new Enemy(kind)
    this.enemyPool.set(kind, list)
    enemy.activate(hpScale, speedScale, visualScale)
    return enemy
  }

  private releaseEnemy(enemy: Enemy): void {
    if (enemy.pooled) return
    enemy.pooled = true
    enemy.alive = false
    enemy.badge.visible = false
    enemy.group.visible = false
    this.scene.remove(enemy.group)
    const list = this.enemyPool.get(enemy.kind) ?? []
    list.push(enemy)
    this.enemyPool.set(enemy.kind, list)
  }

  private warmPools(): void {
    if (this.warmed) return
    this.warmed = true
    const counts: Record<EnemyKind, number> = { scout: 22, swarm: 26, tank: 8, shield: 8, boss: 2 }
    for (const kind of Object.keys(counts) as EnemyKind[]) {
      for (let i = 0; i < counts[kind]; i++) {
        const enemy = new Enemy(kind)
        enemy.activate(1, 1, 1)
        enemy.pooled = true
        enemy.group.visible = false
        this.scene.add(enemy.group)
        const list = this.enemyPool.get(kind) ?? []
        list.push(enemy)
        this.enemyPool.set(kind, list)
      }
    }
    for (let i = 0; i < 3; i++) this.makeRig()
    this.fx.prepare()
    this.fx.burst(0, -30, 0, 0xfff4c4, 4, 1)
    const ammoCounts: Record<string, number> = {
      'weapon-ammo-arrow': 4,
      'weapon-ammo-cannonball': 4,
      'weapon-ammo-boulder': 4,
      'weapon-ammo-bullet': 8,
    }
    for (const [name, count] of Object.entries(ammoCounts)) {
      const ammoScale = name.includes('arrow') ? 0.65 : name.includes('bullet') ? 1.15 : 1.45
      for (let i = 0; i < count; i++) {
        const mesh = spawnModel(name)
        mesh.scale.setScalar(ammoScale)
        mesh.visible = false
        mesh.position.set(0, -30, 0)
        mesh.userData.ammoName = name
        this.scene.add(mesh)
        this.warmupAmmo.push(mesh)
        const pool = this.ammoPools.get(name) ?? []
        pool.push(mesh)
        this.ammoPools.set(name, pool)
      }
    }
  }

  /** Show one of every pooled mesh so the warmup frame uploads it before play. */
  private revealForWarmup(): () => void {
    const saved: Array<{ obj: THREE.Object3D; visible: boolean; cull: boolean }> = []
    const reveal = (obj: THREE.Object3D): void => {
      obj.traverse((child) => {
        saved.push({ obj: child, visible: child.visible, cull: child.frustumCulled })
        child.visible = true
        child.frustumCulled = false
      })
    }
    for (const list of this.enemyPool.values()) {
      const enemy = list[0]
      if (!enemy) continue
      enemy.badge.visible = true
      enemy.group.position.set(2, 0.55, 6)
      reveal(enemy.group)
    }
    const pet = this.pets[0]
    if (pet) pet.badge.visible = true
    for (const mesh of this.warmupAmmo) {
      mesh.position.set(3, 0.4, 6)
      reveal(mesh)
    }
    for (const rig of this.rigs) {
      rig.beam.position.set(2.2, 0.2, 6)
      rig.burst.position.set(2.2, 0.15, 6)
      rig.glow.position.set(2.2, 0.5, 6)
      reveal(rig.beam)
      reveal(rig.burst)
      reveal(rig.glow)
    }
    return () => {
      for (let i = saved.length - 1; i >= 0; i--) {
        const item = saved[i]
        item.obj.visible = item.visible
        item.obj.frustumCulled = item.cull
      }
      for (const list of this.enemyPool.values()) {
        const enemy = list[0]
        if (!enemy) continue
        enemy.badge.visible = false
        enemy.group.visible = false
        enemy.group.position.set(0, -20, 0)
      }
      if (pet) pet.badge.visible = false
      for (const mesh of this.warmupAmmo) {
        mesh.visible = false
        mesh.position.set(0, -30, 0)
      }
      for (const rig of this.rigs) {
        rig.beam.visible = false
        rig.burst.visible = false
        rig.glow.visible = false
      }
    }
  }

  private onArrive(enemy: Enemy): void {
    if (!enemy.alive || enemy.abducting || enemy.fleeing) return
    const pet = this.pets.find((candidate) => candidate.alive && !candidate.reserved)
    if (!pet) {
      enemy.fleeing = true
      enemy.fleeSpeed = 0.7
      return
    }
    this.beginCarry(enemy, pet)
  }

  private onEscape(enemy: Enemy): void {
    const carry = this.carries.find((item) => item.enemy === enemy)
    if (carry) {
      carry.pet.alive = false
      carry.pet.reserved = false
      carry.pet.group.rotation.z = 0
      this.scene.remove(carry.pet.group)
      this.leaks += 1
      this.dropCarry(carry)
      this.popText(enemy.pos.x, enemy.pos.y + 0.4, enemy.pos.z, 'Lost!', '#ffb0a8', 1.1)
    }
    this.removeEnemy(enemy)
    if (this.livingPets() <= 0) this.lose()
  }

  private makeRig(): Carry {
    const beam = spawnModel('enemy-ufo-beam')
    const burst = spawnModel('enemy-ufo-beam-burst')
    styleBeam(beam)
    styleBeam(burst)
    const glow = new THREE.Mesh(this.glowGeo, this.glowMat)
    glow.renderOrder = 4
    glow.castShadow = false
    beam.visible = false
    burst.visible = false
    glow.visible = false
    this.scene.add(beam)
    this.scene.add(burst)
    this.scene.add(glow)
    const rig: Carry = {
      enemy: null as unknown as Enemy,
      pet: null as unknown as Pet,
      phase: 'beam',
      time: 0,
      beam,
      burst,
      glow,
      icon: beam as unknown as THREE.Sprite,
      spark: 0,
    }
    this.rigs.push(rig)
    return rig
  }

  private takeRig(): Carry {
    const idle = this.rigs.find((rig) => !rig.beam.visible)
    const rig = idle ?? this.makeRig()
    rig.beam.visible = true
    rig.burst.visible = true
    rig.glow.visible = true
    return rig
  }

  private beginCarry(enemy: Enemy, pet: Pet): void {
    pet.reserved = true
    pet.ride()
    pet.play('gesture-negative')
    enemy.abducting = true
    enemy.carrying = true
    const rig = this.takeRig()
    enemy.badge.visible = false
    rig.enemy = enemy
    rig.pet = pet
    rig.phase = 'beam'
    rig.time = 0
    rig.spark = 0
    rig.icon = enemy.badge
    this.carries.push(rig)
    this.abductions += 1
    audio.play('beam')
    this.shake = Math.min(0.11, Math.max(this.shake, 0.05))
  }

  private updateCarries(dt: number): void {
    for (let i = this.carries.length - 1; i >= 0; i--) {
      const carry = this.carries[i]
      if (!carry.enemy.alive) {
        this.rescue(carry)
        continue
      }
      const enemy = carry.enemy
      const pet = carry.pet
      if (carry.phase === 'beam') {
        carry.time += dt
        const home = pet.home
        enemy.pos.x += (home.x - enemy.pos.x) * Math.min(1, dt * 3.4)
        enemy.pos.z += (home.z - enemy.pos.z) * Math.min(1, dt * 3.4)
        const hover = enemy.flying ? 2.15 : 1.85
        enemy.pos.y += (hover - enemy.pos.y) * Math.min(1, dt * 3)
        enemy.group.position.set(enemy.pos.x, enemy.pos.y + Math.sin(this.time * 6) * 0.03, enemy.pos.z)
        const lift = Math.min(1, carry.time / 0.7)
        const petY = Math.max(0, (enemy.pos.y - 0.55) * lift)
        pet.group.position.set(home.x + (enemy.pos.x - home.x) * lift, petY, home.z + (enemy.pos.z - home.z) * lift)
        pet.group.rotation.y += dt * 2.4
        pet.group.rotation.z = Math.sin(carry.time * 14) * 0.16
        this.placeBeam(carry, pet.group.position.x, petY, pet.group.position.z, enemy.pos.y)
        if (carry.time >= 0.82) {
          carry.phase = 'flee'
          enemy.abducting = false
          enemy.fleeing = true
          enemy.fleeSpeed = 0.46
          pet.group.rotation.z = 0
        }
      } else {
        const petY = Math.max(0.15, enemy.pos.y - 0.55)
        pet.group.position.set(enemy.pos.x, petY, enemy.pos.z)
        pet.group.rotation.y += dt * 2.6
        this.placeBeam(carry, enemy.pos.x, petY, enemy.pos.z, enemy.pos.y)
      }
    }
  }

  private placeBeam(carry: Carry, x: number, petY: number, z: number, ufoY: number): void {
    const height = Math.max(0.25, ufoY - petY)
    carry.beam.position.set(x, petY, z)
    carry.beam.scale.set(0.46, height, 0.46)
    carry.burst.position.set(x, petY + 0.02, z)
    carry.burst.rotation.y += 0.08
    carry.burst.scale.setScalar(0.42)
    carry.glow.position.set(x, petY + height * 0.5, z)
    carry.glow.scale.set(1, height, 1)
    if (this.time - carry.spark > 0.12) {
      carry.spark = this.time
      this.fx.burst(x, petY + Math.random() * height, z, 0xe7fbff, 2, 0.8)
    }
  }

  private dropCarry(carry: Carry): void {
    carry.beam.visible = false
    carry.burst.visible = false
    carry.glow.visible = false
    if (carry.enemy) carry.enemy.badge.visible = false
    carry.pet.group.rotation.z = 0
    const index = this.carries.indexOf(carry)
    if (index >= 0) this.carries.splice(index, 1)
  }

  private rescue(carry: Carry): void {
    if (!this.carries.includes(carry)) return
    const pet = carry.pet
    const enemy = carry.enemy
    this.dropCarry(carry)
    if (!pet.alive) return
    this.rescues += 1
    pet.parachute(enemy.pos.x, Math.max(0.8, enemy.pos.y - 0.4), enemy.pos.z)
    audio.play('cheer')
    buzz('rescue')
    this.advanceTutor('rescue')
    this.popText(enemy.pos.x, enemy.pos.y + 0.55, enemy.pos.z, 'Saved!', '#b8ffb0', 1.15)
    this.fx.burst(enemy.pos.x, enemy.pos.y, enemy.pos.z, 0xd8ffe4, 10, 2.2)
  }

  private updateTowers(dt: number): void {
    for (const tower of this.towers) {
      const stats = tower.stats()
      tower.cooldown = Math.max(0, tower.cooldown - dt)
      if (!stats.ammo) continue
      const target = this.pickTarget(tower, stats.range)
      if (target) tower.aimAt(target.pos.x, target.pos.z, dt)
      if (!target || tower.cooldown > 0) continue
      tower.cooldown = stats.cooldown
      tower.onFire()
      this.launch(tower, target, stats)
    }
  }

  private pickTarget(tower: Tower, range: number): Enemy | null {
    let best: Enemy | null = null
    let bestProgress = -1
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue
      const dist = Math.hypot(enemy.pos.x - tower.x, enemy.pos.z - tower.z)
      if (dist > range + enemy.radius) continue
      let progress = enemy.progress()
      if (enemy.carrying || enemy.fleeing || enemy.abducting) progress += 500
      else if (enemy.kind === 'boss') progress += 12
      else if (enemy.kind === 'tank') progress += 5
      if (progress > bestProgress) {
        best = enemy
        bestProgress = progress
      }
    }
    return best
  }

  private launch(tower: Tower, target: Enemy, stats: ReturnType<Tower['stats']>): void {
    if (!stats.ammo || !stats.sfx) return
    tower.muzzle(_v)
    const dist = Math.hypot(target.pos.x - _v.x, target.pos.z - _v.z)
    const flight = Math.max(0.28, dist / Math.max(0.1, stats.speed))
    _aim.set(
      target.pos.x + target.vel.x * flight * 0.8,
      target.pos.y + 0.05,
      target.pos.z + target.vel.z * flight * 0.8,
    )
    const mesh = this.takeAmmo(stats.ammo)
    const reused = this.freeProjectiles.pop()
    const pos = reused?.pos ?? new THREE.Vector3()
    const vel = reused?.vel ?? new THREE.Vector3()
    pos.copy(_v)
    mesh.position.copy(pos)
    let gravity = 0
    if (stats.arc) {
      const dx = _aim.x - pos.x
      const dy = _aim.y - pos.y
      const dz = _aim.z - pos.z
      gravity = 11
      vel.set(dx / flight, (dy + 0.5 * gravity * flight * flight) / flight, dz / flight)
    } else {
      vel.copy(_aim).sub(pos).normalize().multiplyScalar(stats.speed)
    }
    const shell: Projectile = reused ?? {
      mesh,
      pos,
      vel,
      gravity: 0,
      age: 0,
      life: 0,
      damage: 0,
      splash: 0,
      slow: 0,
      shieldMul: 1,
      pierce: 0,
      weapon: null,
      roof: null,
      splashHit: false,
      homing: true,
      speed: 0,
      target: null,
      hit: new Set(),
      alive: true,
    }
    shell.mesh = mesh
    shell.pos = pos
    shell.vel = vel
    shell.hit.clear()
    shell.alive = true
    this.projectiles.push(shell)
    Object.assign(shell, {
      gravity,
      age: 0,
      life: flight + (stats.arc ? 0.05 : 0.45),
      damage: stats.damage,
      splash: stats.splash,
      slow: stats.slow,
      shieldMul: stats.shieldMul,
      pierce: stats.pierce,
      weapon: stats.weapon,
      roof: stats.roof,
      splashHit: false,
      homing: !stats.arc,
      speed: stats.speed,
      target,
      alive: true,
    })
    audio.play(stats.sfx)
    this.fx.flash(pos.x, pos.y, pos.z, 0xfff3c4)
  }

  private updateProjectiles(dt: number): void {
    for (const proj of this.projectiles) {
      if (!proj.alive) continue
      if (proj.homing && proj.target?.alive) {
        _aim.set(proj.target.pos.x - proj.pos.x, proj.target.pos.y - proj.pos.y, proj.target.pos.z - proj.pos.z)
        const len = _aim.length() || 1
        _aim.multiplyScalar(proj.speed / len)
        const blend = 1 - Math.exp(-9 * dt)
        proj.vel.lerp(_aim, blend)
      }
      if (proj.gravity) proj.vel.y -= proj.gravity * dt
      proj.pos.addScaledVector(proj.vel, dt)
      proj.age += dt
      proj.mesh.position.copy(proj.pos)
      const horiz = Math.hypot(proj.vel.x, proj.vel.z) || 0.001
      proj.mesh.rotation.y = Math.atan2(proj.vel.x, proj.vel.z)
      proj.mesh.rotation.x = -Math.atan2(proj.vel.y, horiz)
      if (proj.weapon === 'cannon' || proj.weapon === 'ballista') {
        this.fx.trail(proj.pos.x, proj.pos.y, proj.pos.z, proj.weapon === 'cannon' ? 0xffb15a : 0xfff1b0)
      }

      const prevX = proj.pos.x - proj.vel.x * dt
      const prevY = proj.pos.y - proj.vel.y * dt
      const prevZ = proj.pos.z - proj.vel.z * dt
      let exploded = false
      for (const enemy of this.enemies) {
        if (!enemy.alive || proj.hit.has(enemy.id)) continue
        const reach = enemy.radius + 0.16
        if (segmentDistance(prevX, prevY, prevZ, proj.pos.x, proj.pos.y, proj.pos.z, enemy.pos.x, enemy.pos.y, enemy.pos.z) > reach) {
          continue
        }
        this.strike(proj, enemy, false)
        if (proj.splash > 0.05) {
          this.splash(proj, enemy.pos)
          proj.alive = false
          exploded = true
          break
        }
        if (proj.pierce <= 0) {
          proj.alive = false
          exploded = true
          break
        }
      }
      if (!exploded && proj.age >= proj.life) {
        if (proj.splash > 0.05) this.splash(proj, proj.pos)
        proj.alive = false
      }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i]
      if (proj.alive) continue
      this.recycleAmmo(proj.mesh)
      this.freeProjectiles.push(proj)
      this.projectiles.splice(i, 1)
    }
  }

  private strike(proj: Projectile, enemy: Enemy, fromSplash: boolean): void {
    const dealt = this.applyHit(proj, enemy, fromSplash ? 0.65 : 1)
    if (proj.slow > 0) enemy.slow(Math.max(0.35, 1 - proj.slow), 1.45)
    proj.hit.add(enemy.id)
    proj.pierce -= 1
    proj.damage *= 0.72
    audio.play('hit')
    this.fx.burst(enemy.pos.x, enemy.pos.y + 0.1, enemy.pos.z, 0xfff0b0, 6, 2.2)
    if (dealt.killed) this.pending.push(enemy)
  }

  private applyHit(
    proj: Projectile,
    enemy: Enemy,
    scale: number,
  ): { killed: boolean; effective: boolean } {
    const mod = matchup(enemy.kind, { weapon: proj.weapon, roof: proj.roof, splash: proj.splashHit ? proj.splash : proj.splash })
    const shieldMul = mod.shield >= 1 ? proj.shieldMul * mod.shield : mod.shield
    const amount = proj.damage * mod.damage * scale
    const hadShield = enemy.shield > 0
    const killed = enemy.damage(amount, shieldMul)
    const effective = mod.effective || (hadShield && mod.shield >= 1.8)
    if (effective) this.popEffective(enemy)
    if (this.showDamage && amount >= 1) {
      const last = this.damageAt.get(enemy.id) ?? -10
      if (this.time - last >= 0.16) {
        this.damageAt.set(enemy.id, this.time)
        this.popText(enemy.pos.x, enemy.pos.y + 0.42, enemy.pos.z, String(Math.round(amount)), '#fff6ea', 0.62)
      }
    }
    if (enemy.kind === 'boss') this.shake = Math.min(0.11, Math.max(this.shake, 0.08))
    return { killed, effective }
  }

  private popEffective(enemy: Enemy): void {
    const last = this.effectiveAt.get(enemy.id) ?? -10
    if (this.time - this.lastEffective < 3.2) return
    if (this.time - last < 3.2) return
    const near =
      this.time - this.lastEffective < 1.2 &&
      Math.hypot(enemy.pos.x - this.lastEffX, enemy.pos.z - this.lastEffZ) < 2.2
    this.effectiveStack = near ? this.effectiveStack + 1 : 0
    this.lastEffective = this.time
    this.lastEffX = enemy.pos.x
    this.lastEffZ = enemy.pos.z
    this.effectiveAt.set(enemy.id, this.time)
    this.popText(
      enemy.pos.x,
      enemy.pos.y + 1.15,
      enemy.pos.z,
      'Effective!',
      '#b6ff8a',
      1.2,
      this.effectiveStack * 44,
    )
  }

  private splash(proj: Projectile, origin: THREE.Vector3): void {
    proj.splashHit = true
    for (const enemy of this.enemies) {
      if (!enemy.alive || proj.hit.has(enemy.id)) continue
      const dist = Math.hypot(enemy.pos.x - origin.x, enemy.pos.z - origin.z)
      const radius = proj.splash + enemy.radius * 0.4
      if (dist > radius) continue
      const falloff = 0.55 + 0.45 * (1 - dist / radius)
      const before = proj.damage
      proj.damage *= falloff
      const dealt = this.applyHit(proj, enemy, 1)
      proj.damage = before
      if (proj.slow > 0) enemy.slow(Math.max(0.4, 1 - proj.slow * 0.8), 1.2)
      proj.hit.add(enemy.id)
      if (dealt.killed) this.pending.push(enemy)
    }
    this.fx.ring(origin.x, origin.z, 0xffb15a)
    this.fx.burst(origin.x, origin.y, origin.z, 0xffe08a, 10, 3.2)
    this.fx.puff(origin.x, origin.y, origin.z)
    this.shake = Math.min(0.11, Math.max(this.shake, 0.07))
  }

  private pending: Enemy[] = []

  private flushKills(): void {
    for (const enemy of this.pending) this.kill(enemy)
    this.pending.length = 0
  }

  private flyCoins(origin: THREE.Vector3, count: number): void {
    _v.copy(origin).project(this.camera)
    if (_v.z > 1) return
    const rect = this.viewRect
    const x = (_v.x * 0.5 + 0.5) * rect.w + rect.left
    const y = (-_v.y * 0.5 + 0.5) * rect.h + rect.top
    for (let i = 0; i < count; i++) {
      window.setTimeout(() => this.hud.flyCoin(x + (i - 1) * 6, y), i * 28)
    }
  }

  /** Numbers stay on the enemy. The sprite is in world space, so the camera projects it every frame. */
  private popText(
    x: number,
    y: number,
    z: number,
    text: string,
    color: string,
    life = 0.9,
    _screenLift = 0,
  ): void {
    this.fx.popup(x, y + 0.15, z, text, color, life)
  }

  private kill(enemy: Enemy): void {
    if (!enemy.alive) return
    enemy.alive = false
    this.kills += 1
    this.gold += enemy.reward
    const tint = ENEMIES[enemy.kind].tint
    this.popText(enemy.pos.x, enemy.pos.y + 0.35, enemy.pos.z, `+${enemy.reward}`, '#ffe08a')
    this.fx.burst(enemy.pos.x, enemy.pos.y + 0.2, enemy.pos.z, tint, 14, 3.4)
    this.fx.debris(enemy.pos.x, enemy.pos.y + 0.25, enemy.pos.z, tint)
    this.fx.boom(enemy.pos.x, enemy.pos.y + 0.35, enemy.pos.z, tint)
    this.fx.ring(enemy.pos.x, enemy.pos.z, tint)
    this.flyCoins(enemy.pos, 3)
    this.hud.flashGold()
    audio.play('boom')
    buzz('kill')
    if (enemy.kind === 'boss') {
      this.fx.boomBig(enemy.pos.x, enemy.pos.y + 0.55, enemy.pos.z, tint)
      this.fx.burst(enemy.pos.x, enemy.pos.y + 0.4, enemy.pos.z, 0xffe7a0, 18, 4.6)
      this.hud.flashScreen()
      this.shake = Math.min(0.11, Math.max(this.shake, 0.1))
    }
    const carry = this.carries.find((item) => item.enemy === enemy)
    if (carry) this.rescue(carry)
    this.removeEnemy(enemy)
  }

  private removeEnemy(enemy: Enemy): void {
    const index = this.enemies.indexOf(enemy)
    if (index >= 0) this.enemies.splice(index, 1)
    this.releaseEnemy(enemy)
  }

  private checkWaveClear(): void {
    if (this.phase !== 'wave') return
    if (this.spawnIndex < this.schedule.length) return
    if (this.livingPets() <= 0) {
      this.lose()
      return
    }
    const more = this.waveIndex < this.level.waves.length - 1
    if (more && this.level.id === 1) {
      const cleared = this.waveIndex + 1
      this.gold += clearBonus(cleared)
      this.noteWave(cleared)
      this.waveIndex += 1
      this.phase = 'breather'
      this.countdownFull = 2.2
      this.countdown = this.countdownFull
      this.advanceTutor('breather')
      return
    }
    if (this.enemies.length > 0 || this.carries.length > 0) return
    const cleared = this.waveIndex + 1
    this.gold += clearBonus(cleared)
    this.noteWave(cleared)
    this.waveIndex += 1
    if (this.waveIndex >= this.level.waves.length) {
      this.win()
      return
    }
    this.phase = 'breather'
    this.countdown = BREATHER_SECONDS
    this.advanceTutor('breather')
    audio.play('place')
  }

  private livingPets(): number {
    return this.pets.filter((pet) => pet.alive).length
  }

  private trackGate(enemy: Enemy): void {
    const gate = this.map.points[0]
    if (!gate) return
    const dist = Math.hypot(enemy.pos.x - gate.x, enemy.pos.z - gate.z)
    if (dist < this.waveGate) this.waveGate = dist
    if (dist < this.runGate) this.runGate = dist
  }

  private gateValue(value: number): number {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : 99
  }

  private noteWave(waveNumber: number): void {
    if (this.waveLog.some((row) => row.wave === waveNumber)) return
    const def = this.level.waves[waveNumber - 1]
    this.waveLog.push({
      wave: waveNumber,
      gold: this.gold,
      kills: this.kills,
      leaks: this.leaks,
      pets: this.livingPets(),
      rescues: this.rescues,
      abductions: this.abductions,
      came: def ? wavePreview(def).replaceAll('\n', ' | ') : '',
      gate: this.gateValue(this.waveGate),
    })
  }

  startWave(bonus: boolean): void {
    if (this.phase !== 'ready' && this.phase !== 'breather') return
    const early = bonus && this.phase === 'breather' && this.countdown > 0.75
    if (early) {
      this.gold += earlyBonus(this.waveIndex)
      this.advanceTutor('early')
    }
    this.finishTutor()
    this.bannerTitle = this.waveIndex === this.level.waves.length - 1 ? 'Boss wave' : `Wave ${this.waveIndex + 1}`
    this.bannerChips = waveChips(this.level.waves[this.waveIndex])
    this.bannerT = 2
    this.phase = 'wave'
    this.waveTime = 0
    this.waveGate = Infinity
    this.spawnIndex = 0
    this.schedule = []
    let time = this.level.id === 1 ? 0.12 : 0.35
    for (const group of this.level.waves[this.waveIndex].groups) {
      time += group.delay ?? 0
      for (let i = 0; i < group.count; i++) {
        this.schedule.push({ time, kind: group.kind, entry: group.entry ?? 0, hpMul: group.hpMul ?? 1 })
        time += group.interval
      }
      time += this.level.id === 1 ? 0.15 : 0.4
    }
    audio.play('wave')
    this.refreshHud()
  }

  toggleSpeed(): void {
    audio.unlock()
    audio.play('click')
    this.speedChoice = this.speedChoice === 1 ? 2 : 1
    localStorage.setItem(SPEED_KEY, String(this.speedChoice))
    this.forcedScale = null
    this.refreshHud()
  }

  togglePause(): void {
    if (this.phase === 'title' || this.phase === 'victory' || this.phase === 'defeat') return
    this.paused = !this.paused
    if (this.paused) {
      this.settingsOpen = false
      perf.playing = false
    }
    audio.play('click')
    this.refreshHud()
  }

  resume(): void {
    this.paused = false
    this.settingsOpen = false
    this.refreshHud()
  }

  quit(): void {
    this.paused = false
    this.installLevel(this.level, 'title')
  }

  toggleMute(): void {
    audio.unlock()
    audio.toggleMute()
    audio.play('click')
    this.refreshHud()
  }

  toggleDamage(): void {
    this.showDamage = !this.showDamage
    localStorage.setItem('tiny-td-dmg', this.showDamage ? '1' : '0')
    audio.play('click')
    this.refreshHud()
  }

  /** Buy or sell whatever is selected. Used by the on-screen tray. */
  act(part: string): boolean {
    if (!this.selected) return false
    return this.buy(this.selected.x, this.selected.z, part)
  }

  buy(x: number, z: number, part: string): boolean {
    if (this.phase === 'title' || this.phase === 'victory' || this.phase === 'defeat' || this.paused) return false
    const cell = this.map.cells.get(cellKey(x, z))
    if (!cell) return false
    if (isWeapon(part) && !this.towerAt(cell.x, cell.z)) return this.placeTower(cell, part)
    if (part === 'base') return this.placeBase(cell)
    if (part === 'sell') return this.sell(cell)
    if (part === 'upgrade') return this.buyUpgrade(cell)
    return this.buyPart(cell, part)
  }

  private placeTower(cell: MapCell, weapon: WeaponId): boolean {
    if (cell.kind !== 'build') return false
    if (this.towerAt(cell.x, cell.z)) return false
    if (this.towers.length >= MAX_TOWERS) return false
    const cost = WEAPONS[weapon].cost
    if (this.gold < cost) return false
    this.gold -= cost
    const tower = new Tower(cell.x, cell.z)
    tower.weapon = weapon
    tower.spent = cost
    tower.cooldown = 0.2
    tower.rebuild(true)
    this.towers.push(tower)
    this.scene.add(tower.group)
    this.selected = null
    this.advanceTutor('base')
    this.advanceTutor('weapon')
    buzz('build')
    audio.play('place')
    audio.play('thud')
    this.fx.burst(cell.x, 0.45, cell.z, 0xffe7a8, 14, 2.2)
    this.shake = Math.min(0.06, Math.max(this.shake, 0.02))
    this.touchBoard()
    this.syncMarker()
    this.syncSelection()
    this.refreshHud()
    return true
  }

  private placeBase(cell: MapCell): boolean {
    if (cell.kind !== 'build') return false
    if (this.towerAt(cell.x, cell.z)) return false
    if (this.towers.length >= MAX_TOWERS) return false
    if (this.gold < BASE_COST) return false
    this.gold -= BASE_COST
    const tower = new Tower(cell.x, cell.z)
    tower.spent = BASE_COST
    this.towers.push(tower)
    this.scene.add(tower.group)
    this.selected = cell
    this.advanceTutor('base')
    buzz('build')
    audio.play('place')
    audio.play('thud')
    this.fx.burst(cell.x, 0.3, cell.z, 0xe6d2a8, 12, 2)
    this.shake = Math.min(0.06, Math.max(this.shake, 0.02))
    this.touchBoard()
    this.syncSelection()
    this.refreshHud()
    return true
  }

  private buyPart(cell: MapCell, part: string): boolean {
    const tower = this.towerAt(cell.x, cell.z)
    if (!tower) return false
    if (part.startsWith('middle-')) {
      const id = part.slice(7)
      if (!isMiddle(id)) return false
      if (tower.middles.length >= MAX_MIDDLES) return false
      const layers = tower.middles.length + (tower.roof ? 1 : 0)
      const cost = stackCost(MIDDLES[id].cost, layers)
      if (this.gold < cost) return false
      this.gold -= cost
      tower.spent += cost
      tower.middles.push(id)
    } else if (part.startsWith('roof-')) {
      const id = part.slice(5)
      if (!isRoof(id)) return false
      const layers = tower.middles.length + (tower.roof ? 1 : 0)
      const cost = stackCost(ROOFS[id].cost, layers)
      if (this.gold < cost) return false
      this.gold -= cost
      tower.spent += cost
      tower.roof = id
    } else if (isWeapon(part)) {
      const cost = WEAPONS[part].cost
      if (this.gold < cost) return false
      this.gold -= cost
      tower.spent += cost
      tower.weapon = part
      tower.cooldown = 0.15
    } else {
      return false
    }
    tower.rebuild(true)
    this.touchBoard()
    if (isWeapon(part)) this.advanceTutor('weapon')
    buzz('build')
    audio.play(part.startsWith('middle-') || part.startsWith('roof-') ? 'thud' : 'place')
    this.fx.burst(cell.x, 0.8, cell.z, 0xffe7a8, 10, 2.2)
    this.syncSelection()
    this.refreshHud()
    return true
  }

  private buyUpgrade(cell: MapCell): boolean {
    const tower = this.towerAt(cell.x, cell.z)
    if (!tower || tower.tier >= MAX_UPGRADE) return false
    const cost = UPGRADE_COST[tower.tier]
    if (this.gold < cost) return false
    this.gold -= cost
    tower.spent += cost
    tower.tier += 1
    tower.rebuild(true)
    this.touchBoard()
    this.advanceTutor('upgrade')
    buzz('build')
    audio.play('thud')
    this.fx.burst(cell.x, 0.9, cell.z, 0xffd27a, 8, 2)
    this.syncSelection()
    this.refreshHud()
    return true
  }

  private sell(cell: MapCell): boolean {
    const index = this.towers.findIndex((tower) => tower.x === cell.x && tower.z === cell.z)
    if (index < 0) return false
    const tower = this.towers[index]
    const refund = Math.floor(tower.spent * SELL_RATIO)
    this.gold += refund
    this.scene.remove(tower.group)
    this.towers.splice(index, 1)
    this.touchBoard()
    audio.play('click')
    this.popText(cell.x, 0.8, cell.z, `+${refund}`, '#fff1b8')
    this.syncSelection()
    this.refreshHud()
    return true
  }

  private towerAt(x: number, z: number): Tower | undefined {
    return this.towers.find((tower) => tower.x === x && tower.z === z)
  }

  private coachPad(): { x: number; z: number } {
    const center = this.map.cells.get(cellKey(3, 4))
    if (this.level.id === 1 && center?.kind === 'build') return center
    let fallback = this.map.hint
    for (const cell of this.map.cells.values()) {
      if (cell.kind !== 'build' || !cell.model.includes('dirt')) continue
      fallback = cell
      if (cell.z >= 3 && cell.z <= 8) return cell
    }
    return fallback
  }

  private syncMarker(): void {
    const pad = this.tutorStep === 4 ? this.towerAt(this.towers[0]?.x ?? -1, this.towers[0]?.z ?? -1) : null
    const show = (this.tutorStep === 1 && this.towers.length === 0) || (this.tutorStep === 4 && !!this.towers[0])
    this.hintMarker.visible = false
    this.padPulse.visible = show
    if (!show) return
    const spot = pad ? { x: pad.x, z: pad.z } : this.coachPad()
    this.padPulse.position.set(spot.x, 0.28, spot.z)
  }

  private syncSelection(): void {
    const cell = this.selected
    if (!cell || this.phase === 'victory' || this.phase === 'defeat') {
      this.highlight.visible = false
      this.rangeMesh.visible = false
      return
    }
    this.highlight.visible = true
    this.highlight.position.set(cell.x, 0.32, cell.z)
    const tower = this.towerAt(cell.x, cell.z)
    const showRange = cell.kind === 'build' || !!tower
    this.rangeMesh.visible = showRange
    if (!showRange) return
    const range = tower ? tower.stats().range : BASE_RANGE
    this.rangeMesh.position.set(cell.x, 0.24, cell.z)
    this.rangeMesh.scale.setScalar(range)
    const mat = this.highlight.material as THREE.MeshBasicMaterial
    mat.color.set(tower ? 0xffe08a : 0xb8ff9a)
  }

  private selectionView(): SelectionView | null {
    const cell = this.selected
    if (!cell || cell.kind !== 'build' || this.phase === 'victory' || this.phase === 'defeat' || this.paused) return null
    const anchor = this.projectWorld(cell.x, 0.4, cell.z)
    const tower = this.towerAt(cell.x, cell.z)
    if (tower) {
      const stats = tower.stats()
      const nextTier = tower.tier >= MAX_UPGRADE ? null : UPGRADE_COST[tower.tier]
      const layer = tower.tier >= MAX_UPGRADE ? 'Crown' : ['Mid', 'Top', 'Crown'][tower.tier] ?? 'Mid'
      const refund = Math.floor(tower.spent * SELL_RATIO)
      const weapon = tower.weapon ? WEAPONS[tower.weapon].label : 'Tower'
      const actions: ActionButton[] = [
        {
          id: 'upgrade',
          label: 'Upgrade',
          effect: layer,
          detail: 'Adds the next stack layer.',
          cost: nextTier == null ? 'Max' : String(nextTier),
          enabled: nextTier != null && this.gold >= nextTier,
          tone: 'yellow',
        },
        {
          id: 'sell',
          label: 'Sell',
          effect: 'Refund',
          detail: 'Returns half of what this tower cost.',
          cost: `+${refund}`,
          enabled: true,
          tone: 'red',
        },
      ]
      return {
        title: weapon,
        blurb: '',
        stats: `Range ${stats.range.toFixed(1)}`,
        actions,
        anchor,
      }
    }
    const order: WeaponId[] = ['turret', 'cannon', 'catapult', 'ballista']
    const actions: ActionButton[] = order.map((id) => {
      const def = WEAPONS[id]
      return {
        id,
        label: def.label,
        effect: WEAPON_EFFECT[id],
        detail: def.blurb,
        cost: String(def.cost),
        enabled: this.gold >= def.cost && this.towers.length < MAX_TOWERS,
        tone: 'green',
      }
    })
    return {
      title: 'Build',
      blurb: '',
      stats: '',
      actions,
      anchor,
    }
  }

  private refreshHud(): void {
    const playing = this.phase === 'ready' || this.phase === 'breather'
    let startLabel = 'Call wave'
    if (this.phase === 'breather' && this.countdown > 0.75) {
      startLabel = `Call +${earlyBonus(this.waveIndex)}`
    } else if (this.phase === 'victory') startLabel = 'Clear'
    else if (this.phase === 'defeat') startLabel = 'Over'
    const waveNo = Math.min(this.waveIndex + 1, this.level.waves.length)
    const preview = playing && this.waveIndex < this.level.waves.length ? waveChips(this.level.waves[this.waveIndex]) : null
    const stars = starCount(this.livingPets())
    const waveLabel = `Wave ${waveNo}/${this.level.waves.length}`
    this.hud.render({
      gold: this.gold,
      waveLabel,
      pets: this.livingPets(),
      petMax: PET_COUNT,
      phase: this.phase,
      countdown: this.countdown,
      enemies: this.enemies.length,
      speed: this.speedChoice,
      muted: audio.muted,
      damageNumbers: this.showDamage,
      hint: false,
      startLabel,
      startEnabled: playing,
      countdownLabel: null,
      countdownFull: this.countdownFull,
      preview,
      bannerTitle: this.bannerTitle,
      bannerChips: this.bannerChips,
      selection: this.selectionView(),
      end:
        this.phase === 'victory'
          ? {
              kind: 'win',
              title: 'The pets are safe',
              detail:
                stars >= 3
                  ? `All ${this.level.waves.length} waves held, and every pet waddled home.`
                  : `All ${this.level.waves.length} waves held. ${this.livingPets()} pets made it home.`,
              stars,
            }
          : this.phase === 'defeat'
            ? {
                kind: 'lose',
                title: 'The pen is empty',
                detail: `A UFO carried the last pet out on wave ${waveNo}.`,
                stars: 0,
              }
            : null,
      title: this.titleView(),
      coach: this.handView(),
      paused: this.paused,
      settingsOpen: this.settingsOpen,
      settings: this.settings,
      hapticsAvailable: typeof navigator.vibrate === 'function',
    })
  }

  private titleView() {
    if (this.phase !== 'title') return null
    return LEVELS.map((level) => ({
      id: level.id,
      name: level.name,
      blurb: level.blurb,
      lock: level.id > 1 ? 'Coming soon' : '',
      stars: starsFor(level.id),
      unlocked: level.id === 1 && levelUnlocked(level.id),
      selected: level.id === this.selectedLevel,
    }))
  }

  private handView(): HandView | null {
    if (this.tutorStep < 1 || this.tutorStep > 3 || this.paused) return null
    if (this.phase === 'title' || this.phase === 'victory' || this.phase === 'defeat') return null
    if (this.selected) return null
    if (this.tutorStep === 1 || this.tutorStep === 2) {
      const pad = this.coachPad()
      const point = this.projectWorld(pad.x, 0.7, pad.z)
      if (!point) return null
      return { text: this.tutorStep === 1 ? 'Tap' : 'Turret', x: point.x, y: point.y, part: null }
    }
    return { text: 'Go', x: 0, y: 0, part: 'start' }
  }

  private projectWorld(x: number, y: number, z: number): { x: number; y: number } | null {
    this.camera.updateMatrixWorld()
    _v.set(x, y, z).project(this.camera)
    if (_v.z > 1) return null
    const rect = this.viewRect
    return {
      x: (_v.x * 0.5 + 0.5) * rect.w + rect.left,
      y: (-_v.y * 0.5 + 0.5) * rect.h + rect.top,
    }
  }

  private clearAnnouncements(): void {
    this.bannerTitle = null
    this.bannerChips = null
    this.bannerT = 0
    this.fx.clear()
    this.hud.clearTransient()
  }

  private win(): void {
    if (this.phase === 'victory' || this.phase === 'defeat') return
    this.clearAnnouncements()
    this.phase = 'victory'
    for (const pet of this.pets) {
      if (!pet.alive) continue
      pet.play('dance')
      this.fx.burst(pet.home.x, 0.5, pet.home.z, 0xffe08a, 10, 2)
    }
    saveStars(this.level.id, starCount(this.livingPets()))
    audio.duck(true)
    audio.play('win')
    this.syncSelection()
    this.refreshHud()
  }

  private lose(): void {
    if (this.phase === 'victory' || this.phase === 'defeat') return
    this.clearAnnouncements()
    this.phase = 'defeat'
    this.noteWave(Math.min(this.waveIndex + 1, this.level.waves.length))
    audio.duck(true)
    audio.play('lose')
    this.syncSelection()
    this.refreshHud()
  }

  retry(): void {
    this.installLevel(this.level, 'play')
  }

  startLevel(id: number): void {
    this.installLevel(levelById(id), 'play')
  }

  playSelected(): void {
    if (!levelUnlocked(this.selectedLevel)) return
    this.installLevel(levelById(this.selectedLevel), 'play')
  }

  previewLevel(id: number): void {
    if (!levelUnlocked(id)) return
    if (this.phase === 'title' && this.level.id === id) {
      this.selectedLevel = id
      this.refreshHud()
      return
    }
    this.installLevel(levelById(id), 'title')
  }

  next(): void {
    if (this.phase === 'victory') {
      const id = this.level.id + 1
      if (id <= LEVELS.length && levelUnlocked(id)) {
        this.installLevel(levelById(id), 'play')
        return
      }
    }
    this.installLevel(this.level, 'title')
  }

  openSettings(): void {
    this.settingsOpen = true
    this.refreshHud()
  }

  closeSettings(): void {
    this.settingsOpen = false
    this.refreshHud()
  }

  updateSettings(patch: Partial<Settings>): void {
    const next = { ...this.settings, ...patch }
    if (typeof navigator.vibrate !== 'function') next.haptics = false
    this.settings = next
    saveSettings(next)
    this.showDamage = next.damage
    audio.apply(next.sound, next.music)
    if (patch.quality === 'low') this.applyTier('low')
    else if (patch.quality === 'high') this.applyTier('high')
    else if (patch.quality === 'auto') this.applyTier(detectTier())
    this.refreshHud()
  }

  skipCoach(): void {
    this.finishTutor()
    this.refreshHud()
  }

  private installLevel(level: LevelDef, mode: 'play' | 'title'): void {
    this.clearActors()
    this.fx.clear()
    this.hud.clearTransient()
    if (this.map) {
      this.scene.remove(this.map.group)
      disposeMap(this.map)
    }
    this.level = level
    this.selectedLevel = level.id
    this.applyBiome(level.biome)
    this.map = buildMap(level)
    this.scene.add(this.map.group)
    this.rescues = 0
    this.abductions = 0
    this.waveLog = []
    this.effectiveAt.clear()
    this.damageAt.clear()
    this.lastEffective = -10
    this.effectiveStack = 0
    this.bannerTitle = null
    this.bannerChips = null
    this.bannerT = 0
    this.gold = START_GOLD
    this.phase = mode === 'title' ? 'title' : 'ready'
    this.waveIndex = 0
    this.countdown = 0
    this.countdownFull = 3.6
    this.kills = 0
    this.leaks = 0
    this.spawned = 0
    this.schedule = []
    this.spawnIndex = 0
    this.forcedScale = null
    this.paused = false
    this.selected = null
    this.settingsOpen = false
    this.userCam = false
    this.cameraLock = null
    this.shake = 0
    this.titleSpin = 0
    this.waveGate = Infinity
    this.runGate = Infinity
    this.tutorStep = mode === 'play' && level.id === 1 && !tutorialSeen() ? 1 : 0
    audio.duck(false)
    this.spawnPets()
    this.markPads()
    this.syncMarker()
    this.syncSelection()
    if (mode === 'title') this.refreshHud()
    this.applyFraming(true)
    this.touchBoard()
    if (mode !== 'title') this.refreshHud()
  }

  private markPads(): void {
    for (const glow of this.padGlows) this.scene.remove(glow)
    this.padGlows = []
    for (const cell of this.map.cells.values()) {
      if (cell.kind !== 'build') continue
      const disc = new THREE.Mesh(this.discGeo, this.discMat)
      disc.rotation.x = -Math.PI / 2
      disc.position.set(cell.x, 0.08, cell.z)
      disc.receiveShadow = true
      disc.castShadow = false
      const ring = new THREE.Mesh(this.padGeo, this.padGlowMat)
      ring.rotation.x = -Math.PI / 2
      ring.position.set(cell.x, 0.12, cell.z)
      ring.castShadow = false
      this.scene.add(disc)
      this.scene.add(ring)
      this.padGlows.push(disc, ring)
      const pick = this.map.picks.find((mesh) => mesh.userData.cell === cell)
      if (pick) pick.scale.setScalar(1.45)
    }
  }

  private clearActors(): void {
    for (const tower of this.towers) this.scene.remove(tower.group)
    for (const enemy of this.enemies) this.releaseEnemy(enemy)
    for (const proj of this.projectiles) this.scene.remove(proj.mesh)
    for (const pooled of this.ammoPools.values()) {
      for (const mesh of pooled) this.scene.remove(mesh)
    }
    for (const pet of this.pets) this.scene.remove(pet.group)
    for (const carry of this.carries) {
      carry.beam.visible = false
      carry.burst.visible = false
      carry.glow.visible = false
      if (carry.enemy) carry.enemy.badge.visible = false
    }
    for (const glow of this.padGlows) this.scene.remove(glow)
    this.padGlows = []
    this.towers = []
    this.enemies = []
    this.pets = []
    this.projectiles = []
    this.freeProjectiles = []
    this.ammoPools.clear()
    this.carries = []
    this.pending = []
  }

  private finishTutor(): void {
    if (this.tutorStep <= 0) return
    this.tutorStep = 0
    markTutorial()
    this.syncMarker()
  }

  private advanceTutor(reason: 'base' | 'weapon' | 'wave' | 'rescue' | 'early' | 'next' | 'breather' | 'pad' | 'tower' | 'upgrade'): void {
    if (this.tutorStep <= 0) return
    const step = this.tutorStep
    const match =
      reason === 'next' ||
      (step === 1 && (reason === 'pad' || reason === 'base')) ||
      (step === 2 && reason === 'weapon') ||
      (step === 3 && reason === 'wave') ||
      (step === 4 && reason === 'tower') ||
      (step === 5 && reason === 'upgrade')
    if (!match) return
    this.tutorStep += 1
    if (this.tutorStep === 3) {
      this.countdownFull = 3.5
      this.countdown = this.countdownFull
    }
    if (this.tutorStep > 3) this.finishTutor()
    this.syncMarker()
  }

  private takeAmmo(name: string): THREE.Object3D {
    const pool = this.ammoPools.get(name)
    const mesh = pool?.pop()
    if (mesh) {
      mesh.visible = true
      return mesh
    }
    const created = spawnModel(name)
    created.userData.ammoName = name
    const ammoScale = name.includes('arrow') ? 0.65 : name.includes('bullet') ? 1.15 : 1.45
    created.scale.setScalar(ammoScale)
    this.scene.add(created)
    return created
  }

  private recycleAmmo(mesh: THREE.Object3D): void {
    mesh.visible = false
    const name = String(mesh.userData.ammoName ?? '')
    const pool = this.ammoPools.get(name) ?? []
    pool.push(mesh)
    this.ammoPools.set(name, pool)
  }

  private expose(): void {
    window.__TINY_TD__ = {
      ready: true,
      error: this.error,
      getState: () => ({
        ready: true,
        error: this.error,
        phase: this.phase,
        gold: this.gold,
        wave: Math.min(this.waveIndex + 1, this.level.waves.length),
        waves: this.level.waves.length,
        pets: this.livingPets(),
        petMax: PET_COUNT,
        enemies: this.enemies.length,
        kills: this.kills,
        leaks: this.leaks,
        towers: this.towers.length,
        spawned: this.spawned,
        rescues: this.rescues,
        abductions: this.abductions,
        stars: starCount(this.livingPets()),
        carries: this.carries.length,
        fps: Math.round(this.fps),
        draws: this.renderer.info.render.calls,
        zoom: Math.round(this.distance * 10) / 10,
        targetX: Math.round(this.target.x * 100) / 100,
        targetZ: Math.round(this.target.z * 100) / 100,
        paused: this.paused,
        board: this.boardSpan(),
        level: this.level.id,
        pads: this.level.pads.map((pad) => [pad[0], pad[1]]),
        hint: { x: this.map.hint.x, z: this.map.hint.z },
        tutor: this.tutorStep,
        tier: this.tier,
        log: this.waveLog.map((row) => ({ ...row })),
        gate: this.gateValue(this.runGate),
      }),
      cellKind: (x, z) => this.map.cells.get(cellKey(x, z))?.kind ?? null,
      project: (x, z, y = 0.4) => {
        this.camera.updateMatrixWorld()
        _v.set(x, y, z).project(this.camera)
        if (_v.z > 1) return null
        const rect = this.renderer.domElement.getBoundingClientRect()
        return {
          x: (_v.x * 0.5 + 0.5) * rect.width + rect.left,
          y: (-_v.y * 0.5 + 0.5) * rect.height + rect.top,
        }
      },
      buy: (x, z, part) => this.buy(x, z, part),
      startWave: () => this.startWave(true),
      setTimeScale: (scale) => {
        this.forcedScale = scale
      },
      setGold: (amount) => {
        this.gold = amount
        this.refreshHud()
      },
      cameraFocus: (x, z, distance) => {
        this.cameraLock = null
        this.target.set(x, 0.4, z)
        this.distance = distance
        this.userCam = true
        this.clampCamera()
        this.updateCamera()
      },
      cameraLook: (px, py, pz, tx, ty, tz) => {
        this.cameraLock = {
          pos: new THREE.Vector3(px, py, pz),
          look: new THREE.Vector3(tx, ty, tz),
        }
        this.updateCamera()
      },
      debugAbduct: () => {
        const enemy = this.spawnEnemy('tank')
        const goal = this.map.points[this.map.points.length - 1]
        enemy.waypoint = this.map.points.length - 1
        enemy.pos.set(goal.x, 1.7, goal.z)
        enemy.group.position.copy(enemy.pos)
        const pet = this.pets.find((candidate) => candidate.alive && !candidate.reserved)
        if (pet) this.beginCarry(enemy, pet)
      },
      debugRescue: () => {
        const carry = this.carries[0]
        if (!carry) return
        carry.phase = 'flee'
        carry.enemy.abducting = false
        carry.enemy.fleeing = true
        this.kill(carry.enemy)
      },
      debugBoss: () => {
        this.phase = 'wave'
        this.waveIndex = this.level.waves.length - 1
        this.bannerTitle = 'Boss wave'
        this.bannerChips = waveChips(this.level.waves[this.level.waves.length - 1])
        this.bannerT = 8
        const boss = this.spawnEnemy('boss', 1, 0.55)
        boss.pos.y = ENEMIES.boss.hover
        this.spawnEnemy('swarm', 1, 0.42)
        this.spawnEnemy('tank', 1, 0.35)
        this.refreshHud()
      },
      debugPreview: () => {
        this.phase = 'breather'
        this.waveIndex = 4
        this.countdown = 8
        this.bannerTitle = null
        this.bannerChips = null
        this.refreshHud()
      },
      debugPop: () => {
        this.phase = 'wave'
        const scout = this.spawnEnemy('scout', 1, 0.48)
        const tank = this.spawnEnemy('tank', 1, 0.4)
        this.popText(scout.pos.x, scout.pos.y + 1.05, scout.pos.z, 'Effective!', '#b6ff8a', 30)
        this.popText(scout.pos.x + 0.04, scout.pos.y + 1.05, scout.pos.z + 0.02, 'Effective!', '#b6ff8a', 30, 46)
        this.popText(scout.pos.x + 0.18, scout.pos.y + 0.42, scout.pos.z, '14', '#fff6ea', 30)
        this.popText(tank.pos.x, tank.pos.y + 0.45, tank.pos.z, '9', '#fff6ea', 30)
        this.refreshHud()
      },
      deselect: () => {
        this.selected = null
        this.syncSelection()
      },
      select: (x: number, z: number) => {
        const cell = this.map.cells.get(cellKey(x, z))
        if (!cell) return
        this.selected = cell
        this.syncSelection()
        this.refreshHud()
      },
      debugWin: () => this.win(),
      debugLose: () => {
        if (this.phase === 'victory' || this.phase === 'defeat') this.phase = 'wave'
        this.lose()
      },
      retry: () => this.retry(),
      startLevel: (id: number) => this.startLevel(id),
      next: () => this.next(),
      debugTitle: () => this.installLevel(levelById(this.selectedLevel || 1), 'title'),
      debugSettings: () => this.openSettings(),
      debugCoach: (step?: number) => {
        const n = typeof step === 'number' ? Math.min(5, Math.max(1, Math.round(step))) : 1
        if (this.phase === 'title' || this.phase === 'victory' || this.phase === 'defeat') this.phase = 'ready'
        this.tutorStep = n
        if (n === 2) {
          const tower = this.towers[0]
          const cell = tower ? this.map.cells.get(cellKey(tower.x, tower.z)) : undefined
          if (cell) this.selected = cell
        } else {
          this.selected = null
        }
        this.syncMarker()
        this.syncSelection()
        this.refreshHud()
      },
      iconUrl: () => this.iconUrl,
      perf: () => perf.snapshot(this.renderer),
      pause: () => this.togglePause(),
    }
  }
}
