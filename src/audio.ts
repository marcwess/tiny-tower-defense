import { asset } from './assets'
import { perf } from './perf'
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

const VOICE_CAP = 10
const MUTE_KEY = 'tiny-td-muted'

class AudioBus {
  /** True when both effects and music are off. The HUD speaker uses this. */
  muted = false
  sound = true
  musicOn = true
  private unlocked = false
  private built = false
  private loading: Promise<void> | null = null
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicGain: GainNode | null = null
  private musicSource: AudioBufferSourceNode | null = null
  private buffers = new Map<string, AudioBuffer>()
  private voices: AudioBufferSourceNode[] = []
  private lastLaser = 0
  private lastHit = 0
  private readonly fetches = new Map<string, Promise<AudioBuffer>>()

  constructor() {
    const settings = loadSettings()
    this.sound = settings.sound
    this.musicOn = settings.music
    this.muted = !this.sound && !this.musicOn
  }

  /** One network fetch and one decode per file. */
  private buffer(path: string): Promise<AudioBuffer> {
    const url = asset(path)
    let pending = this.fetches.get(url)
    if (!pending) {
      pending = fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`audio ${res.status}`)
          return res.arrayBuffer()
        })
        .then((bytes) => this.context().decodeAudioData(bytes.slice(0)))
        .catch((error) => {
          this.fetches.delete(url)
          throw error
        })
      this.fetches.set(url, pending)
    }
    return pending
  }

  private context(): AudioContext {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctx()
      this.master = this.ctx.createGain()
      this.master.gain.value = 1
      this.master.connect(this.ctx.destination)
      this.musicGain = this.ctx.createGain()
      this.musicGain.gain.value = 0.28
      this.musicGain.connect(this.master)
    }
    return this.ctx
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
    this.context()
    const names = Object.keys(FILES) as Array<SfxName | 'music'>
    const buffers = await Promise.all(names.map((name) => this.buffer(FILES[name])))
    names.forEach((name, index) => this.buffers.set(name, buffers[index]))
  }

  unlock(): void {
    const first = !this.unlocked
    this.unlocked = true
    const ctx = this.context()
    void ctx.resume()
    void this.ensure().then(() => {
      if (first && this.built && this.musicOn) this.startMusic()
    })
  }

  private startMusic(): void {
    const ctx = this.ctx
    const buffer = this.buffers.get('music')
    if (!ctx || !buffer || !this.musicOn || !this.musicGain) return
    this.stopMusic()
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.connect(this.musicGain)
    source.start()
    this.musicSource = source
    this.musicGain.gain.value = 0.28
  }

  private stopMusic(): void {
    if (!this.musicSource) return
    try {
      this.musicSource.stop()
    } catch {
      /* already stopped */
    }
    this.musicSource.disconnect()
    this.musicSource = null
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
      if (!this.musicOn) this.stopMusic()
      else if (this.unlocked && !this.musicSource) this.startMusic()
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
      if (turningOff) this.stopMusic()
      else if (this.unlocked) this.startMusic()
    } else if (!turningOff && this.loading) {
      void this.loading.then(() => {
        if (this.built && this.unlocked && this.musicOn) this.startMusic()
      })
    }
    return this.muted
  }

  duck(forJingle: boolean): void {
    if (!this.musicGain || !this.musicOn) return
    this.musicGain.gain.value = forJingle ? 0.08 : 0.28
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
    const ctx = this.ctx
    const buffer = this.buffers.get(name)
    const master = this.master
    if (!ctx || !buffer || !master) return
    if (this.voices.length >= VOICE_CAP) {
      const oldest = this.voices.shift()
      try {
        oldest?.stop()
      } catch {
        /* already ended */
      }
    }
    const gain = ctx.createGain()
    gain.gain.value = VOLUME[name]
    gain.connect(master)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(gain)
    source.onended = () => {
      const index = this.voices.indexOf(source)
      if (index >= 0) this.voices.splice(index, 1)
      source.disconnect()
      gain.disconnect()
    }
    source.start()
    this.voices.push(source)
    perf.noteSound()
  }
}

export const audio = new AudioBus()
