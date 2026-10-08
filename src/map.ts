import * as THREE from 'three'
import { contactShadow, spawnModel } from './assets'
import { COLS, ROWS } from './config'
import { HINT_CELL, PATH, type PathTile, validatePath, waypoints, type XZ } from './pathing'

export type CellKind = 'path' | 'build' | 'block' | 'spawn' | 'goal' | 'pen'

export interface MapCell {
  x: number
  z: number
  model: string
  rot: number
  kind: CellKind
}

export interface BuiltMap {
  group: THREE.Group
  picks: THREE.Mesh[]
  cells: Map<string, MapCell>
  path: PathTile[]
  points: XZ[]
  hint: { x: number; z: number }
  clouds: THREE.Sprite[]
  waterMaps: THREE.Texture[]
}

export function cellKey(x: number, z: number): string {
  return `${x},${z}`
}

interface Paint {
  x: number
  z: number
  model: string
  rot?: number
  kind: CellKind
}

const PAINT: Paint[] = [
  { x: 0, z: 10, model: 'tile-tree', kind: 'block' },
  { x: 2, z: 10, model: 'tile-tree-double', kind: 'block' },
  { x: 4, z: 10, model: 'tile-rock', kind: 'block' },
  { x: 5, z: 10, model: 'tile-hill', kind: 'block' },
  { x: 6, z: 10, model: 'tile-tree', kind: 'block' },
  { x: 0, z: 9, model: 'tile-rock', kind: 'block' },
  { x: 3, z: 9, model: 'tile-dirt', kind: 'build' },
  { x: 6, z: 9, model: 'tile-crystal', kind: 'block' },
  { x: 0, z: 8, model: 'tile-hill', kind: 'block' },
  { x: 6, z: 8, model: 'tile-tree-double', kind: 'block' },
  { x: 0, z: 7, model: 'tile-tree', kind: 'block' },
  { x: 1, z: 7, model: 'tile-rock', kind: 'block' },
  { x: 6, z: 7, model: 'tile-crystal', kind: 'block' },
  { x: 0, z: 6, model: 'tile-tree-double', kind: 'block' },
  { x: 6, z: 6, model: 'tile-hill', kind: 'block' },
  { x: 0, z: 5, model: 'tile-river-straight', rot: 1, kind: 'block' },
  { x: 1, z: 5, model: 'tile-river-straight', rot: 1, kind: 'block' },
  { x: 3, z: 5, model: 'tile-river-straight', rot: 1, kind: 'block' },
  { x: 4, z: 5, model: 'tile-river-straight', rot: 1, kind: 'block' },
  { x: 5, z: 5, model: 'tile-river-straight', rot: 1, kind: 'block' },
  { x: 6, z: 5, model: 'tile-river-straight', rot: 1, kind: 'block' },
  { x: 0, z: 4, model: 'tile-tree', kind: 'block' },
  { x: 1, z: 4, model: 'tile-dirt', kind: 'build' },
  { x: 6, z: 4, model: 'tile-rock', kind: 'block' },
  { x: 0, z: 3, model: 'tile-crystal', kind: 'block' },
  { x: 6, z: 3, model: 'tile-tree', kind: 'block' },
  { x: 0, z: 2, model: 'tile-hill', kind: 'block' },
  { x: 3, z: 2, model: 'tile-dirt', kind: 'build' },
  { x: 6, z: 2, model: 'tile-tree-double', kind: 'block' },
  { x: 0, z: 1, model: 'tile-tree', kind: 'block' },
  { x: 6, z: 1, model: 'tile-rock', kind: 'block' },
  { x: 0, z: 0, model: 'tile-tree-double', kind: 'block' },
  { x: 1, z: 0, model: 'tile', kind: 'pen' },
  { x: 2, z: 0, model: 'tile', kind: 'pen' },
  { x: 4, z: 0, model: 'tile', kind: 'pen' },
  { x: 5, z: 0, model: 'tile-hill', kind: 'block' },
  { x: 6, z: 0, model: 'tile-tree', kind: 'block' },
]

