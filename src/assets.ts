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

function adopt(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const source = mesh.material as THREE.MeshLambertMaterial
    if (!sharedMat) {
      const map = source.map
      if (map) map.colorSpace = THREE.SRGBColorSpace
      sharedMat = new THREE.MeshLambertMaterial({ map, color: 0xffffff })
    }
    mesh.material = sharedMat
    mesh.castShadow = false
    mesh.receiveShadow = false
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
