/// <reference types="vite/client" />

interface TinyState {
  ready: boolean
  error: string | null
  phase: string
  gold: number
  wave: number
  waves: number
  pets: number
  petMax: number
  enemies: number
  kills: number
  leaks: number
  towers: number
  spawned: number
  rescues: number
  abductions: number
  stars: number
  carries: number
  fps: number
  draws: number
  zoom: number
  level: number
  pads: number[][]
  hint: { x: number; z: number }
  tutor: number
  tier: string
  log: {
    wave: number
    gold: number
    kills: number
    leaks: number
    pets: number
    rescues: number
    abductions: number
    came: string
  }[]
}

interface TinyApi {
  ready: boolean
  error: string | null
  getState: () => TinyState
  cellKind: (x: number, z: number) => string | null
  project: (x: number, z: number, y?: number) => { x: number; y: number } | null
  buy: (x: number, z: number, part: string) => boolean
  startWave: () => void
  setTimeScale: (scale: number) => void
  cameraFocus: (x: number, z: number, distance: number) => void
  cameraLook: (px: number, py: number, pz: number, tx: number, ty: number, tz: number) => void
  setGold: (amount: number) => void
  deselect: () => void
  select: (x: number, z: number) => void
  debugAbduct: () => void
  debugRescue: () => void
  debugBoss: () => void
  debugPreview: () => void
  debugPop: () => void
  debugWin: () => void
  debugLose: () => void
  retry: () => void
  startLevel: (id: number) => void
  next: () => void
  debugTitle: () => void
  debugSettings: () => void
  debugCoach: () => void
}

interface Window {
  __TINY_TD__?: TinyApi
}