export function buildMap(): BuiltMap {
  validatePath(PATH)
  const cells = new Map<string, MapCell>()
  for (let z = 0; z < ROWS; z++) {
    for (let x = 0; x < COLS; x++) {
      cells.set(cellKey(x, z), { x, z, model: 'tile', rot: 0, kind: 'build' })
    }
  }
  for (const paint of PAINT) {
    cells.set(cellKey(paint.x, paint.z), {
      x: paint.x,
      z: paint.z,
      model: paint.model,
      rot: paint.rot ?? 0,
      kind: paint.kind,
    })
  }
  PATH.forEach((tile, index) => {
    const kind: CellKind = index === 0 ? 'spawn' : index === PATH.length - 1 ? 'goal' : 'path'
    cells.set(cellKey(tile.x, tile.z), { x: tile.x, z: tile.z, model: tile.model, rot: tile.rot, kind })
  })

  const group = new THREE.Group()
  group.name = 'map'
  const waterMaps: THREE.Texture[] = []
  const picks: THREE.Mesh[] = []
  const pickGeo = new THREE.PlaneGeometry(0.96, 0.96)
  const pickMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })

  for (const cell of cells.values()) {
    const mesh = spawnModel(cell.model)
    mesh.position.set(cell.x, 0, cell.z)
    mesh.rotation.y = cell.rot * (Math.PI / 2)
    if (cell.model.includes('river')) mesh.add(makeWater(cell.model.includes('bridge'), waterMaps))
    if (/tree|rock|hill|crystal/.test(cell.model)) {
      const wide = cell.model.includes('double') || cell.model.includes('crystal')
      mesh.add(contactShadow(wide ? 0.58 : 0.42))
    }
    group.add(mesh)

    const pick = new THREE.Mesh(pickGeo, pickMat)
    pick.rotation.x = -Math.PI / 2
    pick.position.set(cell.x, 0.3, cell.z)
    pick.userData.cell = cell
    group.add(pick)
    picks.push(pick)
  }

  group.add(makeIsland())
  const clouds = makeClouds()
  for (const cloud of clouds) group.add(cloud)

  return {
    group,
    picks,
    cells,
    path: PATH,
    points: waypoints(PATH),
    hint: HINT_CELL,
    clouds,
    waterMaps,
  }
}

function waveCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const sky = ctx.createLinearGradient(0, 0, 0, 128)
  sky.addColorStop(0, '#8ad8f4')
  sky.addColorStop(0.45, '#3eafdc')
  sky.addColorStop(1, '#6ecff0')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, 256, 128)
  ctx.lineCap = 'round'
  ctx.lineWidth = 3
  for (let row = 0; row < 5; row++) {
    ctx.strokeStyle = row % 2 === 0 ? 'rgba(255, 255, 255, 0.55)' : 'rgba(18, 96, 140, 0.28)'
    ctx.beginPath()
    for (let x = 0; x <= 256; x += 3) {
      const y = 18 + row * 20 + Math.sin(x * 0.045 + row * 1.3) * 4
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  return canvas
}

function foamCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 32
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.clearRect(0, 0, 128, 32)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  for (let i = 0; i < 14; i++) {
    const x = (i / 14) * 128
    ctx.beginPath()
    ctx.ellipse(x, 16, 7, 5, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  return canvas
}

let sharedWaves: THREE.Texture | null = null
let sharedFoam: THREE.Texture | null = null

function waterTextures(): [THREE.Texture, THREE.Texture] {
  if (!sharedWaves || !sharedFoam) {
    sharedWaves = scrollingMap(waveCanvas(), 0.07)
    sharedFoam = scrollingMap(foamCanvas(), 0.045)
  }
  return [sharedWaves, sharedFoam]
}

function scrollingMap(canvas: HTMLCanvasElement, speed: number): THREE.Texture {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.userData.speed = speed
  return tex
}

/** Local channel runs along Z, between the dirt banks. */
function makeWater(bridge: boolean, bucket: THREE.Texture[]): THREE.Group {
  const group = new THREE.Group()
  const [waves, foamTex] = waterTextures()
  if (!bucket.includes(waves)) bucket.push(waves, foamTex)
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(bridge ? 0.74 : 0.92, 1.05),
    new THREE.MeshBasicMaterial({
      map: waves,
      depthWrite: true,
    }),
  )
  water.rotation.x = -Math.PI / 2
  water.position.y = bridge ? 0.17 : 0.232
  water.renderOrder = 2
  group.add(water)

  for (const side of [-1, 1]) {
    const foam = new THREE.Mesh(
      new THREE.PlaneGeometry(0.1, 1.02),
      new THREE.MeshBasicMaterial({
        map: foamTex,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
    )
    foam.rotation.x = -Math.PI / 2
    foam.position.set(side * (bridge ? 0.2 : 0.26), bridge ? 0.19 : 0.246, 0)
    foam.renderOrder = 3
    group.add(foam)
  }
  return group
}

function makeIsland(): THREE.Group {
  const group = new THREE.Group()
  const dirt = new THREE.MeshLambertMaterial({ color: 0xb57a45 })
  const rock = new THREE.MeshLambertMaterial({ color: 0x7d6558 })
  const soil = new THREE.MeshLambertMaterial({ color: 0x5c4336 })
  const slab = new THREE.Mesh(new THREE.BoxGeometry(7.85, 0.62, 11.85), dirt)
  slab.position.set(3, -0.32, 5)
  slab.castShadow = true
  slab.receiveShadow = true
  const crust = new THREE.Mesh(new THREE.BoxGeometry(7.35, 0.42, 11.25), rock)
  crust.position.set(3, -0.78, 5)
  crust.castShadow = true
  crust.receiveShadow = true
  const keel = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.5, 9.7), soil)
  keel.position.set(3, -1.15, 5)
  keel.castShadow = true
  group.add(slab, crust, keel)

  const catcher = new THREE.Mesh(
    new THREE.CircleGeometry(11.5, 48),
    new THREE.ShadowMaterial({ opacity: 0.34 }),
  )
  catcher.rotation.x = -Math.PI / 2
  catcher.position.set(3, -1.55, 5)
  catcher.receiveShadow = true
  group.add(catcher)

  const rocks: Array<[number, number, number, number]> = [
    [-0.55, -0.15, -0.35, 0.7],
    [6.55, -0.2, 10.4, 0.85],
    [-0.4, -0.1, 10.2, 0.55],
    [6.6, -0.18, -0.2, 0.62],
  ]
  for (const [x, y, z, s] of rocks) {
    const rockMesh = spawnModel(s > 0.7 ? 'tile-rock' : 'tile-hill')
    rockMesh.position.set(x, y, z)
    rockMesh.scale.setScalar(s)
    rockMesh.rotation.y = x
    group.add(rockMesh)
  }
  return group
}

function makeClouds(): THREE.Sprite[] {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  const sprites: THREE.Sprite[] = []
  if (!ctx) return sprites
  ctx.clearRect(0, 0, 128, 64)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  for (const [x, y, rx, ry] of [
    [40, 34, 28, 16],
    [68, 30, 34, 18],
    [96, 36, 22, 13],
    [58, 40, 20, 12],
  ] as const) {
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const spots = [
    { x: -1.2, y: 3.4, z: 2.2, s: 2.4 },
    { x: 7.4, y: 4.1, z: 7.5, s: 2.8 },
    { x: 1.2, y: 4.6, z: 11.2, s: 2.2 },
    { x: 8.2, y: 3.2, z: 4.4, s: 1.8 },
  ]
  for (const spot of spots) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9 }),
    )
    sprite.position.set(spot.x, spot.y, spot.z)
    sprite.scale.set(spot.s, spot.s * 0.5, 1)
    sprite.userData.cloud = { x: spot.x, z: spot.z, y: spot.y }
    sprites.push(sprite)
  }
  return sprites
}

export function tickDiorama(map: BuiltMap, time: number): void {
  for (const tex of map.waterMaps) {
    const speed = (tex.userData.speed as number) || 0.05
    tex.offset.x = time * speed
  }
  for (const cloud of map.clouds) {
    const home = cloud.userData.cloud as { x: number; y: number; z: number }
    cloud.position.x = home.x + Math.sin(time * 0.15 + home.z) * 0.35
    cloud.position.y = home.y + Math.sin(time * 0.4 + home.x) * 0.06
  }
}
