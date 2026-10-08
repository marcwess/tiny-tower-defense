/** Balance and content for the stage-1 prototype. Tune here. */

export const COLS = 7
export const ROWS = 11
export const START_GOLD = 150
export const PET_COUNT = 5
export const SELL_RATIO = 0.5
export const MAX_MIDDLES = 3
export const MAX_TOWERS = 5
export const BASE_RANGE = 1.62
export const EARLY_BONUS = 15
export const BREATHER_SECONDS = 10
export const CLEAR_BONUS = 12

export type MiddleId = 'a' | 'b' | 'c'
export type RoofId = 'a' | 'b' | 'c'
export type WeaponId = 'ballista' | 'cannon' | 'catapult' | 'turret'
export type EnemyKind = 'scout' | 'dart' | 'brute' | 'warden'
export type PartId = `middle-${MiddleId}` | `roof-${RoofId}` | WeaponId | 'base' | 'sell'

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
  /** Multiplier against brutes. Turrets chip them; heavy weapons punch. */
  vsBrute: number
  arc: boolean
  sfx: 'retro' | 'cannon' | 'catapult' | 'laser'
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  ballista: {
    label: 'Ballista',
    blurb: 'Long pierce shot. Punches shields.',
    cost: 45,
    model: 'weapon-ballista',
    ammo: 'weapon-ammo-arrow',
    damage: 16,
    cooldown: 0.92,
    speed: 10,
    splash: 0,
    slow: 0,
    rangeAdd: 0.5,
    shieldMul: 1.6,
    pierce: 2,
    vsBrute: 1.25,
    arc: false,
    sfx: 'retro',
  },
  cannon: {
    label: 'Cannon',
    blurb: 'Splash shell. Great into bunched UFOs.',
    cost: 60,
    model: 'weapon-cannon',
    ammo: 'weapon-ammo-cannonball',
    damage: 24,
    cooldown: 1.35,
    speed: 7,
    splash: 0.72,
    slow: 0,
    rangeAdd: 0.05,
    shieldMul: 1,
    pierce: 1,
    vsBrute: 1.15,
    arc: true,
    sfx: 'cannon',
  },
  catapult: {
    label: 'Catapult',
    blurb: 'Heavy lob that slows whatever it hits.',
    cost: 55,
    model: 'weapon-catapult',
    ammo: 'weapon-ammo-boulder',
    damage: 30,
    cooldown: 1.7,
    speed: 4.4,
    splash: 0.48,
    slow: 0.4,
    rangeAdd: 0.15,
    shieldMul: 1,
    pierce: 1,
    vsBrute: 1.4,
    arc: true,
    sfx: 'catapult',
  },
  turret: {
    label: 'Turret',
    blurb: 'Fast bullets. Best first weapon.',
    cost: 35,
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
    vsBrute: 0.5,
    arc: false,
    sfx: 'laser',
  },
}

export const MIDDLES: Record<MiddleId, { label: string; blurb: string; cost: number; model: string }> = {
  a: { label: 'Swift', blurb: 'Faster shots.', cost: 28, model: 'tower-round-middle-a' },
  b: { label: 'Steady', blurb: 'A bit of range and rate.', cost: 32, model: 'tower-round-middle-b' },
  c: { label: 'Tall', blurb: 'Big range.', cost: 36, model: 'tower-round-middle-c' },
}

export const ROOFS: Record<RoofId, { label: string; blurb: string; cost: number; model: string }> = {
  a: { label: 'Frost', blurb: 'Shots slow UFOs.', cost: 48, model: 'tower-round-roof-a' },
  b: { label: 'Blast', blurb: 'Shots splash.', cost: 52, model: 'tower-round-roof-b' },
  c: { label: 'Hex', blurb: 'More damage. Shreds shields.', cost: 56, model: 'tower-round-roof-c' },
}

export const BASE_COST = 40

