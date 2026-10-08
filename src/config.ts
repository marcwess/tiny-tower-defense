/** Balance for the fun pass. Tune here. */

export const COLS = 7
export const ROWS = 11
export const START_GOLD = 120
export const PET_COUNT = 5
export const SELL_RATIO = 0.5
export const MAX_MIDDLES = 3
export const MAX_TOWERS = 5
export const MAX_UPGRADE = 3
export const BASE_RANGE = 1.62
export const BREATHER_SECONDS = 10

export type MiddleId = 'a' | 'b' | 'c'
export type RoofId = 'a' | 'b' | 'c'
export type WeaponId = 'ballista' | 'cannon' | 'catapult' | 'turret'
export type EnemyKind = 'scout' | 'swarm' | 'tank' | 'shield' | 'boss'
export type PartId = `middle-${MiddleId}` | `roof-${RoofId}` | WeaponId | 'base' | 'sell' | 'upgrade'

export interface WeaponDef {
  label: string
  blurb: string
  cost: number
  model: string
  ammo: string
  damage: number
  cooldown: number
  speed: number
  splash: number
  slow: number
  rangeAdd: number
  shieldMul: number
  pierce: number
  arc: boolean
  sfx: 'retro' | 'cannon' | 'catapult' | 'laser'
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  ballista: {
    label: 'Ballista',
    blurb: 'Pierce shot. Strong into armor.',
    cost: 48,
    model: 'weapon-ballista',
    ammo: 'weapon-ammo-arrow',
    damage: 18,
    cooldown: 0.92,
    speed: 10,
    splash: 0,
    slow: 0,
    rangeAdd: 0.5,
    shieldMul: 1,
    pierce: 2,
    arc: false,
    sfx: 'retro',
  },
  cannon: {
    label: 'Cannon',
    blurb: 'Splash shell. Great into a swarm.',
    cost: 58,
    model: 'weapon-cannon',
    ammo: 'weapon-ammo-cannonball',
    damage: 22,
    cooldown: 1.35,
    speed: 7,
    splash: 0.85,
    slow: 0,
    rangeAdd: 0.05,
    shieldMul: 1,
    pierce: 1,
    arc: true,
    sfx: 'cannon',
  },
  catapult: {
    label: 'Catapult',
    blurb: 'Heavy lob that slows whatever it hits.',
    cost: 52,
    model: 'weapon-catapult',
    ammo: 'weapon-ammo-boulder',
    damage: 28,
    cooldown: 1.7,
    speed: 4.4,
    splash: 0.48,
    slow: 0.4,
    rangeAdd: 0.15,
    shieldMul: 1,
    pierce: 1,
    arc: true,
    sfx: 'catapult',
  },
  turret: {
    label: 'Turret',
    blurb: 'Fast bullets. Breaks shields and catches scouts.',
    cost: 36,
    model: 'weapon-turret',
    ammo: 'weapon-ammo-bullet',
    damage: 7,
    cooldown: 0.28,
    speed: 12,
    splash: 0,
    slow: 0,
    rangeAdd: -0.04,
    shieldMul: 1,
    pierce: 1,
    arc: false,
    sfx: 'laser',
  },
}

export const MIDDLES: Record<MiddleId, { label: string; blurb: string; cost: number; model: string }> = {
  a: { label: 'Swift', blurb: 'Faster shots.', cost: 28, model: 'tower-round-middle-a' },
  b: { label: 'Steady', blurb: 'A bit of range and rate.', cost: 32, model: 'tower-round-middle-b' },
  c: { label: 'Tall', blurb: 'Big range.', cost: 34, model: 'tower-round-middle-c' },
}

export const ROOFS: Record<RoofId, { label: string; blurb: string; cost: number; model: string }> = {
  a: { label: 'Frost', blurb: 'Shots slow UFOs. Strong into scouts.', cost: 50, model: 'tower-round-roof-a' },
  b: { label: 'Blast', blurb: 'Shots splash. Strong into a swarm.', cost: 54, model: 'tower-round-roof-b' },
  c: { label: 'Hex', blurb: 'More damage. Shreds armor and shields.', cost: 56, model: 'tower-round-roof-c' },
}

