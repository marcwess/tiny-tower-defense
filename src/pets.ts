import * as THREE from 'three'
import { spawnPet, type PetInstance } from './assets'

export interface PetSpot {
  model: string
  x: number
  z: number
  scale: number
}

export const PET_SPOTS: PetSpot[] = [
  { model: 'animal-cat', x: 2.68, z: 0.16, scale: 0.42 },
  { model: 'animal-bunny', x: 3.34, z: 0.18, scale: 0.4 },
  { model: 'animal-dog', x: 2.05, z: -0.02, scale: 0.42 },
  { model: 'animal-fox', x: 3.9, z: 0.04, scale: 0.4 },
  { model: 'animal-chick', x: 3.02, z: -0.18, scale: 0.36 },
]

export class Pet {
  readonly home = new THREE.Vector3()
  readonly group = new THREE.Group()
  alive = true
  reserved = false
  private instance: PetInstance
  private returning = 0

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
    this.instance.mixer.update(dt)
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

  dropHome(): void {
    this.reserved = false
    this.returning = 0.35
    this.instance.play('gesture-positive')
  }
}
