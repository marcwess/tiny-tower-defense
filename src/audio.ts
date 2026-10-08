import { asset } from './assets'

type SfxName =
  | 'click'
  | 'place'
  | 'deny'
  | 'laser'
  | 'retro'
  | 'cannon'
  | 'catapult'
  | 'hit'
  | 'boom'
  | 'beam'
  | 'wave'
  | 'win'
  | 'lose'

const FILES: Record<SfxName | 'music', string> = {
  music: 'assets/audio/music-loops/Loops/Mission Plausible.ogg',
  click: 'assets/audio/ui-audio/Audio/click1.ogg',
  place: 'assets/audio/interface-sounds/Audio/confirmation_001.ogg',
  deny: 'assets/audio/interface-sounds/Audio/back_001.ogg',
  laser: 'assets/audio/sci-fi-sounds/Audio/laserSmall_001.ogg',
  retro: 'assets/audio/sci-fi-sounds/Audio/laserRetro_001.ogg',
  cannon: 'assets/audio/sci-fi-sounds/Audio/lowFrequency_explosion_000.ogg',
  catapult: 'assets/audio/impact-sounds/Audio/impactGeneric_light_003.ogg',
  hit: 'assets/audio/impact-sounds/Audio/impactGeneric_light_000.ogg',
  boom: 'assets/audio/sci-fi-sounds/Audio/explosionCrunch_001.ogg',
  beam: 'assets/audio/sci-fi-sounds/Audio/spaceEngineSmall_002.ogg',
  wave: 'assets/audio/interface-sounds/Audio/confirmation_003.ogg',
  win: 'assets/audio/music-jingles/Audio (Retro)/jingles-retro_00.ogg',
  lose: 'assets/audio/music-jingles/Audio (Retro)/jingles-retro_02.ogg',
}

const VOLUME: Record<SfxName, number> = {
  click: 0.4,
  place: 0.5,
  deny: 0.45,
  laser: 0.18,
  retro: 0.28,
  cannon: 0.32,
  catapult: 0.4,
  hit: 0.22,
  boom: 0.4,
  beam: 0.45,
  wave: 0.5,
  win: 0.6,
  lose: 0.6,
}

const MUTE_KEY = 'tiny-td-muted'

class AudioBus {
  muted = false
  private unlocked = false
  private pools = new Map<SfxName, HTMLAudioElement[]>()
  private cursor = new Map<SfxName, number>()
  private lastLaser = 0
  private lastHit = 0
  private music: HTMLAudioElement | null = null

  constructor() {
    this.muted = localStorage.getItem(MUTE_KEY) === '1'
    for (const name of Object.keys(VOLUME) as SfxName[]) {
      const size = name === 'laser' || name === 'hit' ? 4 : 2
      const pool: HTMLAudioElement[] = []
      for (let i = 0; i < size; i++) {
        const el = new Audio(asset(FILES[name]))
        el.preload = 'auto'
        pool.push(el)
      }
      this.pools.set(name, pool)
      this.cursor.set(name, 0)
    }
    this.music = new Audio(asset(FILES.music))
    this.music.loop = true
    this.music.preload = 'auto'
    this.music.volume = 0.28
  }

  unlock(): void {
    if (this.unlocked) return
    this.unlocked = true
    if (!this.muted) this.startMusic()
  }

  private startMusic(): void {
    if (!this.music || this.muted) return
    this.music.volume = 0.28
    void this.music.play().catch(() => {})
  }

  toggleMute(): boolean {
    this.muted = !this.muted
    localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0')
    if (!this.music) return this.muted
    if (this.muted) {
      this.music.pause()
    } else if (this.unlocked) {
      this.startMusic()
    }
    return this.muted
  }

  duck(forJingle: boolean): void {
    if (!this.music) return
    this.music.volume = forJingle ? 0.08 : 0.28
  }

  play(name: SfxName): void {
    if (this.muted || !this.unlocked) return
    const now = performance.now()
    if (name === 'laser' && now - this.lastLaser < 80) return
    if (name === 'hit' && now - this.lastHit < 50) return
    if (name === 'laser') this.lastLaser = now
    if (name === 'hit') this.lastHit = now
    const pool = this.pools.get(name)
    if (!pool) return
    const index = this.cursor.get(name) ?? 0
    this.cursor.set(name, (index + 1) % pool.length)
    const el = pool[index]
    el.volume = VOLUME[name]
    try {
      el.currentTime = 0
    } catch {
      /* not seekable yet */
    }
    void el.play().catch(() => {})
  }
}

export const audio = new AudioBus()
