import * as THREE from 'three'
import { arrowTexture, asset, loadAssets, renderPieceThumbnails, spawnModel } from './assets'
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
  WAVES,
  WEAPONS,
  clearBonus,
  earlyBonus,
  matchup,
  stackCost,
  starCount,
  wavePreview,
  type EnemyKind,
  type MiddleId,
  type RoofId,
  type WeaponId,
} from './config'
import { Enemy } from './enemies'
import { Fx } from './fx'
import { buildMap, cellKey, tickDiorama, type BuiltMap, type MapCell } from './map'
import { PET_SPOTS, Pet } from './pets'
import { Tower } from './towers'
import { Hud, type ActionButton, type SelectionView } from './ui'

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
}

type Phase = 'ready' | 'wave' | 'breather' | 'victory' | 'defeat'

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

const MIDDLE_EFFECT: Record<MiddleId, string> = { a: 'Faster', b: 'Range', c: 'Reach' }
const ROOF_EFFECT: Record<RoofId, string> = { a: 'Slow', b: 'Splash', c: 'Shred' }
const WEAPON_EFFECT: Record<WeaponId, string> = {
  ballista: 'Pierce',
  cannon: 'Splash',
  catapult: 'Slow',
  turret: 'Rapid',
}

function detectQuality(coarse: boolean): { shadows: boolean; shadowMapSize: number; pixelRatio: number } {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const memory = nav.deviceMemory ?? 8
  const ratio = window.devicePixelRatio || 1
  if (memory <= 2) return { shadows: false, shadowMapSize: 0, pixelRatio: 1 }
  if (memory <= 4) return { shadows: true, shadowMapSize: 512, pixelRatio: Math.min(ratio, coarse ? 1.25 : 1.5) }
  return { shadows: true, shadowMapSize: 1024, pixelRatio: Math.min(ratio, coarse ? 1.5 : 1.75) }
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

function styleBeam(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const mat = (mesh.material as THREE.MeshLambertMaterial).clone()
    mat.color.set(0xb7f3ff)
    mat.emissive.set(0x7adfff)
    mat.emissiveIntensity = 0.9
    mat.transparent = true
    mat.opacity = 0.62
    mat.depthWrite = false
    mesh.material = mat
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
  private heartMap: THREE.Texture | null = null
  private rescues = 0
  private abductions = 0
  private waveLog: WaveRow[] = []
  private showDamage = true
  private bannerTitle: string | null = null
  private bannerBody: string | null = null
  private bannerT = 0
  private effectiveAt = new Map<number, number>()
  private highlight: THREE.Mesh
  private rangeMesh: THREE.Mesh
  private hintMarker: THREE.Sprite
  private selected: MapCell | null = null
  private phase: Phase = 'ready'
  private gold = START_GOLD
  private waveIndex = 0
  private countdown = 0
  private waveTime = 0
  private schedule: { time: number; kind: EnemyKind; entry: number; hpMul: number }[] = []
  private spawnIndex = 0
  private kills = 0
  private leaks = 0
  private spawned = 0
  private speedChoice = 1
  private forcedScale: number | null = null
  private time = 0
  private shake = 0
  private fps = 60
  private fpsFrames = 0
  private fpsAccum = 0
  private hint: boolean
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

  constructor(
    private app: HTMLElement,
    private hud: Hud,
  ) {
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const capture = new URLSearchParams(location.search).has('capture')
    const quality = detectQuality(coarse)
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: capture,
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.02
    this.renderer.setPixelRatio(quality.pixelRatio)
    if (quality.shadows) {
      this.renderer.shadowMap.enabled = true
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    }
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.12, 90)
    this.app.prepend(this.renderer.domElement)
    this.hint = localStorage.getItem('tiny-td-hint-v1') !== '1'
    this.showDamage = localStorage.getItem('tiny-td-dmg') !== '0'

    this.scene.background = skyTexture()
    this.scene.fog = new THREE.Fog(0xf6e2c8, 42, 82)
    this.scene.add(new THREE.AmbientLight(0xfff1df, 0.3))
    this.scene.add(new THREE.HemisphereLight(0xfff4e4, 0x5c8644, 0.4))
    const sun = new THREE.DirectionalLight(0xffd89a, 2.45)
    sun.position.set(11, 8.2, 6.5)
    sun.target.position.set(3, 0, 5)
    if (quality.shadows) {
      sun.castShadow = true
      sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize)
      sun.shadow.camera.near = 0.5
      sun.shadow.camera.far = 42
      sun.shadow.camera.left = -11
      sun.shadow.camera.right = 11
      sun.shadow.camera.top = 13
      sun.shadow.camera.bottom = -13
      sun.shadow.bias = -0.001
      sun.shadow.normalBias = 0.03
      sun.shadow.radius = 1.6
    }
    this.scene.add(sun)
    this.scene.add(sun.target)
    const rim = new THREE.DirectionalLight(0xffb15a, 0.72)
    rim.position.set(-8, 4.5, 10)
    this.scene.add(rim)
    const fill = new THREE.DirectionalLight(0xc5e4ff, 0.08)
    fill.position.set(-6, 5, -4)
    this.scene.add(fill)

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
  }

  async init(): Promise<void> {
    this.resize()
    window.addEventListener('resize', () => this.resize())
    this.hud.setLoading('Raising the meadow…')
    await loadAssets((ratio) => {
      this.hud.setLoading(`Raising the meadow… ${Math.round(ratio * 100)}%`)
    })
    renderPieceThumbnails()
    const arrow = await arrowTexture()
    ;(this.hintMarker.material as THREE.SpriteMaterial).map = arrow
    this.map = buildMap()
    this.scene.add(this.map.group)
    this.fx = new Fx(this.scene)
    this.spawnPets()
    this.bindInput()
    this.hud.setLoading(null)
    this.syncMarker()
    this.refreshHud()
    this.expose()
    if (!this.loopStarted) {
      this.loopStarted = true
      this.renderer.setAnimationLoop(() => this.frame())
    }
  }

  private resize(): void {
    const width = this.app.clientWidth || window.innerWidth
    const height = this.app.clientHeight || window.innerHeight
    this.camera.aspect = width / Math.max(1, height)
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    this.renderer.domElement.style.width = `${width}px`
    this.renderer.domElement.style.height = `${height}px`
    this.applyFraming(!this.userCam)
  }

  /**
   * Portrait turns the board so the UFO route runs down the screen and the pet
   * pen stays above the bottom bar. Wider screens keep the closer three-quarter view.
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
    const aspect = this.camera.aspect
    if (aspect < 0.62) {
      return { fov: 42, pitch: 0.76, distance: 20.2, azimuth: 2.8, lookY: 0.25, tx: 2.6, ty: 0.2, tz: 4.7 }
    }
    if (aspect < 1.05) {
      return { fov: 38, pitch: 0.74, distance: 18.4, azimuth: 2.5, lookY: 0.18, tx: 3.0, ty: 0.12, tz: 4.8 }
    }
    return { fov: 32, pitch: 0.72, distance: 15.4, azimuth: 2.25, lookY: 0.12, tx: 3.15, ty: 0.08, tz: 4.9 }
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
    this.target.x = THREE.MathUtils.clamp(this.target.x, 0.2, 5.8)
    this.target.z = THREE.MathUtils.clamp(this.target.z, 0.2, 9.8)
    this.distance = THREE.MathUtils.clamp(this.distance, 4.2, 34)
  }

  private updateCamera(): void {
    if (this.cameraLock) {
      this.camera.position.copy(this.cameraLock.pos)
      this.camera.lookAt(this.cameraLock.look)
      return
    }
    const horiz = Math.cos(this.pitch) * this.distance
    const bob = Math.sin(performance.now() * 0.04) * this.shake
    this.camera.position.set(
      this.target.x + Math.sin(this.azimuth) * horiz + bob,
      Math.sin(this.pitch) * this.distance + Math.cos(performance.now() * 0.05) * this.shake,
      this.target.z + Math.cos(this.azimuth) * horiz,
    )
    this.camera.lookAt(this.target.x, this.lookY, this.target.z)
  }

  private bindInput(): void {
    const canvas = this.renderer.domElement
    canvas.addEventListener('contextmenu', (event) => event.preventDefault())
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
      this.lastGround.copy(_ground)
      this.userCam = true
      this.clampCamera()
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
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1
  }

  private selectAt(clientX: number, clientY: number): void {
    if (this.phase === 'victory' || this.phase === 'defeat') return
    this.setNdc(clientX, clientY)
    this.raycaster.setFromCamera(this.ndc, this.camera)
    const hits = this.raycaster.intersectObjects(this.map.picks, false)
    const cell = (hits[0]?.object.userData.cell as MapCell | undefined) ?? null
    this.selected = cell
    if (cell) audio.play('click')
    this.syncSelection()
    this.refreshHud()
  }

  private spawnPets(): void {
    for (const spot of PET_SPOTS) {
      const pet = new Pet(spot)
      this.pets.push(pet)
      this.scene.add(pet.group)
    }
  }

  private frame(): void {
    const raw = Math.min(this.clock.getDelta(), 0.1)
    this.fpsAccum += raw
    this.fpsFrames += 1
    if (this.fpsAccum >= 0.4) {
      this.fps = this.fpsFrames / this.fpsAccum
      this.fpsAccum = 0
      this.fpsFrames = 0
    }
    let scaled = raw * (this.forcedScale ?? this.speedChoice)
    let guard = 0
    while (scaled > 0 && guard < 20) {
      const dt = Math.min(0.02, scaled)
      this.tick(dt)
      scaled -= dt
      guard += 1
    }
    this.visualTime += raw
    if (this.map) tickDiorama(this.map, this.visualTime)
    this.updateCamera()
    for (const enemy of this.enemies) enemy.billboard(this.camera)
    this.renderer.render(this.scene, this.camera)
  }

  private tick(dt: number): void {
    this.time += dt
    this.shake = Math.max(0, this.shake - dt * 1.4)
    if (this.bannerT > 0) {
      this.bannerT = Math.max(0, this.bannerT - dt)
      if (this.bannerT === 0) {
        this.bannerTitle = null
        this.bannerBody = null
      }
    }
    const playing = this.phase === 'ready' || this.phase === 'wave' || this.phase === 'breather'
    if (this.phase === 'wave') this.updateSpawns(dt)
    if (this.phase === 'breather') {
      this.countdown -= dt
      if (this.countdown <= 0) this.startWave(false)
    }
    if (playing) {
      const arrived: Enemy[] = []
      const escaped: Enemy[] = []
      for (const enemy of this.enemies) {
        const step = enemy.update(dt, this.map.points, this.time)
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
    const threat = this.enemies.some((enemy) => enemy.alive && enemy.pos.z < 2.6)
    for (const pet of this.pets) {
      if (pet.alive || pet.reserved) pet.update(dt)
      if (pet.alive && !pet.reserved) pet.setNervous(threat)
    }
    for (const tower of this.towers) tower.update(dt)
    this.fx.update(dt)
    if (this.hintMarker.visible) {
      this.hintMarker.position.y = 1.15 + Math.sin(this.time * 4) * 0.1
    }
    this.refreshHud()
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
    const enemy = new Enemy(kind, hpMul)
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
      this.fx.popup(enemy.pos.x, enemy.pos.y + 0.4, enemy.pos.z, 'Lost!', '#ffb0a8', 1.1)
    }
    this.removeEnemy(enemy)
    if (this.livingPets() <= 0) this.lose()
  }

  private heartTexture(): THREE.Texture {
    if (!this.heartMap) {
      this.heartMap = new THREE.TextureLoader().load(asset('assets/icons/heart.png'))
      this.heartMap.colorSpace = THREE.SRGBColorSpace
    }
    return this.heartMap
  }

  private beginCarry(enemy: Enemy, pet: Pet): void {
    pet.reserved = true
    pet.ride()
    pet.play('gesture-negative')
    enemy.abducting = true
    enemy.carrying = true
    const beam = spawnModel('enemy-ufo-beam')
    const burst = spawnModel('enemy-ufo-beam-burst')
    styleBeam(beam)
    styleBeam(burst)
    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.28, 1, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xdff8ff,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    )
    glow.renderOrder = 4
    const icon = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.heartTexture(), transparent: true, depthWrite: false }),
    )
    icon.scale.set(0.46, 0.46, 1)
    icon.position.y = ENEMIES[enemy.kind].scale * 1.35 + 0.35
    enemy.group.add(icon)
    this.scene.add(beam)
    this.scene.add(burst)
    this.scene.add(glow)
    this.carries.push({ enemy, pet, phase: 'beam', time: 0, beam, burst, glow, icon, spark: 0 })
    this.abductions += 1
    audio.play('beam')
    this.shake = Math.max(this.shake, 0.14)
  }

  private updateCarries(dt: number): void {
    for (const carry of [...this.carries]) {
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
    carry.beam.scale.set(0.22, height, 0.22)
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
    this.scene.remove(carry.beam)
    this.scene.remove(carry.burst)
    this.scene.remove(carry.glow)
    carry.enemy.group.remove(carry.icon)
    ;(carry.icon.material as THREE.Material).dispose()
    carry.pet.group.rotation.z = 0
    this.carries = this.carries.filter((item) => item !== carry)
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
    this.fx.popup(enemy.pos.x, enemy.pos.y + 0.55, enemy.pos.z, 'Saved!', '#b8ffb0', 1.15)
    this.fx.burst(enemy.pos.x, enemy.pos.y, enemy.pos.z, 0xd8ffe4, 10, 2.2)
    this.shake = Math.max(this.shake, 0.08)
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
    const mesh = spawnModel(stats.ammo)
    const ammoScale = stats.ammo.includes('arrow') ? 0.65 : stats.ammo.includes('bullet') ? 1.15 : 1.45
    mesh.scale.setScalar(ammoScale)
    const pos = _v.clone()
    mesh.position.copy(pos)
    this.scene.add(mesh)
    const vel = new THREE.Vector3()
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
    this.projectiles.push({
      mesh,
      pos,
      vel,
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
      hit: new Set(),
      alive: true,
    })
    audio.play(stats.sfx)
    this.fx.burst(pos.x, pos.y, pos.z, 0xfff4c4, 4, 1.4)
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
      if (!this.projectiles[i].alive) {
        this.scene.remove(this.projectiles[i].mesh)
        this.projectiles.splice(i, 1)
      }
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
      this.fx.popup(enemy.pos.x + 0.15, enemy.pos.y + 0.45, enemy.pos.z, String(Math.round(amount)), '#fff6ea', 0.7)
    }
    return { killed, effective }
  }

  private popEffective(enemy: Enemy): void {
    const last = this.effectiveAt.get(enemy.id) ?? -10
    if (this.time - last < 0.55) return
    this.effectiveAt.set(enemy.id, this.time)
    this.fx.popup(enemy.pos.x, enemy.pos.y + 0.85, enemy.pos.z, 'Effective!', '#b6ff8a', 1.15)
  }

  private splash(proj: Projectile, origin: THREE.Vector3): void {
    proj.splashHit = true
    for (const enemy of [...this.enemies]) {
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
  }

  private pending: Enemy[] = []

  private flushKills(): void {
    for (const enemy of this.pending) this.kill(enemy)
    this.pending.length = 0
  }

  private flyCoins(origin: THREE.Vector3, count: number): void {
    _v.copy(origin).project(this.camera)
    if (_v.z > 1) return
    const rect = this.renderer.domElement.getBoundingClientRect()
    const x = (_v.x * 0.5 + 0.5) * rect.width + rect.left
    const y = (-_v.y * 0.5 + 0.5) * rect.height + rect.top
    for (let i = 0; i < count; i++) {
      window.setTimeout(() => this.hud.flyCoin(x + (i - 1) * 12, y - i * 6), i * 60)
    }
  }

  private kill(enemy: Enemy): void {
    if (!enemy.alive) return
    enemy.alive = false
    this.kills += 1
    this.gold += enemy.reward
    this.fx.popup(enemy.pos.x, enemy.pos.y + 0.35, enemy.pos.z, `+${enemy.reward}`, '#ffe08a')
    this.fx.burst(enemy.pos.x, enemy.pos.y, enemy.pos.z, 0xfff2c4, 12, 3.2)
    this.fx.debris(enemy.pos.x, enemy.pos.y + 0.2, enemy.pos.z, ENEMIES[enemy.kind].tint)
    this.fx.puff(enemy.pos.x, enemy.pos.y + 0.15, enemy.pos.z)
    this.fx.ring(enemy.pos.x, enemy.pos.z, 0xffd27a)
    this.flyCoins(enemy.pos, 3)
    audio.play('boom')
    this.shake = Math.max(this.shake, enemy.kind === 'boss' ? 0.2 : 0.12)
    const carry = this.carries.find((item) => item.enemy === enemy)
    if (carry) this.rescue(carry)
    this.removeEnemy(enemy)
  }

  private removeEnemy(enemy: Enemy): void {
    enemy.alive = false
    this.scene.remove(enemy.group)
    const index = this.enemies.indexOf(enemy)
    if (index >= 0) this.enemies.splice(index, 1)
  }

  private checkWaveClear(): void {
    if (this.phase !== 'wave') return
    if (this.spawnIndex < this.schedule.length) return
    if (this.enemies.length > 0 || this.carries.length > 0) return
    if (this.livingPets() <= 0) {
      this.lose()
      return
    }
    const cleared = this.waveIndex + 1
    this.gold += clearBonus(cleared)
    this.noteWave(cleared)
    this.waveIndex += 1
    if (this.waveIndex >= WAVES.length) {
      this.win()
      return
    }
    this.phase = 'breather'
    this.countdown = BREATHER_SECONDS
    audio.play('place')
  }

  private livingPets(): number {
    return this.pets.filter((pet) => pet.alive).length
  }

  private noteWave(waveNumber: number): void {
    if (this.waveLog.some((row) => row.wave === waveNumber)) return
    const def = WAVES[waveNumber - 1]
    this.waveLog.push({
      wave: waveNumber,
      gold: this.gold,
      kills: this.kills,
      leaks: this.leaks,
      pets: this.livingPets(),
      rescues: this.rescues,
      abductions: this.abductions,
      came: def ? wavePreview(def).replaceAll('\n', ' | ') : '',
    })
  }

  startWave(bonus: boolean): void {
    if (this.phase !== 'ready' && this.phase !== 'breather') return
    if (bonus && this.phase === 'breather' && this.countdown > 0.75) this.gold += earlyBonus(this.waveIndex)
    const preview = wavePreview(WAVES[this.waveIndex])
    this.bannerTitle = this.waveIndex === WAVES.length - 1 ? 'Boss wave' : `Wave ${this.waveIndex + 1}`
    this.bannerBody = preview
    this.bannerT = 1.7
    this.phase = 'wave'
    this.waveTime = 0
    this.spawnIndex = 0
    this.schedule = []
    let time = 0.35
    for (const group of WAVES[this.waveIndex].groups) {
      for (let i = 0; i < group.count; i++) {
        this.schedule.push({ time, kind: group.kind, entry: group.entry ?? 0, hpMul: group.hpMul ?? 1 })
        time += group.interval
      }
      time += 0.4
    }
    audio.play('wave')
    this.refreshHud()
  }

  toggleSpeed(): void {
    audio.unlock()
    audio.play('click')
    this.speedChoice = this.speedChoice === 1 ? 2 : 1
    this.forcedScale = null
    this.refreshHud()
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
    if (this.phase === 'victory' || this.phase === 'defeat') return false
    const cell = this.map.cells.get(cellKey(x, z))
    if (!cell) return false
    if (part === 'base') return this.placeBase(cell)
    if (part === 'sell') return this.sell(cell)
    if (part === 'upgrade') return this.buyUpgrade(cell)
    return this.buyPart(cell, part)
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
    this.dismissHint()
    audio.play('place')
    audio.play('thud')
    this.fx.burst(cell.x, 0.3, cell.z, 0xe6d2a8, 12, 2)
    this.shake = Math.max(this.shake, 0.04)
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
    audio.play('click')
    this.fx.popup(cell.x, 0.8, cell.z, `+${refund}`, '#fff1b8')
    this.syncSelection()
    this.refreshHud()
    return true
  }

  private towerAt(x: number, z: number): Tower | undefined {
    return this.towers.find((tower) => tower.x === x && tower.z === z)
  }

  private dismissHint(): void {
    if (!this.hint && !this.hintMarker.visible) return
    this.hint = false
    this.hintMarker.visible = false
    localStorage.setItem('tiny-td-hint-v1', '1')
  }

  private syncMarker(): void {
    const show = this.hint && this.towers.length === 0
    this.hintMarker.visible = show
    if (show) this.hintMarker.position.set(this.map.hint.x, 1.15, this.map.hint.z)
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
    if (!cell || this.phase === 'victory' || this.phase === 'defeat') return null
    const tower = this.towerAt(cell.x, cell.z)
    if (tower) {
      const stats = tower.stats()
      const actions: ActionButton[] = []
      const layers = tower.middles.length + (tower.roof ? 1 : 0)
      const nextTier = tower.tier >= MAX_UPGRADE ? null : UPGRADE_COST[tower.tier]
      actions.push({
        id: 'upgrade',
        label: 'Upgrade',
        effect: nextTier == null ? 'Maxed' : `Tier ${tower.tier + 1}`,
        detail: 'Stronger shots. The weapon grows and the trim changes color.',
        cost: nextTier == null ? 'Max' : String(nextTier),
        enabled: nextTier != null && this.gold >= nextTier,
        tone: 'yellow',
      })
      for (const id of ['a', 'b', 'c'] as MiddleId[]) {
        const def = MIDDLES[id]
        const cost = stackCost(def.cost, layers)
        actions.push({
          id: `middle-${id}`,
          label: def.label,
          effect: MIDDLE_EFFECT[id],
          detail: def.blurb,
          cost: String(cost),
          enabled: this.gold >= cost && tower.middles.length < MAX_MIDDLES,
          tone: 'blue',
        })
      }
      for (const id of ['a', 'b', 'c'] as RoofId[]) {
        const def = ROOFS[id]
        const cost = stackCost(def.cost, layers)
        actions.push({
          id: `roof-${id}`,
          label: def.label,
          effect: ROOF_EFFECT[id],
          detail: def.blurb,
          cost: String(cost),
          enabled: this.gold >= cost,
          tone: 'yellow',
        })
      }
      for (const id of ['ballista', 'cannon', 'catapult', 'turret'] as WeaponId[]) {
        const def = WEAPONS[id]
        actions.push({
          id,
          label: def.label,
          effect: WEAPON_EFFECT[id],
          detail: def.blurb,
          cost: String(def.cost),
          enabled: this.gold >= def.cost,
          tone: 'green',
        })
      }
      const refund = Math.floor(tower.spent * SELL_RATIO)
      actions.push({
        id: 'sell',
        label: 'Sell',
        effect: 'Refund',
        detail: 'Returns half of what this tower cost.',
        cost: `+${refund}`,
        enabled: true,
        tone: 'red',
      })
      const weapon = tower.weapon ? WEAPONS[tower.weapon].label : 'No weapon'
      const rate = stats.cooldown < 100 ? `${(1 / stats.cooldown).toFixed(1)}/s` : '—'
      const tier = tower.tier > 0 ? ` · tier ${tower.tier}` : ''
      return {
        title: 'Your tower',
        blurb: '',
        stats: `Range ${stats.range.toFixed(1)} · ${rate} · ${weapon}${tier}`,
        actions,
      }
    }
    if (cell.kind === 'build') {
      return {
        title: 'Open grass',
        blurb: '',
        stats:
          this.towers.length >= MAX_TOWERS
            ? `${MAX_TOWERS} towers already`
            : `${this.towers.length}/${MAX_TOWERS} towers`,
        actions: [
          {
            id: 'base',
            label: 'Base',
            effect: 'Place',
            detail: 'The foot of a tower. Add a weapon or it will not fire.',
            cost: String(BASE_COST),
            enabled: this.gold >= BASE_COST && this.towers.length < MAX_TOWERS,
            tone: 'green',
          },
        ],
      }
    }
    const titles: Record<MapCell['kind'], string> = {
      path: 'Path',
      spawn: 'UFO gate',
      goal: 'Pet pen',
      pen: 'Pet pen',
      block: 'Blocked',
      build: 'Grass',
    }
    return {
      title: titles[cell.kind],
      blurb: '',
      stats: cell.kind === 'block' ? 'Not buildable' : 'UFOs fly this way',
      actions: [],
    }
  }

  private refreshHud(): void {
    const playing = this.phase === 'ready' || this.phase === 'breather'
    let startLabel = 'Call wave'
    if (this.phase === 'breather') {
      const secs = Math.max(0, Math.ceil(this.countdown))
      const bonus = earlyBonus(this.waveIndex)
      startLabel = this.countdown > 0.75 ? `Call +${bonus} · ${secs}s` : 'Call wave'
    } else if (this.phase === 'wave') {
      startLabel = `${this.enemies.length} UFOs`
    } else if (this.phase === 'victory') startLabel = 'Clear'
    else if (this.phase === 'defeat') startLabel = 'Over'
    const waveNo = Math.min(this.waveIndex + 1, WAVES.length)
    const preview = playing && this.waveIndex < WAVES.length ? wavePreview(WAVES[this.waveIndex]) : null
    const stars = starCount(this.livingPets())
    let waveLabel = `Wave ${waveNo}/${WAVES.length}`
    if (this.phase === 'breather') waveLabel += ` · ${Math.max(0, Math.ceil(this.countdown))}s`
    if (this.phase === 'victory') waveLabel = 'All clear'
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
      hint: this.hint && this.towers.length === 0,
      startLabel,
      startEnabled: playing,
      preview,
      bannerTitle: this.bannerTitle,
      bannerBody: this.bannerBody,
      selection: this.selectionView(),
      end:
        this.phase === 'victory'
          ? {
              kind: 'win',
              title: 'The pets are safe',
              detail:
                stars >= 3
                  ? `All ${WAVES.length} waves held, and every pet waddled home.`
                  : `All ${WAVES.length} waves held. ${this.livingPets()} pets made it home.`,
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
    })
  }

  private win(): void {
    if (this.phase === 'victory' || this.phase === 'defeat') return
    this.phase = 'victory'
    for (const pet of this.pets) {
      if (!pet.alive) continue
      pet.play('dance')
      this.fx.burst(pet.home.x, 0.5, pet.home.z, 0xffe08a, 10, 2)
    }
    audio.duck(true)
    audio.play('win')
    this.syncSelection()
  }

  private lose(): void {
    if (this.phase === 'victory' || this.phase === 'defeat') return
    this.phase = 'defeat'
    this.noteWave(Math.min(this.waveIndex + 1, WAVES.length))
    audio.duck(true)
    audio.play('lose')
    this.syncSelection()
  }

  retry(): void {
    for (const tower of this.towers) this.scene.remove(tower.group)
    for (const enemy of this.enemies) this.scene.remove(enemy.group)
    for (const proj of this.projectiles) this.scene.remove(proj.mesh)
    for (const pet of this.pets) this.scene.remove(pet.group)
    for (const carry of this.carries) {
      this.scene.remove(carry.beam)
      this.scene.remove(carry.burst)
      this.scene.remove(carry.glow)
    }
    this.towers = []
    this.enemies = []
    this.pets = []
    this.projectiles = []
    this.carries = []
    this.pending = []
    this.rescues = 0
    this.abductions = 0
    this.waveLog = []
    this.effectiveAt.clear()
    this.bannerTitle = null
    this.bannerBody = null
    this.bannerT = 0
    this.gold = START_GOLD
    this.phase = 'ready'
    this.waveIndex = 0
    this.countdown = 0
    this.kills = 0
    this.leaks = 0
    this.spawned = 0
    this.schedule = []
    this.spawnIndex = 0
    this.speedChoice = 1
    this.forcedScale = null
    this.selected = null
    this.userCam = false
    this.cameraLock = null
    this.applyFraming(true)
    audio.duck(false)
    this.spawnPets()
    this.syncMarker()
    this.syncSelection()
    this.refreshHud()
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
        wave: Math.min(this.waveIndex + 1, WAVES.length),
        waves: WAVES.length,
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
        zoom: Math.round(this.distance * 10) / 10,
        log: this.waveLog.map((row) => ({ ...row })),
      }),
      cellKind: (x, z) => this.map.cells.get(cellKey(x, z))?.kind ?? null,
      project: (x, z, y = 0.4) => {
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
        this.waveIndex = WAVES.length - 1
        this.bannerTitle = 'Boss wave'
        this.bannerBody = wavePreview(WAVES[WAVES.length - 1])
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
        this.bannerBody = null
        this.refreshHud()
      },
      debugPop: () => {
        this.phase = 'wave'
        const scout = this.spawnEnemy('scout', 1, 0.48)
        const tank = this.spawnEnemy('tank', 1, 0.4)
        this.fx.popup(scout.pos.x, scout.pos.y + 0.9, scout.pos.z, 'Effective!', '#b6ff8a', 30)
        this.fx.popup(scout.pos.x + 0.15, scout.pos.y + 0.45, scout.pos.z, '14', '#fff6ea', 30)
        this.fx.popup(tank.pos.x, tank.pos.y + 0.5, tank.pos.z, '9', '#fff6ea', 30)
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
      debugLose: () => this.lose(),
      retry: () => this.retry(),
    }
  }
}
