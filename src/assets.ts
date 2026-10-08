import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'

export function asset(path: string): string {
  const base = import.meta.env.BASE_URL
  return base + path.split('/').map(encodeURIComponent).join('/')
}

const KIT = 'assets/models/tower-defense-kit/'
const PETS = 'assets/models/cube-pets/'

const KIT_MODELS = [
  'tile',
  'tile-straight',
  'tile-corner-round',
  'tile-spawn',
  'tile-end',
  'tile-tree',
  'tile-tree-double',
  'tile-rock',
  'tile-hill',
  'tile-crystal',
  'tile-dirt',
  'tile-river-straight',
  'tile-river-bridge',
  'tower-round-base',
  'tower-round-bottom-a',
  'tower-round-middle-a',
  'tower-round-middle-b',
  'tower-round-middle-c',
  'tower-round-roof-a',
  'tower-round-roof-b',
  'tower-round-roof-c',
  'tower-round-build-a',
  'tower-round-build-c',
  'tower-round-build-e',
  'tower-round-build-f',
  'weapon-ballista',
  'weapon-cannon',
  'weapon-catapult',
  'weapon-turret',
  'weapon-ammo-arrow',
  'weapon-ammo-cannonball',
  'weapon-ammo-boulder',
  'weapon-ammo-bullet',
  'enemy-ufo-a',
  'enemy-ufo-b',
  'enemy-ufo-c',
  'enemy-ufo-d',
  'enemy-ufo-a-weapon',
  'enemy-ufo-b-weapon',
  'enemy-ufo-c-weapon',
  'enemy-ufo-d-weapon',
  'enemy-ufo-beam',
  'enemy-ufo-beam-burst',
]

const PET_MODELS = ['animal-cat', 'animal-bunny', 'animal-dog', 'animal-fox', 'animal-chick']

const templates = new Map<string, THREE.Object3D>()
const petGltf = new Map<string, GLTF>()
const petFoot = new Map<string, number>()
let sharedMat: THREE.MeshLambertMaterial | null = null

export function kitMaterial(): THREE.MeshLambertMaterial {
  if (!sharedMat) throw new Error('Assets not loaded')
  return sharedMat
}

/**
 * Water faces in the kit stretch UVs across the atlas, and those vertices are
 * shared with the banks. Writing a water UV in place smears the atlas (and its
 * black padding) back onto the channel. Split the stretched triangles onto
 * their own vertices, pinned to one water-blue texel.
 */
const WATER_UV = { u: 0.117, v: 0.94 }
/** Bridge decks ship with a black UV at (0, 1). Pin those faces to a flat wood texel. */
const WOOD_UV = { u: 0.03, v: 0.51 }

function configureAtlas(map: THREE.Texture): void {
  map.colorSpace = THREE.SRGBColorSpace
  map.magFilter = THREE.NearestFilter
  map.minFilter = THREE.NearestFilter
  map.generateMipmaps = false
  map.needsUpdate = true
}

function repairRiverUvs(mesh: THREE.Mesh): void {
  const geom = mesh.geometry
  const uv = geom.getAttribute('uv')
  const pos = geom.getAttribute('position')
  if (!uv || !pos) return
  const index = geom.getIndex()
  const normal = geom.getAttribute('normal')
  const triCount = index ? index.count / 3 : pos.count / 3
  const positions = new Float32Array(triCount * 9)
  const uvs = new Float32Array(triCount * 6)
  const normals = normal ? new Float32Array(triCount * 9) : null
  const corner = (tri: number, k: number): number => (index ? index.getX(tri * 3 + k) : tri * 3 + k)

  for (let tri = 0; tri < triCount; tri++) {
    const ids = [corner(tri, 0), corner(tri, 1), corner(tri, 2)]
    let minU = Infinity
    let maxU = -Infinity
    let minV = Infinity
    let maxV = -Infinity
    for (const id of ids) {
      minU = Math.min(minU, uv.getX(id))
      maxU = Math.max(maxU, uv.getX(id))
      minV = Math.min(minV, uv.getY(id))
      maxV = Math.max(maxV, uv.getY(id))
    }
    const smear = maxU - minU + (maxV - minV) >= 0.045
    const blank = maxU < 0.01 && minV > 0.99
    const pin = smear ? WATER_UV : blank ? WOOD_UV : null
    for (let k = 0; k < 3; k++) {
      const id = ids[k]
      const o = (tri * 3 + k) * 3
      positions[o] = pos.getX(id)
      positions[o + 1] = pos.getY(id)
      positions[o + 2] = pos.getZ(id)
      if (normals && normal) {
        normals[o] = normal.getX(id)
        normals[o + 1] = normal.getY(id)
        normals[o + 2] = normal.getZ(id)
      }
      const uo = (tri * 3 + k) * 2
      uvs[uo] = pin ? pin.u : uv.getX(id)
      uvs[uo + 1] = pin ? pin.v : uv.getY(id)
    }
  }

  const next = new THREE.BufferGeometry()
  next.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  next.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  if (normals) next.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  else next.computeVertexNormals()
  next.computeBoundingSphere()
  mesh.geometry = next
  geom.dispose()
}

