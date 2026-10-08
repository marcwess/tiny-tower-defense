import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { contactShadow, spawnModel } from './assets'
import { COLS, ROWS } from './config'
import { levelById, type LevelDef } from './levels'
import { validatePath, waypoints, type PathTile, type XZ } from './pathing'

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

export function buildMap(level: LevelDef = levelById(1)): BuiltMap {
  validatePath(level.path)
  const ground = level.biome === 'snow' ? 'snow-tile' : 'tile'
  const cells = new Map<string, MapCell>()
  for (let z = 0; z < ROWS; z++) {
    for (let x = 0; x < COLS; x++) {
      cells.set(cellKey(x, z), { x, z, model: ground, rot: 0, kind: 'build' })
    }
  }
  for (const paint of level.paint) {
    cells.set(cellKey(paint.x, paint.z), {
      x: paint.x,
      z: paint.z,
      model: paint.model,
      rot: paint.rot ?? 0,
      kind: paint.kind,
    })
  }
  level.path.forEach((tile, index) => {
    const kind: CellKind = index === 0 ? 'spawn' : index === level.path.length - 1 ? 'goal' : 'path'
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
    if (cell.model.includes('river') && level.biome !== 'snow') {
      const water = makeWater(cell.model.includes('bridge'), waterMaps)
      water.userData.keep = true
      mesh.add(water)
    }
    if (/tree|rock|hill|crystal/.test(cell.model)) {
      const wide = cell.model.includes('double') || cell.model.includes('crystal')
      mesh.add(contactShadow(wide ? 0.58 : 0.42))
    }
    group.add(mesh)

    const pick = new THREE.Mesh(pickGeo, pickMat)
    pick.rotation.x = -Math.PI / 2
    pick.position.set(cell.x, 0.3, cell.z)
    pick.userData.cell = cell
    pick.visible = false
    group.add(pick)
    picks.push(pick)
  }

  group.add(makeIsland(level.biome))
  if (level.biome === 'snow') {
    const bridge = level.path.find((tile) => tile.model.includes('bridge'))
    group.add(makeIceRibbon(bridge?.x ?? 2, waterMaps))
  }
  const clouds = makeClouds()
  for (const cloud of clouds) group.add(cloud)

  bakeStatic(group)

  return {
    group,
    picks,
    cells,
    path: level.path,
    points: waypoints(level.path),
    hint: level.hint,
    clouds,
    waterMaps,
  }
}

/** Merge repeated tiles, trees and rocks that share a material into one draw. */
function bakeStatic(root: THREE.Object3D): void {
  root.updateMatrixWorld(true)
  const hoist: THREE.Object3D[] = []
  root.traverse((obj) => {
    if (obj.userData.keep && obj.parent && obj.parent !== root) hoist.push(obj)
  })
  for (const obj of hoist) root.attach(obj)

  const buckets = new Map<string, { material: THREE.Material; geos: THREE.BufferGeometry[] }>()
  const doomed: THREE.Mesh[] = []
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || mesh.userData.keep || mesh.userData.cell) return
    let skip = false
    let parent: THREE.Object3D | null = mesh
    while (parent) {
      if (parent.userData.keep) {
        skip = true
        break
      }
      parent = parent.parent
    }
    if (skip || !mesh.geometry) return
    const geom = mesh.geometry.clone()
    geom.applyMatrix4(mesh.matrixWorld)
    const material = mesh.material as THREE.Material
    const key = `${material.uuid}:${mesh.castShadow ? 1 : 0}:${mesh.receiveShadow ? 1 : 0}`
    const bucket = buckets.get(key) ?? { material, geos: [] }
    bucket.geos.push(geom)
    buckets.set(key, bucket)
    doomed.push(mesh)
  })
  for (const mesh of doomed) mesh.parent?.remove(mesh)
  for (const bucket of buckets.values()) {
    const merged = mergeGeometries(bucket.geos, false)
    for (const geom of bucket.geos) geom.dispose()
    if (!merged) continue
    const mesh = new THREE.Mesh(merged, bucket.material)
    mesh.userData.baked = true
    mesh.castShadow = true
    mesh.receiveShadow = true
    root.add(mesh)
  }
}

export function disposeMap(map: BuiltMap): void {
  map.group.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.isMesh && mesh.userData.baked) mesh.geometry.dispose()
  })
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

function iceCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const sheet = ctx.createLinearGradient(0, 0, 0, 256)
  sheet.addColorStop(0, '#8fd4f2')
  sheet.addColorStop(0.42, '#4eafd8')
  sheet.addColorStop(1, '#2f8fbe')
  ctx.fillStyle = sheet
  ctx.fillRect(0, 0, 256, 256)
  ctx.globalAlpha = 0.55
  for (let i = 0; i < 7; i++) {
    const y = 18 + i * 36
    const glint = ctx.createLinearGradient(0, y - 8, 0, y + 10)
    glint.addColorStop(0, 'rgba(255,255,255,0)')
    glint.addColorStop(0.5, 'rgba(236, 250, 255, 0.95)')
    glint.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = glint
    ctx.fillRect(0, y - 8, 256, 16)
  }
  ctx.globalAlpha = 1
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const cracks = [
    [8, 40, 54, 78, 90, 52, 140, 110, 188, 84, 248, 120],
    [12, 200, 70, 164, 118, 188, 170, 150, 230, 176, 250, 150],
    [150, 16, 188, 64, 166, 112, 214, 148, 248, 132],
    [20, 120, 58, 142, 48, 190, 96, 220],
    [110, 8, 98, 70, 146, 48, 132, 96],
    [40, 250, 88, 220, 150, 246],
  ]
  for (const line of cracks) {
    ctx.beginPath()
    ctx.moveTo(line[0], line[1])
    for (let i = 2; i < line.length; i += 2) ctx.lineTo(line[i], line[i + 1])
    ctx.strokeStyle = 'rgba(14, 58, 86, 0.85)'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.strokeStyle = 'rgba(232, 248, 255, 0.9)'
    ctx.lineWidth = 1.2
    ctx.stroke()
  }
  return canvas
}

let sharedIce: THREE.Texture | null = null

function iceTexture(): THREE.Texture {
  if (!sharedIce) sharedIce = scrollingMap(iceCanvas(), 0.008)
  return sharedIce
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

/** Local channel runs along Z, between the dirt banks. Snow uses a still ice sheet. */
function makeWater(bridge: boolean, bucket: THREE.Texture[], frozen = false): THREE.Group {
  if (frozen) return makeIce(bridge, bucket)
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

function makeIce(bridge: boolean, bucket: THREE.Texture[]): THREE.Group {
  const group = new THREE.Group()
  const ice = iceTexture()
  if (!bucket.includes(ice)) bucket.push(ice)
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(bridge ? 0.74 : 0.92, 1.05),
    new THREE.MeshBasicMaterial({ map: ice, depthWrite: true }),
  )
  sheet.rotation.x = -Math.PI / 2
  sheet.position.y = bridge ? 0.2 : 0.25
  sheet.renderOrder = 2
  group.add(sheet)
  return group
}

/** One continuous sheet per bank of the bridge, so tile edges do not cut the ice. */
function makeIceRibbon(bridgeX: number, bucket: THREE.Texture[]): THREE.Group {
  const group = new THREE.Group()
  group.name = 'ice-ribbon'
  group.userData.keep = true
  const ice = iceTexture()
  if (!bucket.includes(ice)) bucket.push(ice)
  const material = new THREE.MeshBasicMaterial({
    map: ice,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  })
  const lay = (x0: number, x1: number, across: number, y: number) => {
    const len = Math.max(0.2, x1 - x0)
    const geo = new THREE.PlaneGeometry(len, across)
    const uv = geo.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 1.15))
    const sheet = new THREE.Mesh(geo, material)
    sheet.rotation.x = -Math.PI / 2
    sheet.position.set((x0 + x1) / 2, y, 5)
    sheet.renderOrder = 2
    sheet.userData.keep = true
    group.add(sheet)
  }
  const gap = 0.58
  lay(-0.2, bridgeX - gap, 0.98, 0.36)
  lay(bridgeX + gap, 6.2, 0.98, 0.36)
  lay(bridgeX - 0.34, bridgeX + 0.34, 0.42, 0.08)
  return group
}

function makeIsland(biome: 'grass' | 'snow'): THREE.Group {
  const group = new THREE.Group()
  const dirt = new THREE.MeshLambertMaterial({ color: biome === 'snow' ? 0xeef3f8 : 0xb57a45 })
  const rock = new THREE.MeshLambertMaterial({ color: biome === 'snow' ? 0xc5d0dc : 0x7d6558 })
  const soil = new THREE.MeshLambertMaterial({ color: biome === 'snow' ? 0x8ea0b4 : 0x5c4336 })
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
    const rockName = biome === 'snow' ? (s > 0.7 ? 'snow-tile-rock' : 'snow-tile-hill') : s > 0.7 ? 'tile-rock' : 'tile-hill'
    const rockMesh = spawnModel(rockName)
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
