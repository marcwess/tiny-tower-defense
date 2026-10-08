import * as THREE from 'three'
import { spawnPet, type PetInstance } from './assets'

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

export class Pet {
  readonly home = new THREE.Vector3()
  readonly group = new THREE.Group()
  alive = true
  reserved = false
  private instance: PetInstance
  private returning = 0
  private nervous = false
  private clock = 0

  constructor(spot: PetSpot) {
    this.home.set(spot.x, 0, spot.z)
    this.instance = spawnPet(spot.model)
    this.instance.root.scale.setScalar(spot.scale)
    this.instance.root.position.y = this.instance.foot * spot.scale
    this.group.add(this.instance.root)
    this.group.position.copy(this.home)
    this.group.rotation.y = 0.15 + Math.random() * 0.4
  }

  update(dt: number): void {
    this.clock += dt
    this.instance.mixer.update(dt)
    if (this.nervous && !this.reserved && this.returning === 0) {
      this.group.rotation.z = Math.sin(this.clock * 16) * 0.12
      this.group.position.y = Math.abs(Math.sin(this.clock * 12)) * 0.045
    } else if (!this.reserved) {
      this.group.rotation.z = 0
      if (this.returning === 0) this.group.position.y = 0
    }
    if (this.returning > 0) {
      this.returning = Math.max(0, this.returning - dt)
      const k = 1 - this.returning / 0.35
      this.group.position.lerpVectors(this.group.position, this.home, 0.2 + k * 0.15)
      if (this.returning === 0) {
        this.group.position.copy(this.home)
        this.instance.play('idle')
      }
    }
  }

  play(name: string): void {
    this.instance.play(name)
  }

  setNervous(on: boolean): void {
    if (!this.alive || this.reserved || this.returning > 0) return
    if (on === this.nervous) return
    this.nervous = on
    this.instance.play(on ? 'gesture-negative' : 'idle')
  }

  dropHome(): void {
    this.reserved = false
    this.nervous = false
    this.returning = 0.35
    this.instance.play('gesture-positive')
  }
}