export const BASE_COST = 40
export const UPGRADE_COST = [40, 72, 110]

export interface EnemyDef {
  label: string
  plural: string
  weak: string
  model: string
  weapon: string
  hp: number
  shield: number
  speed: number
  reward: number
  scale: number
  hover: number
  radius: number
  tint: number
  flying: boolean
  /** Damage taken when the shot is not a counter. Tanks and the boss wear this. */
  armor: number
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  scout: {
    label: 'Scout',
    plural: 'Scouts',
    weak: 'Turret, Frost',
    model: 'enemy-ufo-b',
    weapon: 'enemy-ufo-b-weapon',
    hp: 30,
    shield: 0,
    speed: 1.55,
    reward: 4,
    scale: 0.34,
    hover: 0.52,
    radius: 0.22,
    tint: 0xff7a3c,
    flying: false,
    armor: 1,
  },
  swarm: {
    label: 'Swarm',
    plural: 'Swarm',
    weak: 'Blast, Cannon',
    model: 'enemy-ufo-a',
    weapon: 'enemy-ufo-a-weapon',
    hp: 16,
    shield: 0,
    speed: 1.05,
    reward: 2,
    scale: 0.22,
    hover: 0.4,
    radius: 0.16,
    tint: 0x8dff68,
    flying: false,
    armor: 1,
  },
  tank: {
    label: 'Tank',
    plural: 'Tanks',
    weak: 'Ballista, Hex',
    model: 'enemy-ufo-c',
    weapon: 'enemy-ufo-c-weapon',
    hp: 520,
    shield: 0,
    speed: 0.4,
    reward: 9,
    scale: 0.6,
    hover: 0.36,
    radius: 0.38,
    tint: 0x9eb0c4,
    flying: false,
    armor: 0.42,
  },
  shield: {
    label: 'Shield',
    plural: 'Shields',
    weak: 'rapid hits',
    model: 'enemy-ufo-d',
    weapon: 'enemy-ufo-d-weapon',
    hp: 64,
    shield: 80,
    speed: 0.66,
    reward: 7,
    scale: 0.46,
    hover: 1.02,
    radius: 0.3,
    tint: 0x7ef0ff,
    flying: true,
    armor: 1,
  },
  boss: {
    label: 'Boss',
    plural: 'Bosses',
    weak: 'Ballista, Hex',
    model: 'enemy-ufo-c',
    weapon: 'enemy-ufo-c-weapon',
    hp: 1500,
    shield: 240,
    speed: 0.34,
    reward: 36,
    scale: 0.82,
    hover: 0.55,
    radius: 0.55,
    tint: 0xff4d3a,
    flying: false,
    armor: 0.4,
  },
}

export interface WaveGroup {
  kind: EnemyKind
  count: number
  interval: number
  /** 0–1, enter this far along the path. */
  entry?: number
  hpMul?: number
}

export interface WaveDef {
  groups: WaveGroup[]
}

