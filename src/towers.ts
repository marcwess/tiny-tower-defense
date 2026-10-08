import * as THREE from 'three'
import { contactShadow, spawnModel } from './assets'
import {
  type MiddleId,
  type RoofId,
  type TowerStats,
  type WeaponId,
  towerStats,
} from './config'

const BUILD_STAGES = ['tower-round-build-a', 'tower-round-build-c', 'tower-round-build-e', 'tower-round-build-f']
const SEGMENT = 0.46
const BOTTOM_Y = 0.12

export class Tower {
  readonly group = new THREE.Group()
  middles: MiddleId[] = []
  roof: RoofId | null = null
  weapon: WeaponId | null = null
  tier = 0
  spent = 0
  cooldown = 0
  yaw = 0
  kick = 0
  private scaffoldT = 0
  private scaffoldIndex = -1
  private weaponPivot: THREE.Object3D | null = null
  private pop: THREE.Object3D | null = null
  private popT = 0
  private popBaseY = 0

  constructor(
    readonly x: number,
    readonly z: number,
  ) {
    this.group.position.set(x, 0, z)
    this.group.add(contactShadow(0.5))
    this.startScaffold()
  }

  stats(): TowerStats {
    return towerStats(this.middles, this.roof, this.weapon, this.tier)
  }

  /** First placement plays the kit's build-stage models, then reveals the tower. */
  private startScaffold(): void {
    this.scaffoldT = 0.48
    this.scaffoldIndex = -1
    this.showScaffold(0)
  }

  private showScaffold(index: number): void {
    if (index === this.scaffoldIndex) return
    this.scaffoldIndex = index
    this.clear()
    const model = spawnModel(BUILD_STAGES[index] ?? BUILD_STAGES[0])
    this.group.add(model)
  }

  rebuild(pop: boolean): void {
    this.scaffoldT = 0
    this.buildVisuals(pop)
  }

  private buildVisuals(pop: boolean): void {
    this.clear()
    this.group.add(spawnModel('tower-round-base'))
    if (this.tier > 0) {
      const colors = [0xd08a4a, 0xe07040, 0xf2c14e]
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.46, 0.05, 8, 20),
        new THREE.MeshLambertMaterial({ color: colors[this.tier - 1] ?? colors[2] }),
      )
      ring.rotation.x = Math.PI / 2
      ring.position.y = 0.58
      this.group.add(ring)
    }
    const bottom = spawnModel('tower-round-bottom-a')
    bottom.position.y = BOTTOM_Y
    this.group.add(bottom)

    let cursor = BOTTOM_Y
    let newest: THREE.Object3D | null = null
    for (const middle of this.middles) {
      cursor += SEGMENT
      const piece = spawnModel(`tower-round-middle-${middle}`)
      piece.position.y = cursor
      this.group.add(piece)
      newest = piece
    }
    if (this.roof) {
      cursor += SEGMENT
      const piece = spawnModel(`tower-round-roof-${this.roof}`)
      piece.position.y = cursor
      this.group.add(piece)
      newest = piece
    }

    // Piece platforms sit at local y=0.5; the rest of a roof is a spire. Park the weapon on that ledge.
    const weaponY = cursor + 0.5
    if (this.weapon) {
      const pivot = new THREE.Object3D()
      pivot.position.y = weaponY
      // Toward the default camera (−Z) so the gun sits on the near lip, in front of the spire.
      pivot.position.z = this.roof ? -0.18 : 0
      pivot.rotation.y = this.yaw
      const model = spawnModel(`weapon-${this.weapon}`)
      model.scale.setScalar(1 + this.tier * 0.16)
      pivot.add(model)
      this.group.add(pivot)
      this.weaponPivot = pivot
      newest = pivot
    } else {
      this.weaponPivot = null
    }

    this.pop = pop ? newest : null
    this.popT = pop && newest ? 0.34 : 0
    this.popBaseY = newest?.position.y ?? 0
    if (this.pop) this.pop.scale.setScalar(0.15)
  }

  private clear(): void {
    for (const child of [...this.group.children]) {
      if (child.userData.contact) continue
      this.group.remove(child)
    }
    this.weaponPivot = null
    this.pop = null
  }

  update(dt: number): void {
    if (this.scaffoldT > 0) {
      this.scaffoldT -= dt
      const index = Math.min(BUILD_STAGES.length - 1, Math.floor((0.48 - Math.max(this.scaffoldT, 0)) / 0.12))
      this.showScaffold(index)
      if (this.scaffoldT <= 0) this.buildVisuals(true)
      return
    }
    if (this.pop && this.popT > 0) {
      this.popT = Math.max(0, this.popT - dt)
      const k = 1 - this.popT / 0.34
      const settle = 1 + Math.sin(k * Math.PI) * 0.16 * (1 - k)
      this.pop.scale.setScalar(0.15 + 0.85 * k * settle)
      this.pop.position.y = this.popBaseY + Math.sin(k * Math.PI) * 0.1 * (1 - k)
      if (this.popT === 0) {
        this.pop.scale.setScalar(1)
        this.pop.position.y = this.popBaseY
      }
    }
    if (this.kick > 0) {
      this.kick = Math.max(0, this.kick - dt * 4.5)
      const arm = this.weaponPivot?.getObjectByName('catapult')
      if (arm) arm.rotation.x = -this.kick * 0.75
      const barrel = this.weaponPivot?.getObjectByName('barrel')
      if (barrel) {
        const data = barrel.userData as { baseZ?: number }
        if (data.baseZ === undefined) data.baseZ = barrel.position.z
        const baseZ = data.baseZ ?? 0
        barrel.position.z = baseZ - this.kick * 0.1
      }
    }
  }

  aimAt(x: number, z: number, dt: number): void {
    if (!this.weaponPivot) return
    const target = Math.atan2(x - this.x, z - this.z)
    let delta = target - this.yaw
    while (delta > Math.PI) delta -= Math.PI * 2
    while (delta < -Math.PI) delta += Math.PI * 2
    const step = Math.max(-1, Math.min(1, delta / Math.max(dt * 7, 0.0001))) * dt * 7
    this.yaw += Math.abs(delta) < Math.abs(step) ? delta : step
    this.weaponPivot.rotation.y = this.yaw
  }

  muzzle(out: THREE.Vector3): THREE.Vector3 {
    const named =
      this.weaponPivot?.getObjectByName('barrel') ||
      this.weaponPivot?.getObjectByName('arrow') ||
      this.weaponPivot?.getObjectByName('catapult') ||
      this.weaponPivot
    if (!named) {
      out.set(this.x, 0.8, this.z)
      return out
    }
    named.getWorldPosition(out)
    return out
  }

  onFire(): void {
    this.kick = 1
  }
}
