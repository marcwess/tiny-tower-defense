/** Path tiles and the rotation check that keeps corners connected. */

export interface PathTile {
  x: number
  z: number
  model: string
  rot: number
}

/**
 * Quarter-turns are CCW around Y, matching three.js' positive rotation.y.
 * Base openings are the sides a tile connects to before rotation:
 * straight/spawn run north-south, corners connect north and east, the end opens north.
 */
const BASE_OPENINGS: Record<string, Array<[number, number]>> = {
  'tile-straight': [
    [0, 1],
    [0, -1],
  ],
  'tile-spawn': [
    [0, 1],
    [0, -1],
  ],
  'tile-end': [[0, 1]],
  'tile-corner-round': [
    [0, 1],
    [1, 0],
  ],
  'tile-river-bridge': [
    [0, 1],
    [0, -1],
  ],
}

export function rotateOpening(dx: number, dz: number, rot: number): [number, number] {
  const t = (rot & 3) * (Math.PI / 2)
  const c = Math.cos(t)
  const s = Math.sin(t)
  return [Math.round(c * dx + s * dz), Math.round(-s * dx + c * dz)]
}

export function openings(model: string, rot: number): Array<[number, number]> {
  const base = BASE_OPENINGS[model]
  if (!base) throw new Error(`No openings defined for ${model}`)
  return base.map(([dx, dz]) => rotateOpening(dx, dz, rot))
}

function hasOpening(open: Array<[number, number]>, dx: number, dz: number): boolean {
  return open.some(([x, z]) => x === dx && z === dz)
}

export function validatePath(path: PathTile[]): void {
  if (path.length < 2) throw new Error('Path is too short')
  for (let i = 0; i < path.length; i++) {
    const cur = path[i]
    const open = openings(cur.model, cur.rot)
    if (i > 0) {
      const prev = path[i - 1]
      const dx = prev.x - cur.x
      const dz = prev.z - cur.z
      if (Math.abs(dx) + Math.abs(dz) !== 1) {
        throw new Error(`Path gap at ${cur.x},${cur.z}`)
      }
      if (!hasOpening(open, dx, dz)) {
        throw new Error(`Entry side mismatch at ${cur.x},${cur.z} (${cur.model} rot ${cur.rot})`)
      }
    }
    if (i < path.length - 1) {
      const next = path[i + 1]
      const dx = next.x - cur.x
      const dz = next.z - cur.z
      if (!hasOpening(open, dx, dz)) {
        throw new Error(`Exit side mismatch at ${cur.x},${cur.z} (${cur.model} rot ${cur.rot})`)
      }
    }
  }
}

/** Winding grass-map route: spawn in the north, pet pen in the south. */
export const PATH: PathTile[] = [
  { x: 1, z: 10, model: 'tile-spawn', rot: 0 },
  { x: 1, z: 9, model: 'tile-straight', rot: 0 },
  { x: 1, z: 8, model: 'tile-corner-round', rot: 0 },
  { x: 2, z: 8, model: 'tile-straight', rot: 1 },
  { x: 3, z: 8, model: 'tile-straight', rot: 1 },
  { x: 4, z: 8, model: 'tile-corner-round', rot: 2 },
  { x: 4, z: 7, model: 'tile-straight', rot: 0 },
  { x: 4, z: 6, model: 'tile-corner-round', rot: 3 },
  { x: 3, z: 6, model: 'tile-straight', rot: 1 },
  { x: 2, z: 6, model: 'tile-corner-round', rot: 1 },
  { x: 2, z: 5, model: 'tile-river-bridge', rot: 0 },
  { x: 2, z: 4, model: 'tile-straight', rot: 0 },
  { x: 2, z: 3, model: 'tile-corner-round', rot: 0 },
  { x: 3, z: 3, model: 'tile-straight', rot: 1 },
  { x: 4, z: 3, model: 'tile-straight', rot: 1 },
  { x: 5, z: 3, model: 'tile-corner-round', rot: 2 },
  { x: 5, z: 2, model: 'tile-straight', rot: 0 },
  { x: 5, z: 1, model: 'tile-corner-round', rot: 3 },
  { x: 4, z: 1, model: 'tile-straight', rot: 1 },
  { x: 3, z: 1, model: 'tile-corner-round', rot: 1 },
  { x: 3, z: 0, model: 'tile-end', rot: 0 },
]

export const HINT_CELL = { x: 2, z: 7 }

export interface XZ {
  x: number
  z: number
}

/** Centers of each path cell, with a lead-in so UFOs fly onto the spawn tile. */
export function waypoints(path: PathTile[]): XZ[] {
  const spawn = path[0]
  const points: XZ[] = [{ x: spawn.x, z: spawn.z + 0.85 }]
  for (const cell of path) points.push({ x: cell.x, z: cell.z })
  return points
}