export const WAVES: WaveDef[] = [
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

export interface ShotProfile {
  weapon: WeaponId | null
  roof: RoofId | null
  splash: number
}

export interface Matchup {
  damage: number
  shield: number
  effective: boolean
}

/** About 2× when the shot matches the UFO. Armor and intact shields soak the rest. */
export function matchup(kind: EnemyKind, shot: ShotProfile): Matchup {
  const frost = shot.roof === 'a'
  const blast = shot.roof === 'b' || shot.splash >= 0.55
  const hex = shot.roof === 'c'
  const rapid = shot.weapon === 'turret'
  const pierce = shot.weapon === 'ballista'
  const splash = shot.weapon === 'cannon' || blast
  let damage = 1
  let shield = 1
  let effective = false
  if (kind === 'scout' && (rapid || frost)) {
    damage = 2
    effective = true
  }
  if (kind === 'swarm' && splash) {
    damage = 2
    effective = true
  }
  if ((kind === 'tank' || kind === 'boss') && (pierce || hex)) {
    damage = 2
    effective = true
  } else if (kind === 'tank' || kind === 'boss') {
    damage = ENEMIES[kind].armor
  }
  if (kind === 'shield' || kind === 'boss') {
    if (rapid) {
      shield = 2
      effective = true
    } else if (hex) {
      shield = 1.8
      effective = true
    } else {
      shield = 0.28
    }
  }
  return { damage, shield, effective }
}

export function starCount(petsAlive: number): number {
  if (petsAlive >= 5) return 3
  if (petsAlive >= 3) return 2
  if (petsAlive >= 1) return 1
  return 0
}

export function earlyBonus(waveIndex: number): number {
  return 10 + waveIndex * 3
}

export function clearBonus(waveNumber: number): number {
  return 4 + waveNumber
}

/** Each layer already on the tower makes the next middle or roof cost more. */
export function stackCost(base: number, layersAlready: number): number {
  return Math.round(base * (1 + layersAlready * 0.55))
}

export function wavePreview(wave: WaveDef): string {
  const counts = new Map<EnemyKind, number>()
  for (const group of wave.groups) counts.set(group.kind, (counts.get(group.kind) ?? 0) + group.count)
  const lines: string[] = []
  for (const [kind, count] of counts) {
    const def = ENEMIES[kind]
    const name = count === 1 ? def.label : def.plural
    lines.push(`${count} ${name} · weak to ${def.weak}`)
  }
  return lines.join('\n')
}

export function partCost(id: PartId): number {
  if (id === 'base') return BASE_COST
  if (id === 'sell' || id === 'upgrade') return 0
  if (id.startsWith('middle-')) return MIDDLES[id.slice(7) as MiddleId].cost
  if (id.startsWith('roof-')) return ROOFS[id.slice(5) as RoofId].cost
  return WEAPONS[id as WeaponId].cost
}

export interface TowerStats {
  range: number
  cooldown: number
  damage: number
  splash: number
  slow: number
  shieldMul: number
  pierce: number
  speed: number
  arc: boolean
  ammo: string | null
  sfx: WeaponDef['sfx'] | null
  weapon: WeaponId | null
  roof: RoofId | null
}

export function towerStats(
  middles: MiddleId[],
  roof: RoofId | null,
  weapon: WeaponId | null,
  tier = 0,
): TowerStats {
  let range = BASE_RANGE
  let rate = 1
  let dmgMul = 1 + tier * 0.18
  let splashAdd = 0
  let slow = 0
  let shieldMul = 1
  for (const m of middles) {
    if (m === 'a') rate *= 0.74
    if (m === 'b') {
      rate *= 0.9
      range += 0.28
    }
    if (m === 'c') range += 0.58
  }
  if (roof === 'a') slow = 0.5
  if (roof === 'b') splashAdd = 0.62
  if (roof === 'c') {
    dmgMul *= 1.42
    shieldMul *= 2
  }
  const w = weapon ? WEAPONS[weapon] : null
  if (w) {
    range += w.rangeAdd
    shieldMul *= w.shieldMul
    slow = Math.max(slow, w.slow)
  }
  return {
    range,
    cooldown: w ? Math.max(0.08, w.cooldown * rate) : Infinity,
    damage: w ? w.damage * dmgMul : 0,
    splash: (w ? w.splash : 0) + splashAdd,
    slow,
    shieldMul,
    pierce: w ? w.pierce : 1,
    speed: w ? w.speed : 0,
    arc: w ? w.arc : false,
    ammo: w ? w.ammo : null,
    sfx: w ? w.sfx : null,
    weapon,
    roof,
  }
}
