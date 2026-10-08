import * as THREE from 'three'
import { arrowTexture, loadAssets, spawnModel } from './assets'
import { audio } from './audio'
import {
  BASE_COST,
  BASE_RANGE,
  BREATHER_SECONDS,
  CLEAR_BONUS,
  EARLY_BONUS,
  ENEMIES,
  MAX_MIDDLES,
  MAX_TOWERS,
  MIDDLES,
  PET_COUNT,
  ROOFS,
  SELL_RATIO,
  START_GOLD,
  WAVES,
  WEAPONS,
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
  vsBrute: number
  homing: boolean
  speed: number
  target: Enemy | null
  hit: Set<number>
  alive: boolean
}

interface Abduction {
  enemy: Enemy
  pet: Pet
  time: number
  beam: THREE.Object3D
  burst: THREE.Object3D
  glow: THREE.Mesh
  spark: number
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
  private abduction: Abduction | null = null
  private queue: Enemy[] = []
  private highlight: THREE.Mesh
  private rangeMesh: THREE.Mesh
  private hintMarker: THREE.Sprite
  private selected: MapCell | null = null
  private phase: Phase = 'ready'
  private gold = START_GOLD
  private waveIndex = 0
  private countdown = 0
  private waveTime = 0
  private schedule: { time: number; kind: EnemyKind }[] = []
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
  private target = new THREE.Vector3(3, 0.35, 4.35)
  private distance = 16
  private visualTime = 0
  private readonly pitch = 0.78
  private readonly azimuth = 2.25
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
    this.renderer.toneMappingExposure = 1.08
    this.renderer.setPixelRatio(quality.pixelRatio)
    if (quality.shadows) {
      this.renderer.shadowMap.enabled = true
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    }
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.12, 90)
    this.app.prepend(this.renderer.domElement)
    this.hint = localStorage.getItem('tiny-td-hint-v1') !== '1'

    this.scene.background = skyTexture()
    this.scene.fog = new THREE.Fog(0xf3d7b4, 28, 58)
    this.scene.add(new THREE.AmbientLight(0xfff3e2, 0.38))
    this.scene.add(new THREE.HemisphereLight(0xfff6ea, 0x7ea35a, 0.62))
    const sun = new THREE.DirectionalLight(0xfff1d2, 1.85)
    sun.position.set(7.5, 14, 3.5)
    sun.target.position.set(3, 0, 5)
    if (quality.shadows) {
      sun.castShadow = true
      sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize)
      sun.shadow.camera.near = 4
      sun.shadow.camera.far = 32
      sun.shadow.camera.left = -8
      sun.shadow.camera.right = 8
      sun.shadow.camera.top = 9
      sun.shadow.camera.bottom = -9
      sun.shadow.bias = -0.0004
      sun.shadow.normalBias = 0.028
      sun.shadow.radius = 2
    }
    this.scene.add(sun)
    this.scene.add(sun.target)
    const fill = new THREE.DirectionalLight(0xc5e4ff, 0.28)
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
    if (!this.userCam) this.distance = this.fitDistance()
    this.clampCamera()
  }

  private fitDistance(): number {
    const aspect = this.camera.aspect
    if (aspect < 0.62) return 16.4
    if (aspect < 0.9) return 14.6
    if (aspect < 1.25) return 13.4
    return 12.6
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
    this.camera.lookAt(this.target.x, 0.35, this.target.z)
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
    const playing = this.phase === 'ready' || this.phase === 'wave' || this.phase === 'breather'
    if (this.phase === 'wave') this.updateSpawns(dt)
    if (this.phase === 'breather') {
      this.countdown -= dt
      if (this.countdown <= 0) this.startWave(false)
    }
    if (playing) {
      const arrived: Enemy[] = []
      for (const enemy of this.enemies) {
        if (enemy.update(dt, this.map.points, this.time)) arrived.push(enemy)
      }
      for (const enemy of arrived) this.onArrive(enemy)
      this.updateTowers(dt)
      this.updateProjectiles(dt)
      this.flushKills()
      this.updateAbduction(dt)
      this.checkWaveClear()
    } else {
      this.updateAbduction(dt)
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
      this.spawnEnemy(this.schedule[this.spawnIndex].kind)
      this.spawnIndex += 1
      this.spawned += 1
    }
  }

  private spawnEnemy(kind: EnemyKind): Enemy {
    const scale = 1 + this.waveIndex * 0.22
    const enemy = new Enemy(kind, scale)
    enemy.reward = Math.round(enemy.reward * (1 + this.waveIndex * 0.06))
    const start = this.map.points[0]
    enemy.pos.set(start.x, ENEMIES[kind].hover, start.z)
    enemy.group.position.copy(enemy.pos)
    this.enemies.push(enemy)
    this.scene.add(enemy.group)
    return enemy
  }

  private onArrive(enemy: Enemy): void {
    if (!enemy.alive || enemy.abducting) return
    this.leaks += 1
    if (this.livingPets() <= 0) {
      this.removeEnemy(enemy)
      this.lose()
      return
    }
    const pet = this.pets.find((candidate) => candidate.alive && !candidate.reserved)
    if (!pet || this.abduction) {
      enemy.abducting = true
      this.queue.push(enemy)
      return
    }
    this.beginAbduction(enemy, pet)
  }

  private beginAbduction(enemy: Enemy, pet: Pet): void {
    pet.reserved = true
    pet.play('gesture-negative')
    enemy.abducting = true
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
    this.scene.add(beam)
    this.scene.add(burst)
    this.scene.add(glow)
    this.abduction = { enemy, pet, time: 0, beam, burst, glow, spark: 0 }
    audio.play('beam')
    this.shake = Math.max(this.shake, 0.14)
  }

  private updateAbduction(dt: number): void {
    const abduction = this.abduction
    if (!abduction) return
    if (!abduction.enemy.alive) {
      this.cancelAbduction(true)
      return
    }
    abduction.time += dt
    const home = abduction.pet.home
    const enemy = abduction.enemy
    enemy.pos.x += (home.x - enemy.pos.x) * Math.min(1, dt * 3.2)
    enemy.pos.z += (home.z - enemy.pos.z) * Math.min(1, dt * 3.2)
    const hover = enemy.flying ? 2.35 : 2.05
    if (abduction.time < 1.15) enemy.pos.y = hover
    else enemy.pos.y += dt * 2.4
    enemy.group.position.set(enemy.pos.x, enemy.pos.y + Math.sin(this.time * 6) * 0.03, enemy.pos.z)

    const lift = Math.min(1, abduction.time / 0.85)
    const petY = (enemy.pos.y - 0.15) * Math.pow(lift, 1.15)
    abduction.pet.group.position.set(home.x, petY, home.z)
    abduction.pet.group.rotation.y += dt * 2.2
    const height = Math.max(0.25, enemy.pos.y - petY)
    abduction.beam.position.set(home.x, petY, home.z)
    abduction.beam.scale.set(0.22, height, 0.22)
    abduction.burst.position.set(home.x, petY + 0.02, home.z)
    abduction.burst.rotation.y += dt * 5
    abduction.burst.scale.setScalar(0.42 + Math.sin(abduction.time * 24) * 0.04)
    abduction.glow.position.set(home.x, petY + height * 0.5, home.z)
    abduction.glow.scale.set(1, height, 1)
    abduction.glow.rotation.y += dt * 2.4
    abduction.pet.group.rotation.z = Math.sin(abduction.time * 16) * 0.18
    if (abduction.time - abduction.spark > 0.1) {
      abduction.spark = abduction.time
      this.fx.burst(home.x, petY + Math.random() * height, home.z, 0xe7fbff, 2, 0.8)
    }

    if (abduction.time >= 1.7) this.finishAbduction()
  }

  private finishAbduction(): void {
    const abduction = this.abduction
    if (!abduction) return
    abduction.pet.alive = false
    abduction.pet.reserved = false
    this.scene.remove(abduction.pet.group)
    this.scene.remove(abduction.beam)
    this.scene.remove(abduction.burst)
    this.scene.remove(abduction.glow)
    abduction.pet.group.rotation.z = 0
    this.removeEnemy(abduction.enemy)
    this.abduction = null
    if (this.livingPets() <= 0) {
      this.clearQueue()
      this.lose()
      return
    }
    const next = this.queue.shift()
    if (next && next.alive) {
      const pet = this.pets.find((candidate) => candidate.alive && !candidate.reserved)
      if (pet) this.beginAbduction(next, pet)
      else this.removeEnemy(next)
    }
  }

  private cancelAbduction(saved: boolean): void {
    const abduction = this.abduction
    if (!abduction) return
    this.scene.remove(abduction.beam)
    this.scene.remove(abduction.burst)
    this.scene.remove(abduction.glow)
    abduction.pet.group.rotation.z = 0
    if (saved) abduction.pet.dropHome()
    this.abduction = null
    const next = this.queue.shift()
    if (next?.alive) {
      const pet = this.pets.find((candidate) => candidate.alive && !candidate.reserved)
      if (pet) this.beginAbduction(next, pet)
    }
  }

  private clearQueue(): void {
    for (const enemy of this.queue) this.removeEnemy(enemy)
    this.queue.length = 0
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
      const progress = enemy.progress()
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
      vsBrute: stats.vsBrute,
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
        this.strike(proj, enemy)
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

  private strike(proj: Projectile, enemy: Enemy): void {
    const amount = enemy.kind === 'brute' ? proj.damage * proj.vsBrute : proj.damage
    const killed = enemy.damage(amount, proj.shieldMul)
    if (proj.slow > 0) enemy.slow(Math.max(0.35, 1 - proj.slow), 1.45)
    proj.hit.add(enemy.id)
    proj.pierce -= 1
    proj.damage *= 0.72
    audio.play('hit')
    this.fx.burst(enemy.pos.x, enemy.pos.y + 0.1, enemy.pos.z, 0xfff0b0, 7, 2.4)
    if (killed) this.pending.push(enemy)
  }

  private splash(proj: Projectile, origin: THREE.Vector3): void {
    for (const enemy of [...this.enemies]) {
      if (!enemy.alive || proj.hit.has(enemy.id)) continue
      const dist = Math.hypot(enemy.pos.x - origin.x, enemy.pos.z - origin.z)
      const radius = proj.splash + enemy.radius * 0.4
      if (dist > radius) continue
      const falloff = 1 - dist / radius
      const splashDamage = (enemy.kind === 'brute' ? proj.damage * proj.vsBrute : proj.damage) * (0.5 + 0.5 * falloff)
      const killed = enemy.damage(splashDamage, proj.shieldMul)
      if (proj.slow > 0) enemy.slow(Math.max(0.4, 1 - proj.slow * 0.8), 1.2)
      proj.hit.add(enemy.id)
      if (killed) this.pending.push(enemy)
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
    this.fx.burst(enemy.pos.x, enemy.pos.y, enemy.pos.z, 0xfff2c4, 14, 3.4)
    this.fx.puff(enemy.pos.x, enemy.pos.y + 0.15, enemy.pos.z)
    this.fx.ring(enemy.pos.x, enemy.pos.z, 0xffd27a)
    this.flyCoins(enemy.pos, 3)
    audio.play('boom')
    this.shake = Math.max(this.shake, 0.06)
    if (this.abduction?.enemy === enemy) this.cancelAbduction(true)
    this.queue = this.queue.filter((queued) => queued !== enemy)
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
    if (this.enemies.length > 0 || this.abduction || this.queue.length > 0) return
    if (this.livingPets() <= 0) {
      this.lose()
      return
    }
    const cleared = this.waveIndex + 1
    this.waveIndex += 1
    this.gold += CLEAR_BONUS + cleared * 2
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

  startWave(bonus: boolean): void {
    if (this.phase !== 'ready' && this.phase !== 'breather') return
    if (bonus && this.phase === 'breather' && this.countdown > 0.75) this.gold += EARLY_BONUS
    this.phase = 'wave'
    this.waveTime = 0
    this.spawnIndex = 0
    this.schedule = []
    let time = 0.35
    for (const group of WAVES[this.waveIndex].groups) {
      for (let i = 0; i < group.count; i++) {
        this.schedule.push({ time, kind: group.kind })
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
      const cost = MIDDLES[id].cost
      if (this.gold < cost) return false
      this.gold -= cost
      tower.spent += cost
      tower.middles.push(id)
    } else if (part.startsWith('roof-')) {
      const id = part.slice(5)
      if (!isRoof(id)) return false
      const cost = ROOFS[id].cost
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
    audio.play('place')
    this.fx.burst(cell.x, 0.8, cell.z, 0xffe7a8, 10, 2.2)
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
      for (const id of ['a', 'b', 'c'] as MiddleId[]) {
        const def = MIDDLES[id]
        actions.push({
          id: `middle-${id}`,
          label: def.label,
          detail: def.blurb,
          cost: String(def.cost),
          enabled: this.gold >= def.cost && tower.middles.length < MAX_MIDDLES,
          tone: 'blue',
        })
      }
      for (const id of ['a', 'b', 'c'] as RoofId[]) {
        const def = ROOFS[id]
        actions.push({
          id: `roof-${id}`,
          label: def.label,
          detail: def.blurb,
          cost: String(def.cost),
          enabled: this.gold >= def.cost,
          tone: 'yellow',
        })
      }
      for (const id of ['ballista', 'cannon', 'catapult', 'turret'] as WeaponId[]) {
        const def = WEAPONS[id]
        actions.push({
          id,
          label: def.label,
          detail: def.blurb,
          cost: String(def.cost),
          enabled: this.gold >= def.cost,
          tone: 'green',
        })
      }
      const refund = Math.floor(tower.spent * SELL_RATIO)
      actions.push({ id: 'sell', label: 'Sell', detail: 'Refund half', cost: `+${refund}`, enabled: true, tone: 'red' })
      const roof = tower.roof ? ROOFS[tower.roof].label : 'no roof'
      const weapon = tower.weapon ? WEAPONS[tower.weapon].label : 'no weapon'
      const rate = stats.cooldown < 100 ? `${(1 / stats.cooldown).toFixed(1)}/s` : '—'
      return {
        title: 'Your tower',
        blurb: tower.weapon
          ? `${WEAPONS[tower.weapon].blurb} Stack more floors any time.`
          : 'Add a weapon or it will not fire. You can stack during a wave.',
        stats: `Range ${stats.range.toFixed(1)} · ${rate} · ${tower.middles.length} floors · ${weapon} · ${roof}`,
        actions,
      }
    }
    if (cell.kind === 'build') {
      return {
        title: 'Open grass',
        blurb:
          this.towers.length >= MAX_TOWERS
            ? `This meadow holds ${MAX_TOWERS} towers. Stack the ones you have.`
            : 'Place a base, then stack a weapon. Mids change fire rate. Roofs add slow, splash, or shield-break.',
        stats: `Base range ${BASE_RANGE.toFixed(1)} · ${this.towers.length}/${MAX_TOWERS} towers`,
        actions: [
          {
            id: 'base',
            label: 'Build',
            detail: 'Place a base',
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
      blurb:
        cell.kind === 'block'
          ? 'Trees, rocks, crystals, and the river are not buildable.'
          : 'UFOs fly this way. If one reaches the pen it beams a pet away.',
      stats: '',
      actions: [],
    }
  }

  private refreshHud(): void {
    const playing = this.phase === 'ready' || this.phase === 'breather'
    let startLabel = 'Start wave'
    if (this.phase === 'breather') {
      const secs = Math.max(0, Math.ceil(this.countdown))
      startLabel = this.countdown > 0.75 ? `Start +${EARLY_BONUS} · ${secs}s` : 'Start wave'
    } else if (this.phase === 'wave') {
      startLabel = `${this.enemies.length} UFOs`
    } else if (this.phase === 'victory') startLabel = 'Clear'
    else if (this.phase === 'defeat') startLabel = 'Over'
    const waveNo = Math.min(this.waveIndex + 1, WAVES.length)
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
      hint: this.hint && this.towers.length === 0,
      startLabel,
      startEnabled: playing,
      selection: this.selectionView(),
      end:
        this.phase === 'victory'
          ? {
              kind: 'win',
              title: 'The pets are safe',
              detail: `All ${WAVES.length} waves held. The pen is still full enough to cheer.`,
            }
          : this.phase === 'defeat'
            ? {
                kind: 'lose',
                title: 'The pen is empty',
                detail: `A UFO beamed the last pet away on wave ${waveNo}.`,
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
    audio.duck(true)
    audio.play('lose')
    this.syncSelection()
  }

  retry(): void {
    for (const tower of this.towers) this.scene.remove(tower.group)
    for (const enemy of this.enemies) this.scene.remove(enemy.group)
    for (const proj of this.projectiles) this.scene.remove(proj.mesh)
    for (const pet of this.pets) this.scene.remove(pet.group)
    if (this.abduction) {
      this.scene.remove(this.abduction.beam)
      this.scene.remove(this.abduction.burst)
    }
    this.towers = []
    this.enemies = []
    this.pets = []
    this.projectiles = []
    this.queue = []
    this.abduction = null
    this.pending = []
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
    this.distance = this.fitDistance()
    this.target.set(3, 0.35, 4.35)
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
        fps: Math.round(this.fps),
        zoom: Math.round(this.distance * 10) / 10,
      }),
      cellKind: (x, z) => this.map.cells.get(cellKey(x, z))?.kind ?? null,
      project: (x, z) => {
        _v.set(x, 0.4, z).project(this.camera)
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
        const enemy = this.spawnEnemy('warden')
        const goal = this.map.points[this.map.points.length - 1]
        enemy.waypoint = this.map.points.length - 1
        enemy.pos.set(goal.x, 1.15, goal.z)
        enemy.group.position.copy(enemy.pos)
        const pet = this.pets.find((candidate) => candidate.alive && !candidate.reserved)
        if (pet) this.beginAbduction(enemy, pet)
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
      },
      debugWin: () => this.win(),
      debugLose: () => this.lose(),
      retry: () => this.retry(),
    }
  }
}
