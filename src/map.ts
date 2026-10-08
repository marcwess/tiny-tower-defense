import * as THREE from 'three'
import { spawnModel } from './assets'
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
    group.add(mesh)

    const pick = new THREE.Mesh(pickGeo, pickMat)
    pick.rotation.x = -Math.PI / 2
    pick.position.set(cell.x, 0.3, cell.z)
    pick.userData.cell = cell
    group.add(pick)
    picks.push(pick)
  }

  return {
    group,
    picks,
    cells,
    path: PATH,
    points: waypoints(PATH),
    hint: HINT_CELL,
  }
}
