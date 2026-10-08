import * as THREE from 'three'
import { heartTexture, spawnPet, type PetInstance } from './assets'

export interface PetSpot {
  model: string
  x: number
  z: number
  scale: number
}

export const PET_SPOTS: PetSpot[] = [
  { model: 'animal-cat', x: 2.42, z: 0.42, scale: 0.32 },
  { model: 'animal-bunny', x: 3.55, z: 0.38, scale: 0.3 },
  { model: 'animal-dog', x: 1.72, z: 0.28, scale: 0.32 },
  { model: 'animal-fox', x: 4.22, z: 0.26, scale: 0.3 },
  { model: 'animal-chick', x: 3.02, z: 0.12, scale: 0.26 },
]

let petHeart: THREE.SpriteMaterial | null = null

function petHeartMat(): THREE.SpriteMaterial {
  if (!petHeart) {
    petHeart = new THREE.SpriteMaterial({
      map: heartTexture(),
      transparent: true,
      depthWrite: false,
      alphaTest: 0.35,
      toneMapped: false,
    })
  }
  return petHeart
}

export class Pet {
  readonly home = new THREE.Vector3()
  readonly group = new THREE.Group()
  readonly badge: THREE.Sprite
  alive = true
  reserved = false
  private instance: PetInstance
  private mode: 'idle' | 'ride' | 'fall' | 'walk' = 'idle'
  private nervous = false
  private clock = 0
  private walkT = 0

  constructor(spot: PetSpot) {
    this.home.set(spot.x, 0, spot.z)
    this.instance = spawnPet(spot.model)
    this.instance.root.scale.setScalar(spot.scale)
    this.instance.root.position.y = this.instance.foot * spot.scale
    this.group.add(this.instance.root)
    this.badge = new THREE.Sprite(petHeartMat())
    this.badge.center.set(0.5, 0)
    this.badge.scale.set(0.36, 0.36, 1)
    this.badge.position.y = 1.15
    this.badge.renderOrder = 8
    this.badge.visible = false
    this.group.add(this.badge)
    this.group.position.copy(this.home)
    this.group.rotation.y = 0.15 + Math.random() * 0.4
  }

  update(dt: number): void {
    this.clock += dt
    this.instance.mixer.update(dt)
    this.badge.visible = this.mode === 'ride' || this.mode === 'fall'
    if (this.mode === 'ride') return
    if (this.mode === 'fall') {
      this.group.position.y = Math.max(0, this.group.position.y - dt * 2.4)
      this.group.rotation.y += dt * 2.2
      this.group.rotation.z = Math.sin(this.clock * 8) * 0.12
      if (this.group.position.y <= 0) {
        this.group.position.y = 0
        this.group.rotation.z = 0
        this.mode = 'walk'
        this.walkT = 0
      }
      return
    }
    if (this.mode === 'walk') {
      this.walkT += dt
      const dx = this.home.x - this.group.position.x
      const dz = this.home.z - this.group.position.z
      const dist = Math.hypot(dx, dz)
      if (dist < 0.06 || this.walkT > 3) {
        this.group.position.copy(this.home)
        this.group.rotation.z = 0
        this.mode = 'idle'
        this.instance.play('idle')
        return
      }
      const step = Math.min(dist, dt * 0.85)
      this.group.position.x += (dx / dist) * step
      this.group.position.z += (dz / dist) * step
      this.group.rotation.y = Math.atan2(dx, dz)
      this.group.position.y = Math.abs(Math.sin(this.walkT * 12)) * 0.05
      return
    }
    if (this.nervous && !this.reserved) {
      this.group.rotation.z = Math.sin(this.clock * 16) * 0.12
      this.group.position.y = Math.abs(Math.sin(this.clock * 12)) * 0.045
    } else if (!this.reserved) {
      this.group.rotation.z = Math.sin(this.clock * 2.4) * 0.03
      this.group.position.y = Math.abs(Math.sin(this.clock * 3.1)) * 0.035
    }
  }

  play(name: string): void {
    this.instance.play(name)
  }

  setNervous(on: boolean): void {
    if (!this.alive || this.reserved || this.mode !== 'idle') return
    if (on === this.nervous) return
    this.nervous = on
    this.instance.play(on ? 'gesture-negative' : 'idle')
  }

  ride(): void {
    this.mode = 'ride'
    this.reserved = true
  }

  /** Drop from the UFO, then waddle back to the pen. */
  parachute(x: number, y: number, z: number): void {
    this.reserved = false
    this.nervous = false
    this.group.position.set(x, Math.max(0.4, y), z)
    this.group.rotation.z = 0
    this.mode = 'fall'
    this.instance.play('gesture-positive')
  }
}
