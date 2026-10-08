import { asset } from './assets'
import { loadSettings } from './progress'

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
  | 'cheer'
  | 'thud'

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
  cheer: 'assets/audio/music-jingles/Audio (Retro)/jingles-retro_01.ogg',
  thud: 'assets/audio/impact-sounds/Audio/impactGeneric_light_004.ogg',
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
  cheer: 0.55,
  thud: 0.46,
}

const MUTE_KEY = 'tiny-td-muted'

class AudioBus {
  /** True when both effects and music are off. The HUD speaker uses this. */
  muted = false
  sound = true
  musicOn = true
  private unlocked = false
  private built = false
  private loading: Promise<void> | null = null
  private pools = new Map<SfxName, HTMLAudioElement[]>()
  private cursor = new Map<SfxName, number>()
  private lastLaser = 0
  private lastHit = 0
  private music: HTMLAudioElement | null = null
  private readonly blobs = new Map<string, Promise<string>>()

  constructor() {
    const settings = loadSettings()
    this.sound = settings.sound
    this.musicOn = settings.music
    this.muted = !this.sound && !this.musicOn
  }

  /** One network fetch per file. Pool elements play the cached blob and never restart a download. */
  private blobUrl(path: string): Promise<string> {
    const url = asset(path)
    let pending = this.blobs.get(url)
    if (!pending) {
      pending = fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`audio ${res.status}`)
          return res.blob()
        })
        .then((blob) => URL.createObjectURL(blob))
        .catch((error) => {
          this.blobs.delete(url)
          throw error
        })
      this.blobs.set(url, pending)
    }
    return pending
  }

  private ensure(): Promise<void> {
    if (this.built) return Promise.resolve()
    if (!this.loading) {
      this.loading = this.build()
        .then(() => {
          this.built = true
        })
        .catch(() => {
          this.loading = null
        })
    }
    return this.loading
  }

  private async build(): Promise<void> {
    const names = Object.keys(FILES) as Array<SfxName | 'music'>
    const urls = await Promise.all(names.map((name) => this.blobUrl(FILES[name])))
    const byName = new Map<string, string>()
    names.forEach((name, index) => byName.set(name, urls[index]))
    for (const name of Object.keys(VOLUME) as SfxName[]) {
      const size = name === 'laser' || name === 'hit' ? 4 : 2
      const src = byName.get(name)
      if (!src) continue
      const pool: HTMLAudioElement[] = []
      for (let i = 0; i < size; i++) {
        const el = new Audio()
        el.preload = 'auto'
        el.src = src
        pool.push(el)
      }
      this.pools.set(name, pool)
      this.cursor.set(name, 0)
    }
    const musicSrc = byName.get('music')
    if (musicSrc) {
      this.music = new Audio()
      this.music.preload = 'auto'
      this.music.src = musicSrc
      this.music.loop = true
      this.music.volume = 0.28
    }
  }

  unlock(): void {
    const first = !this.unlocked
    this.unlocked = true
    void this.ensure().then(() => {
      if (first && this.built && this.musicOn) this.startMusic()
    })
  }

  private startMusic(): void {
    if (!this.music || !this.musicOn) return
    this.music.volume = 0.28
    void this.music.play().catch(() => {})
  }

  private remember(): void {
    this.muted = !this.sound && !this.musicOn
    localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0')
  }

  apply(sound: boolean, musicOn: boolean): void {
    this.sound = sound
    this.musicOn = musicOn
    this.remember()
    const sync = () => {
      if (!this.built) return
      if (!this.musicOn) this.music?.pause()
      else if (this.unlocked) this.startMusic()
    }
    if (this.built) sync()
    else if (this.loading) void this.loading.then(sync)
  }

  toggleMute(): boolean {
    const turningOff = this.sound || this.musicOn
    this.sound = !turningOff
    this.musicOn = !turningOff
    this.remember()
    if (this.built) {
      if (turningOff) this.music?.pause()
      else if (this.unlocked) this.startMusic()
    } else if (!turningOff && this.loading) {
      void this.loading.then(() => {
        if (this.built && this.unlocked && this.musicOn) this.startMusic()
      })
    }
    return this.muted
  }

  duck(forJingle: boolean): void {
    if (!this.music || !this.musicOn) return
    this.music.volume = forJingle ? 0.08 : 0.28
  }

  play(name: SfxName): void {
    if (!this.sound || !this.unlocked) return
    if (!this.built) {
      void this.ensure().then(() => {
        if (this.built) this.playNow(name)
      })
      return
    }
    this.playNow(name)
  }

  private playNow(name: SfxName): void {
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
    if (el.readyState >= 1) {
      try {
        el.currentTime = 0
      } catch {
        /* not seekable yet */
      }
    }
    void el.play().catch(() => {})
  }
}

export const audio = new AudioBus()
