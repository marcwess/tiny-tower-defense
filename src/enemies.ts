import * as THREE from 'three'
import { blobTexture, spawnModel, tintModel } from './assets'
import { ENEMIES, type EnemyKind } from './config'
import type { XZ } from './pathing'

let nextId = 1

export class Enemy {
  readonly id = nextId++
  readonly kind: EnemyKind
  hp: number
  readonly maxHp: number
  shield: number
  readonly maxShield: number
  reward: number
  readonly speed: number
  readonly radius: number
  readonly flying: boolean
  waypoint = 0
  segT = 0
  alive = true
  abducting = false
  fleeing = false
  carrying = false
  fleeSpeed = 0.46
  slowTimer = 0
  slowFactor = 1
  flash = 0
  readonly pos = new THREE.Vector3()
  readonly vel = new THREE.Vector3()
  readonly group = new THREE.Group()
  private readonly model: THREE.Object3D
  private readonly bar: THREE.Group
  private readonly barFg: THREE.Mesh
  private readonly shieldFg: THREE.Mesh | null
  private readonly bubble: THREE.Mesh | null
  private bob: number
  private readonly baseY: number
  private readonly scale: number

  constructor(kind: EnemyKind, scale = 1) {
    this.kind = kind
    const def = ENEMIES[kind]
    this.hp = def.hp * scale
    this.maxHp = this.hp
    this.shield = def.shield * scale
    this.maxShield = this.shield
    this.reward = def.reward
    this.speed = def.speed
    this.radius = def.radius
    this.flying = def.flying
    this.baseY = def.hover
    this.scale = def.scale
    this.bob = Math.random() * Math.PI * 2

    this.model = spawnModel(def.model)
    const gun = spawnModel(def.weapon)
    this.model.add(gun)
    this.model.scale.setScalar(def.scale)
    tintModel(this.model, def.tint)
    this.group.add(this.model)

    if (def.shield > 0) {
      const bubble = new THREE.Mesh(
        new THREE.SphereGeometry(0.62, 14, 10),
        new THREE.MeshBasicMaterial({
          color: 0x9ae7ff,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
        }),
      )
      bubble.position.y = 0.28
      this.model.add(bubble)
      this.bubble = bubble
    } else {
      this.bubble = null
    }

    const blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: blobTexture(),
        transparent: true,
        depthWrite: false,
      }),
    )
    blob.rotation.x = -Math.PI / 2
    blob.position.y = -def.hover + 0.23
    blob.scale.setScalar(0.75 * def.scale + 0.28)
    this.group.add(blob)

    this.bar = new THREE.Group()
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.52, 0.07),
      new THREE.MeshBasicMaterial({ color: 0x1b2430, depthTest: false }),
    )
    this.barFg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.48, 0.045),
      new THREE.MeshBasicMaterial({ color: 0x67e08a, depthTest: false }),
    )
    this.bar.add(bg)
    this.bar.add(this.barFg)
    if (def.shield > 0) {
      this.shieldFg = new THREE.Mesh(
        new THREE.PlaneGeometry(0.48, 0.028),
        new THREE.MeshBasicMaterial({ color: 0x8fd8ff, depthTest: false }),
      )
      this.shieldFg.position.y = 0.055
      this.bar.add(this.shieldFg)
    } else {
      this.shieldFg = null
    }
    this.bar.position.y = def.scale * 0.95 + 0.22
    this.group.add(this.bar)
    this.syncBar()
  }

  currentSpeed(): number {
    if (this.slowTimer <= 0) return this.speed
    if (this.flying) return this.speed * (1 - (1 - this.slowFactor) * 0.4)
    return this.speed * this.slowFactor
  }

  /** Move along the polyline. `arrived` is the pen. `escaped` is the gate, pet and all. */
  update(dt: number, points: XZ[], time: number): 'walk' | 'arrived' | 'escaped' {
    if (this.slowTimer > 0) this.slowTimer = Math.max(0, this.slowTimer - dt)
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt)
    this.bob += dt * (this.flying ? 2.8 : 3.6)
    if (this.abducting) {
      this.applyFlash()
      this.syncBar()
      return 'walk'
    }
    if (this.fleeing) return this.retreat(dt, points, time)
    if (this.waypoint >= points.length - 1) {
      const end = points[points.length - 1]
      this.pos.set(end.x, this.baseY + Math.sin(this.bob) * 0.04, end.z)
      this.group.position.copy(this.pos)
      return 'arrived'
    }

    let left = this.currentSpeed() * dt
    while (left > 0 && this.waypoint < points.length - 1) {
      const a = points[this.waypoint]
      const b = points[this.waypoint + 1]
      const seg = Math.hypot(b.x - a.x, b.z - a.z) || 0.0001
      const remain = (1 - this.segT) * seg
      if (left >= remain) {
        left -= remain
        this.waypoint += 1
        this.segT = 0
      } else {
        this.segT += left / seg
        left = 0
      }
    }

    if (this.waypoint >= points.length - 1) {
      const end = points[points.length - 1]
      this.pos.set(end.x, this.baseY, end.z)
      this.vel.set(0, 0, 0)
      this.group.position.copy(this.pos)
      this.group.position.y += Math.sin(this.bob) * 0.04
      return 'arrived'
    }

    const a = points[this.waypoint]
    const b = points[this.waypoint + 1]
    const seg = Math.hypot(b.x - a.x, b.z - a.z) || 1
    this.pos.set(a.x + (b.x - a.x) * this.segT, this.baseY, a.z + (b.z - a.z) * this.segT)
    this.vel.set((b.x - a.x) / seg, 0, (b.z - a.z) / seg).multiplyScalar(this.currentSpeed())
    const bob = Math.sin(this.bob) * (this.flying ? 0.11 : 0.055)
    this.group.position.set(this.pos.x, this.pos.y + bob, this.pos.z)
    this.model.rotation.y = Math.atan2(this.vel.x, this.vel.z)
    this.model.rotation.z = Math.sin(time * 3.2 + this.bob) * 0.14
    this.model.rotation.x = Math.sin(time * 2.1 + this.id) * 0.06
    this.bar.position.y = this.scale * 0.95 + 0.22
    this.applyFlash()
    this.syncBar()
    if (this.bubble) {
      const pct = this.maxShield > 0 ? this.shield / this.maxShield : 0
      this.bubble.visible = pct > 0.02
      this.bubble.scale.setScalar(0.85 + pct * 0.25)
    }
    return 'walk'
  }

  private retreat(dt: number, points: XZ[], time: number): 'walk' | 'escaped' {
    let left = this.fleeSpeed * (this.slowTimer > 0 ? this.slowFactor : 1) * dt
    while (left > 0) {
      if (this.segT <= 0.0001) {
        if (this.waypoint <= 0) {
          const start = points[0]
          this.pos.set(start.x, this.baseY, start.z)
          this.group.position.copy(this.pos)
          return 'escaped'
        }
        this.waypoint -= 1
        this.segT = 1
      }
      const a = points[this.waypoint]
      const b = points[this.waypoint + 1]
      const seg = Math.hypot(b.x - a.x, b.z - a.z) || 0.0001
      const remain = this.segT * seg
      if (left >= remain) {
        left -= remain
        this.segT = 0
      } else {
        this.segT -= left / seg
        left = 0
      }
    }
    const a = points[this.waypoint]
    const b = points[Math.min(this.waypoint + 1, points.length - 1)]
    const seg = Math.hypot(b.x - a.x, b.z - a.z) || 1
    this.pos.set(a.x + (b.x - a.x) * this.segT, this.baseY, a.z + (b.z - a.z) * this.segT)
    this.vel.set((a.x - b.x) / seg, 0, (a.z - b.z) / seg).multiplyScalar(this.fleeSpeed)
    const bob = Math.sin(this.bob) * 0.08
    this.group.position.set(this.pos.x, this.pos.y + bob, this.pos.z)
    this.model.rotation.y = Math.atan2(this.vel.x, this.vel.z)
    this.model.rotation.z = Math.sin(time * 2.4 + this.bob) * 0.08
    this.applyFlash()
    this.syncBar()
    if (this.bubble) {
      const pct = this.maxShield > 0 ? this.shield / this.maxShield : 0
      this.bubble.visible = pct > 0.02
      this.bubble.scale.setScalar(0.85 + pct * 0.25)
    }
    return 'walk'
  }

  /** Shield absorbs first. shieldMul above 1 breaks shields faster. */
  damage(amount: number, shieldMul: number): boolean {
    this.flash = 0.18
    let left = amount
    if (this.shield > 0) {
      const toShield = Math.min(this.shield, left * shieldMul)
      this.shield -= toShield
      left = Math.max(0, left - toShield / shieldMul)
    }
    if (left > 0) this.hp -= left
    this.syncBar()
    return this.hp <= 0
  }

  slow(factor: number, duration: number): void {
    if (factor <= 0) return
    if (this.slowTimer <= 0 || factor < this.slowFactor) this.slowFactor = factor
    this.slowTimer = Math.max(this.slowTimer, duration)
  }

  /** Progress used for targeting: further along the path is more urgent. */
  progress(): number {
    return this.waypoint + this.segT
  }

  private applyFlash(): void {
    this.model.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material as THREE.MeshLambertMaterial
      if (mat.emissive) {
        mat.emissive.set(0xfff4ea)
        mat.emissiveIntensity = this.flash > 0 ? 1.35 : 0
      }
    })
    const pulse = 1 + (this.flash > 0 ? this.flash * 1.6 : 0)
    this.model.scale.setScalar(this.scale * pulse)
  }

  private syncBar(): void {
    const hpPct = THREE.MathUtils.clamp(this.hp / this.maxHp, 0, 1)
    this.barFg.scale.x = Math.max(0.001, hpPct)
    this.barFg.position.x = (hpPct - 1) * 0.24
    const color = hpPct > 0.55 ? 0x67e08a : hpPct > 0.28 ? 0xf2c14e : 0xe25b54
    ;(this.barFg.material as THREE.MeshBasicMaterial).color.set(color)
    if (this.shieldFg && this.maxShield > 0) {
      const pct = THREE.MathUtils.clamp(this.shield / this.maxShield, 0, 1)
      this.shieldFg.scale.x = Math.max(0.001, pct)
      this.shieldFg.position.x = (pct - 1) * 0.24
      this.shieldFg.visible = pct > 0.02
    }
  }

  billboard(camera: THREE.Camera): void {
    this.bar.quaternion.copy(camera.quaternion)
  }
}