export interface EnemyDef {
  label: string
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
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  scout: {
    label: 'Scout',
    model: 'enemy-ufo-a',
    weapon: 'enemy-ufo-a-weapon',
    hp: 34,
    shield: 0,
    speed: 0.84,
    reward: 6,
    scale: 0.4,
    hover: 0.5,
    radius: 0.28,
    tint: 0xffffff,
    flying: false,
  },
  dart: {
    label: 'Dart',
    model: 'enemy-ufo-b',
    weapon: 'enemy-ufo-b-weapon',
    hp: 24,
    shield: 0,
    speed: 1.7,
    reward: 7,
    scale: 0.32,
    hover: 0.58,
    radius: 0.22,
    tint: 0xffc2a8,
    flying: false,
  },
  brute: {
    label: 'Brute',
    model: 'enemy-ufo-c',
    weapon: 'enemy-ufo-c-weapon',
    hp: 190,
    shield: 0,
    speed: 0.48,
    reward: 16,
    scale: 0.58,
    hover: 0.42,
    radius: 0.4,
    tint: 0xc5d4e4,
    flying: false,
  },
  warden: {
    label: 'Warden',
    model: 'enemy-ufo-d',
    weapon: 'enemy-ufo-d-weapon',
    hp: 90,
    shield: 80,
    speed: 0.68,
    reward: 18,
    scale: 0.46,
    hover: 1.05,
    radius: 0.32,
    tint: 0xc6f6d4,
    flying: true,
  },
}

export interface WaveGroup {
  kind: EnemyKind
  count: number
  interval: number
}

export interface WaveDef {
  groups: WaveGroup[]
}

export const WAVES: WaveDef[] = [
  { groups: [{ kind: 'scout', count: 6, interval: 1.15 }] },
  { groups: [{ kind: 'scout', count: 11, interval: 0.72 }] },
  {
    groups: [
      { kind: 'scout', count: 6, interval: 0.85 },
      { kind: 'dart', count: 4, interval: 0.65 },
    ],
  },
  {
    groups: [
      { kind: 'dart', count: 9, interval: 0.4 },
      { kind: 'scout', count: 6, interval: 0.65 },
    ],
  },
  {
    groups: [
      { kind: 'brute', count: 4, interval: 1.25 },
      { kind: 'scout', count: 8, interval: 0.55 },
    ],
  },
  {
    groups: [
      { kind: 'dart', count: 8, interval: 0.38 },
      { kind: 'brute', count: 5, interval: 1.05 },
    ],
  },
  {
    groups: [
      { kind: 'warden', count: 4, interval: 1.15 },
      { kind: 'scout', count: 8, interval: 0.5 },
    ],
  },
  {
    groups: [
      { kind: 'brute', count: 6, interval: 0.85 },
      { kind: 'dart', count: 10, interval: 0.32 },
      { kind: 'warden', count: 5, interval: 0.9 },
    ],
  },
  {
    groups: [
      { kind: 'scout', count: 10, interval: 0.36 },
      { kind: 'dart', count: 12, interval: 0.26 },
      { kind: 'brute', count: 7, interval: 0.75 },
      { kind: 'warden', count: 6, interval: 0.7 },
    ],
  },
]

export function partCost(id: PartId): number {
  if (id === 'base') return BASE_COST
  if (id === 'sell') return 0
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
  vsBrute: number
  speed: number
  arc: boolean
  ammo: string | null
  sfx: WeaponDef['sfx'] | null
}

export function towerStats(middles: MiddleId[], roof: RoofId | null, weapon: WeaponId | null): TowerStats {
  let range = BASE_RANGE
  let rate = 1
  let dmgMul = 1
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
    vsBrute: w ? w.vsBrute : 1,
    speed: w ? w.speed : 0,
    arc: w ? w.arc : false,
    ammo: w ? w.ammo : null,
    sfx: w ? w.sfx : null,
  }
}
