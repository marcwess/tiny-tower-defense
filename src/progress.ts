export interface Settings {
  sound: boolean
  music: boolean
  haptics: boolean
  damage: boolean
  quality: 'auto' | 'low' | 'high'
}

const STARS_KEY = 'tiny-td-stars'
const TUTORIAL_KEY = 'tiny-td-tutorial-v1'
const SETTINGS_KEY = 'tiny-td-settings'

export function loadStars(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(STARS_KEY) ?? '{}') as Record<string, number>
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

export function starsFor(level: number): number {
  return loadStars()[String(level)] ?? 0
}

/** A level is beaten when at least one star is saved. */
export function saveStars(level: number, stars: number): void {
  const all = loadStars()
  const key = String(level)
  all[key] = Math.max(all[key] ?? 0, stars)
  localStorage.setItem(STARS_KEY, JSON.stringify(all))
}

export function levelUnlocked(level: number): boolean {
  if (level <= 1) return true
  return starsFor(level - 1) > 0
}

export function tutorialSeen(): boolean {
  return localStorage.getItem(TUTORIAL_KEY) === '1'
}

export function markTutorial(): void {
  localStorage.setItem(TUTORIAL_KEY, '1')
}

export function loadSettings(): Settings {
  const muted = localStorage.getItem('tiny-td-muted') === '1'
  const storedDamage = localStorage.getItem('tiny-td-dmg')
  const damage = storedDamage == null ? true : storedDamage !== '0'
  const base: Settings = {
    sound: !muted,
    music: !muted,
    haptics: typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function',
    damage,
    quality: 'auto',
  }
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>
    const next = { ...base, ...raw }
    if (typeof navigator.vibrate !== 'function') next.haptics = false
    return next
  } catch {
    return base
  }
}

export function saveSettings(next: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  localStorage.setItem('tiny-td-dmg', next.damage ? '1' : '0')
}

export function buzz(kind: 'build' | 'kill' | 'rescue'): void {
  const settings = loadSettings()
  if (!settings.haptics || typeof navigator.vibrate !== 'function') return
  const pattern = kind === 'build' ? 12 : kind === 'kill' ? 20 : [12, 40, 18]
  navigator.vibrate(pattern)
}
