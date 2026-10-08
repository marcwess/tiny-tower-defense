import type { WaveDef } from './config'
import { HINT_CELL, PATH, type PathTile } from './pathing'
import type { PetSpot } from './pets'

export interface PaintCell {
  x: number
  z: number
  model: string
  rot?: number
  kind: 'path' | 'build' | 'block' | 'spawn' | 'goal' | 'pen'
}

export interface LevelDef {
  id: number
  name: string
  blurb: string
  biome: 'grass' | 'snow'
  path: PathTile[]
  paint: PaintCell[]
  hint: { x: number; z: number }
  /** Five build pads the playtest uses. Level 1 pads match the tuned meadow plan. */
  pads: Array<[number, number]>
  pets: PetSpot[]
  waves: WaveDef[]
}

const MEADOW_PAINT: PaintCell[] = [
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

/** Level 1 waves. Do not retune these. */
const MEADOW_WAVES: WaveDef[] = [
  { groups: [{ kind: 'scout', count: 8, interval: 1.0 }] },
  {
    groups: [
      { kind: 'scout', count: 6, interval: 0.8 },
      { kind: 'swarm', count: 12, interval: 0.32 },
    ],
  },
  {
    groups: [
      { kind: 'tank', count: 3, interval: 1.5 },
      { kind: 'swarm', count: 8, interval: 0.4 },
    ],
  },
  {
    groups: [
      { kind: 'shield', count: 5, interval: 1.1 },
      { kind: 'scout', count: 6, interval: 0.55 },
    ],
  },
  {
    groups: [
      { kind: 'tank', count: 4, interval: 1.3 },
      { kind: 'swarm', count: 14, interval: 0.28 },
      { kind: 'scout', count: 4, interval: 0.5 },
    ],
  },
  {
    groups: [
      { kind: 'shield', count: 2, interval: 0.9 },
      { kind: 'tank', count: 3, interval: 1.2 },
      { kind: 'swarm', count: 10, interval: 0.3 },
    ],
  },
  {
    groups: [
      { kind: 'tank', count: 1, interval: 0.2, entry: 0.96, hpMul: 2 },
      { kind: 'tank', count: 4, interval: 1.15 },
      { kind: 'swarm', count: 8, interval: 0.34 },
    ],
  },
  {
    groups: [
      { kind: 'shield', count: 4, interval: 0.8 },
      { kind: 'tank', count: 4, interval: 1.0 },
      { kind: 'scout', count: 8, interval: 0.4 },
      { kind: 'swarm', count: 10, interval: 0.26 },
    ],
  },
  {
    groups: [
      { kind: 'boss', count: 1, interval: 0.2 },
      { kind: 'tank', count: 3, interval: 1.1 },
      { kind: 'swarm', count: 8, interval: 0.3 },
      { kind: 'shield', count: 3, interval: 0.85 },
    ],
  },
]

const MEADOW_PETS: PetSpot[] = [
  { model: 'animal-cat', x: 2.42, z: 0.42, scale: 0.32 },
  { model: 'animal-bunny', x: 3.55, z: 0.38, scale: 0.3 },
  { model: 'animal-dog', x: 1.72, z: 0.28, scale: 0.32 },
  { model: 'animal-fox', x: 4.22, z: 0.26, scale: 0.3 },
  { model: 'animal-chick', x: 3.02, z: 0.12, scale: 0.26 },
]

function riverRow(model: string, bridgeX: number): PaintCell[] {
  const cells: PaintCell[] = []
  for (let x = 0; x < 7; x++) {
    if (x === bridgeX) continue
    cells.push({ x, z: 5, model, rot: 1, kind: 'block' })
  }
  return cells
}

const SWITCH_PATH: PathTile[] = [
  { x: 5, z: 10, model: 'tile-spawn', rot: 0 },
  { x: 5, z: 9, model: 'tile-straight', rot: 0 },
  { x: 5, z: 8, model: 'tile-corner-round', rot: 3 },
  { x: 4, z: 8, model: 'tile-straight', rot: 1 },
  { x: 3, z: 8, model: 'tile-straight', rot: 1 },
  { x: 2, z: 8, model: 'tile-corner-round', rot: 1 },
  { x: 2, z: 7, model: 'tile-straight', rot: 0 },
  { x: 2, z: 6, model: 'tile-corner-round', rot: 0 },
  { x: 3, z: 6, model: 'tile-straight', rot: 1 },
  { x: 4, z: 6, model: 'tile-corner-round', rot: 2 },
  { x: 4, z: 5, model: 'tile-river-bridge', rot: 0 },
  { x: 4, z: 4, model: 'tile-straight', rot: 0 },
  { x: 4, z: 3, model: 'tile-corner-round', rot: 3 },
  { x: 3, z: 3, model: 'tile-straight', rot: 1 },
  { x: 2, z: 3, model: 'tile-corner-round', rot: 1 },
  { x: 2, z: 2, model: 'tile-straight', rot: 0 },
  { x: 2, z: 1, model: 'tile-corner-round', rot: 0 },
  { x: 3, z: 1, model: 'tile-straight', rot: 1 },
  { x: 4, z: 1, model: 'tile-corner-round', rot: 2 },
  { x: 4, z: 0, model: 'tile-end', rot: 0 },
]

const SNOW = 'snow-'

const SNOW_PATH: PathTile[] = [
  { x: 1, z: 10, model: `${SNOW}tile-spawn`, rot: 0 },
  { x: 1, z: 9, model: `${SNOW}tile-straight`, rot: 0 },
  { x: 1, z: 8, model: `${SNOW}tile-corner-round`, rot: 0 },
  { x: 2, z: 8, model: `${SNOW}tile-straight`, rot: 1 },
  { x: 3, z: 8, model: `${SNOW}tile-straight`, rot: 1 },
  { x: 4, z: 8, model: `${SNOW}tile-corner-round`, rot: 2 },
  { x: 4, z: 7, model: `${SNOW}tile-straight`, rot: 0 },
  { x: 4, z: 6, model: `${SNOW}tile-corner-round`, rot: 3 },
  { x: 3, z: 6, model: `${SNOW}tile-straight`, rot: 1 },
  { x: 2, z: 6, model: `${SNOW}tile-corner-round`, rot: 1 },
  { x: 2, z: 5, model: `${SNOW}tile-river-bridge`, rot: 0 },
  { x: 2, z: 4, model: `${SNOW}tile-corner-round`, rot: 0 },
  { x: 3, z: 4, model: `${SNOW}tile-straight`, rot: 1 },
  { x: 4, z: 4, model: `${SNOW}tile-straight`, rot: 1 },
  { x: 5, z: 4, model: `${SNOW}tile-corner-round`, rot: 2 },
  { x: 5, z: 3, model: `${SNOW}tile-straight`, rot: 0 },
  { x: 5, z: 2, model: `${SNOW}tile-corner-round`, rot: 3 },
  { x: 4, z: 2, model: `${SNOW}tile-straight`, rot: 1 },
  { x: 3, z: 2, model: `${SNOW}tile-corner-round`, rot: 1 },
  { x: 3, z: 1, model: `${SNOW}tile-corner-round`, rot: 3 },
  { x: 2, z: 1, model: `${SNOW}tile-straight`, rot: 1 },
  { x: 1, z: 1, model: `${SNOW}tile-corner-round`, rot: 1 },
  { x: 1, z: 0, model: `${SNOW}tile-end`, rot: 0 },
]

function scenery(prefix: string, cells: Array<[number, number, string]>): PaintCell[] {
  return cells.map(([x, z, model]) => ({ x, z, model: `${prefix}${model}`, kind: 'block' as const }))
}

export const LEVELS: LevelDef[] = [
  {
    id: 1,
    name: 'Meadow',
    blurb: 'The first pen',
    biome: 'grass',
    path: PATH,
    paint: MEADOW_PAINT,
    hint: HINT_CELL,
    pads: [
      [2, 7],
      [3, 7],
      [5, 7],
      [3, 4],
      [4, 2],
    ],
    pets: MEADOW_PETS,
    waves: MEADOW_WAVES,
  },
  {
    id: 2,
    name: 'Switchback',
    blurb: 'A tighter grass route',
    biome: 'grass',
    path: SWITCH_PATH,
    paint: [
      ...riverRow('tile-river-straight', 4),
      ...scenery('', [
        [0, 10, 'tile-tree'],
        [1, 10, 'tile-rock'],
        [3, 10, 'tile-hill'],
        [6, 10, 'tile-tree-double'],
        [0, 9, 'tile-hill'],
        [6, 9, 'tile-crystal'],
        [0, 8, 'tile-tree'],
        [6, 8, 'tile-rock'],
        [0, 7, 'tile-tree-double'],
        [6, 7, 'tile-hill'],
        [0, 6, 'tile-rock'],
        [6, 6, 'tile-tree'],
        [0, 4, 'tile-tree'],
        [6, 4, 'tile-crystal'],
        [0, 3, 'tile-hill'],
        [6, 3, 'tile-tree-double'],
        [0, 2, 'tile-tree'],
        [6, 2, 'tile-rock'],
        [0, 1, 'tile-crystal'],
        [6, 1, 'tile-tree'],
        [0, 0, 'tile-tree-double'],
        [1, 0, 'tile-hill'],
        [6, 0, 'tile-rock'],
      ]),
      { x: 2, z: 0, model: 'tile', kind: 'pen' },
      { x: 3, z: 0, model: 'tile', kind: 'pen' },
      { x: 5, z: 0, model: 'tile', kind: 'pen' },
    ],
    hint: { x: 3, z: 7 },
    pads: [
      [1, 7],
      [3, 7],
      [5, 7],
      [3, 4],
      [5, 2],
    ],
    pets: [
      { model: 'animal-cat', x: 3.35, z: 0.36, scale: 0.32 },
      { model: 'animal-bunny', x: 4.65, z: 0.34, scale: 0.3 },
      { model: 'animal-dog', x: 2.45, z: 0.28, scale: 0.32 },
      { model: 'animal-fox', x: 5.15, z: 0.24, scale: 0.3 },
      { model: 'animal-chick', x: 3.9, z: 0.12, scale: 0.26 },
    ],
    waves: [
      { groups: [{ kind: 'scout', count: 10, interval: 0.85 }] },
      {
        groups: [
          { kind: 'scout', count: 8, interval: 0.7 },
          { kind: 'swarm', count: 14, interval: 0.28 },
        ],
      },
      {
        groups: [
          { kind: 'tank', count: 4, interval: 1.25 },
          { kind: 'swarm', count: 10, interval: 0.34 },
        ],
      },
      {
        groups: [
          { kind: 'shield', count: 6, interval: 0.95 },
          { kind: 'scout', count: 8, interval: 0.45 },
        ],
      },
      {
        groups: [
          { kind: 'tank', count: 1, interval: 0.2, entry: 0.96, hpMul: 2.0 },
          { kind: 'tank', count: 5, interval: 1.1 },
          { kind: 'swarm', count: 16, interval: 0.24 },
          { kind: 'scout', count: 6, interval: 0.42 },
        ],
      },
      {
        groups: [
          { kind: 'shield', count: 3, interval: 0.8 },
          { kind: 'tank', count: 4, interval: 1.05 },
          { kind: 'swarm', count: 12, interval: 0.26 },
        ],
      },
      {
        groups: [
          { kind: 'tank', count: 1, interval: 0.2, entry: 0.96, hpMul: 2.3 },
          { kind: 'tank', count: 5, interval: 1.0 },
          { kind: 'swarm', count: 10, interval: 0.3 },
        ],
      },
      {
        groups: [
          { kind: 'shield', count: 5, interval: 0.72 },
          { kind: 'tank', count: 5, interval: 0.9 },
          { kind: 'scout', count: 8, interval: 0.36 },
          { kind: 'swarm', count: 12, interval: 0.24 },
        ],
      },
      {
        groups: [
          { kind: 'boss', count: 1, interval: 0.2 },
          { kind: 'tank', count: 4, interval: 0.95 },
          { kind: 'swarm', count: 10, interval: 0.26 },
          { kind: 'shield', count: 4, interval: 0.75 },
        ],
      },
    ],
  },
  {
    id: 3,
    name: 'Snow',
    blurb: 'A long frozen curve',
    biome: 'snow',
    path: SNOW_PATH,
    paint: [
      ...riverRow('snow-tile-river-straight', 2),
      ...scenery(SNOW, [
        [0, 10, 'tile-tree'],
        [3, 10, 'tile-rock'],
        [5, 10, 'tile-hill'],
        [6, 10, 'tile-tree-double'],
        [0, 9, 'tile-hill'],
        [4, 9, 'tile-crystal'],
        [6, 9, 'tile-tree'],
        [0, 8, 'tile-rock'],
        [6, 8, 'tile-tree-double'],
        [0, 7, 'tile-tree'],
        [6, 7, 'tile-crystal'],
        [0, 6, 'tile-hill'],
        [6, 6, 'tile-rock'],
        [0, 4, 'tile-tree'],
        [6, 4, 'tile-hill'],
        [0, 3, 'tile-crystal'],
        [6, 3, 'tile-tree'],
        [0, 2, 'tile-rock'],
        [6, 2, 'tile-tree-double'],
        [0, 1, 'tile-tree'],
        [6, 1, 'tile-hill'],
        [5, 0, 'tile-rock'],
        [6, 0, 'tile-tree'],
      ]),
      { x: 0, z: 0, model: `${SNOW}tile`, kind: 'pen' },
      { x: 2, z: 0, model: `${SNOW}tile`, kind: 'pen' },
      { x: 3, z: 0, model: `${SNOW}tile`, kind: 'pen' },
    ],
    hint: { x: 3, z: 7 },
    pads: [
      [3, 7],
      [5, 7],
      [1, 6],
      [3, 3],
      [4, 1],
    ],
    pets: [
      { model: 'animal-cat', x: 1.55, z: 0.38, scale: 0.32 },
      { model: 'animal-bunny', x: 2.35, z: 0.32, scale: 0.3 },
      { model: 'animal-dog', x: 0.55, z: 0.26, scale: 0.32 },
      { model: 'animal-fox', x: 2.85, z: 0.22, scale: 0.3 },
      { model: 'animal-chick', x: 1.15, z: 0.12, scale: 0.26 },
    ],
    waves: [
      { groups: [{ kind: 'scout', count: 12, interval: 0.72 }] },
      {
        groups: [
          { kind: 'scout', count: 8, interval: 0.6 },
          { kind: 'swarm', count: 16, interval: 0.24 },
        ],
      },
      {
        groups: [
          { kind: 'tank', count: 4, interval: 1.05 },
          { kind: 'swarm', count: 12, interval: 0.28 },
        ],
      },
      {
        groups: [
          { kind: 'shield', count: 6, interval: 0.85 },
          { kind: 'scout', count: 10, interval: 0.38 },
        ],
      },
      {
        groups: [
          { kind: 'tank', count: 5, interval: 0.95 },
          { kind: 'swarm', count: 16, interval: 0.22 },
          { kind: 'scout', count: 6, interval: 0.36 },
        ],
      },
      {
        groups: [
          { kind: 'shield', count: 4, interval: 0.7 },
          { kind: 'tank', count: 4, interval: 0.9 },
          { kind: 'swarm', count: 14, interval: 0.22 },
        ],
      },
      {
        groups: [
          { kind: 'tank', count: 1, interval: 0.2, entry: 0.96, hpMul: 2 },
          { kind: 'tank', count: 5, interval: 0.9 },
          { kind: 'swarm', count: 12, interval: 0.26 },
        ],
      },
      {
        groups: [
          { kind: 'shield', count: 6, interval: 0.62 },
          { kind: 'tank', count: 5, interval: 0.8 },
          { kind: 'scout', count: 8, interval: 0.32 },
          { kind: 'swarm', count: 12, interval: 0.2 },
        ],
      },
      {
        groups: [
          { kind: 'boss', count: 1, interval: 0.2 },
          { kind: 'tank', count: 1, interval: 0.25, entry: 0.97, hpMul: 6.2 },
          { kind: 'tank', count: 4, interval: 0.85 },
          { kind: 'swarm', count: 12, interval: 0.22 },
          { kind: 'shield', count: 4, interval: 0.65 },
        ],
      },
    ],
  },
]

export function levelById(id: number): LevelDef {
  return LEVELS[id - 1] ?? LEVELS[0]
}