function adopt(root: THREE.Object3D): void {
  const river = root.name.includes('river')
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const source = mesh.material as THREE.MeshLambertMaterial
    if (!sharedMat) {
      if (source.map) configureAtlas(source.map)
      sharedMat = new THREE.MeshLambertMaterial({ map: source.map, color: 0xffffff })
    }
    mesh.material = sharedMat
    mesh.castShadow = true
    mesh.receiveShadow = true
    if (river || mesh.name.includes('river')) {
      repairRiverUvs(mesh)
      // The channel's shared atlas edges pick up shadow acne that reads as static.
      mesh.receiveShadow = false
    }
  })
}

export async function loadAssets(onProgress: (ratio: number) => void): Promise<void> {
  const loader = new GLTFLoader()
  const jobs: string[] = [
    ...KIT_MODELS.map((name) => KIT + name + '.glb'),
    ...PET_MODELS.map((name) => PETS + name + '.glb'),
  ]
  let done = 0
  await Promise.all(
    jobs.map(async (url) => {
      const gltf = await loader.loadAsync(asset(url))
      const file = url.slice(url.lastIndexOf('/') + 1, -4)
      if (url.includes('cube-pets')) {
        petGltf.set(file, gltf)
        gltf.scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh
          if (!mesh.isMesh) return
          const mat = mesh.material as THREE.MeshLambertMaterial
          if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace
        })
        const box = new THREE.Box3().setFromObject(gltf.scene)
        petFoot.set(file, -box.min.y)
      } else {
        adopt(gltf.scene)
        templates.set(file, gltf.scene)
      }
      done += 1
      onProgress(done / jobs.length)
    }),
  )
  if (!sharedMat) throw new Error('Kit colormap missing')
}

function cloneStatic(src: THREE.Object3D): THREE.Object3D {
  let dst: THREE.Object3D
  const mesh = src as THREE.Mesh
  if (mesh.isMesh) {
    dst = new THREE.Mesh(mesh.geometry, mesh.material)
  } else {
    dst = new THREE.Object3D()
  }
  dst.name = src.name
  dst.visible = src.visible
  dst.matrixAutoUpdate = src.matrixAutoUpdate
  if (!src.matrixAutoUpdate) dst.matrix.copy(src.matrix)
  dst.position.copy(src.position)
  dst.quaternion.copy(src.quaternion)
  dst.scale.copy(src.scale)
  dst.castShadow = src.castShadow
  dst.receiveShadow = src.receiveShadow
  for (const child of src.children) dst.add(cloneStatic(child))
  return dst
}

export function spawnModel(name: string): THREE.Object3D {
  const src = templates.get(name)
  if (!src) throw new Error(`Missing model ${name}`)
  return cloneStatic(src)
}

export function tintModel(root: THREE.Object3D, tint: number): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const mat = (mesh.material as THREE.MeshLambertMaterial).clone()
    mat.color = new THREE.Color(tint)
    mat.emissive = new THREE.Color(0xffffff)
    mat.emissiveIntensity = 0
    mesh.material = mat
  })
}

export interface PetInstance {
  root: THREE.Object3D
  mixer: THREE.AnimationMixer
  play: (clipName: string) => void
  foot: number
}

export function spawnPet(name: string): PetInstance {
  const gltf = petGltf.get(name)
  if (!gltf) throw new Error(`Missing pet ${name}`)
  const root = cloneSkinned(gltf.scene)
  const mixer = new THREE.AnimationMixer(root)
  const play = (clipName: string) => {
    const clip = gltf.animations.find((a) => a.name === clipName) ?? gltf.animations[0]
    if (!clip) return
    mixer.stopAllAction()
    const action = mixer.clipAction(clip)
    action.reset().play()
  }
  play('idle')
  mixer.setTime(Math.random() * 2)
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
  })
  return { root, mixer, play, foot: petFoot.get(name) ?? 0 }
}

let blobTex: THREE.Texture | null = null
export function blobTexture(): THREE.Texture {
  if (blobTex) return blobTex
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32)
  g.addColorStop(0, 'rgba(0,0,0,0.38)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  blobTex = new THREE.CanvasTexture(canvas)
  blobTex.colorSpace = THREE.SRGBColorSpace
  return blobTex
}

let arrowTex: THREE.Texture | null = null
export async function arrowTexture(): Promise<THREE.Texture> {
  if (arrowTex) return arrowTex
  const loader = new THREE.TextureLoader()
  const tex = await loader.loadAsync(asset('assets/ui/ui-pack/PNG/Green/Default/arrow_basic_s.png'))
  tex.colorSpace = THREE.SRGBColorSpace
  arrowTex = tex
  return tex
}

let contactMat: THREE.MeshBasicMaterial | null = null
let contactGeo: THREE.CircleGeometry | null = null

function contactTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32)
  g.addColorStop(0, 'rgba(28, 18, 10, 0.72)')
  g.addColorStop(0.55, 'rgba(28, 18, 10, 0.38)')
  g.addColorStop(1, 'rgba(28, 18, 10, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Dark disc that sits on the grass under a tower or tree. */
export function contactShadow(radius: number): THREE.Mesh {
  if (!contactMat) {
    contactMat = new THREE.MeshBasicMaterial({
      map: contactTexture(),
      transparent: true,
      depthWrite: false,
    })
  }
  if (!contactGeo) contactGeo = new THREE.CircleGeometry(1, 16)
  const mesh = new THREE.Mesh(contactGeo, contactMat)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.04
  mesh.scale.setScalar(radius)
  mesh.renderOrder = 1
  mesh.userData.contact = true
  return mesh
}

let heartCanvas: HTMLCanvasElement | null = null
let heartMap: THREE.Texture | null = null

/** Pink heart with a real alpha hole. The Kenney icon is an opaque black silhouette. */
function drawHeart(): HTMLCanvasElement {
  if (heartCanvas) return heartCanvas
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.clearRect(0, 0, 128, 128)
  ctx.save()
  ctx.translate(64, 66)
  ctx.scale(54, 50)
  ctx.beginPath()
  ctx.moveTo(0, 0.95)
  ctx.bezierCurveTo(-0.12, 0.52, -1.08, 0.42, -1.08, -0.18)
  ctx.bezierCurveTo(-1.08, -0.78, -0.42, -1.08, 0, -0.42)
  ctx.bezierCurveTo(0.42, -1.08, 1.08, -0.78, 1.08, -0.18)
  ctx.bezierCurveTo(1.08, 0.42, 0.12, 0.52, 0, 0.95)
  ctx.closePath()
  const fill = ctx.createLinearGradient(0, -1, 0, 1)
  fill.addColorStop(0, '#ff9aaf')
  fill.addColorStop(0.42, '#ff3b66')
  fill.addColorStop(1, '#d41448')
  ctx.fillStyle = fill
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(-0.38, -0.42, 0.22, 0.14, -0.6, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 236, 242, 0.85)'
  ctx.fill()
  ctx.restore()
  heartCanvas = canvas
  return canvas
}

export function heartUrl(): string {
  return drawHeart().toDataURL('image/png')
}

export function heartTexture(): THREE.Texture {
  if (!heartMap) {
    heartMap = new THREE.CanvasTexture(drawHeart())
    heartMap.colorSpace = THREE.SRGBColorSpace
    heartMap.needsUpdate = true
  }
  return heartMap
}

const pieceThumbs = new Map<string, string>()

export function pieceThumbnail(id: string): string {
  return pieceThumbs.get(id) ?? ''
}

/** One-shot isometric chips of the shop pieces. The extra context is dropped after. */
export function renderPieceThumbnails(): void {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
    premultipliedAlpha: false,
  })
  renderer.setPixelRatio(1)
  renderer.setSize(96, 96, false)
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const scene = new THREE.Scene()
  scene.add(new THREE.AmbientLight(0xfff6ea, 0.95))
  const sun = new THREE.DirectionalLight(0xfff1d0, 1.45)
  sun.position.set(2.2, 3.4, 1.6)
  scene.add(sun)
  const cam = new THREE.PerspectiveCamera(28, 1, 0.05, 30)
  const center = new THREE.Vector3()
  const size = new THREE.Vector3()

  const jobs: Array<{ id: string; fill: (group: THREE.Group) => void }> = [
    {
      id: 'base',
      fill: (group) => {
        group.add(spawnModel('tower-round-base'))
        const bottom = spawnModel('tower-round-bottom-a')
        bottom.position.y = 0.12
        group.add(bottom)
      },
    },
    { id: 'middle-a', fill: (group) => group.add(spawnModel('tower-round-middle-a')) },
    { id: 'middle-b', fill: (group) => group.add(spawnModel('tower-round-middle-b')) },
    { id: 'middle-c', fill: (group) => group.add(spawnModel('tower-round-middle-c')) },
    { id: 'roof-a', fill: (group) => group.add(spawnModel('tower-round-roof-a')) },
    { id: 'roof-b', fill: (group) => group.add(spawnModel('tower-round-roof-b')) },
    { id: 'roof-c', fill: (group) => group.add(spawnModel('tower-round-roof-c')) },
    { id: 'ballista', fill: (group) => group.add(spawnModel('weapon-ballista')) },
    { id: 'cannon', fill: (group) => group.add(spawnModel('weapon-cannon')) },
    { id: 'catapult', fill: (group) => group.add(spawnModel('weapon-catapult')) },
    { id: 'turret', fill: (group) => group.add(spawnModel('weapon-turret')) },
  ]

  for (const job of jobs) {
    const group = new THREE.Group()
    job.fill(group)
    scene.add(group)
    const box = new THREE.Box3().setFromObject(group)
    box.getCenter(center)
    box.getSize(size)
    const radius = Math.max(size.x, size.y, size.z, 0.2)
    cam.position.set(center.x + radius * 0.95, center.y + radius * 0.72, center.z + radius * 1.2)
    cam.lookAt(center)
    cam.updateProjectionMatrix()
    renderer.render(scene, cam)
    pieceThumbs.set(job.id, renderer.domElement.toDataURL('image/png'))
    scene.remove(group)
  }

  renderer.forceContextLoss()
  renderer.dispose()
}
