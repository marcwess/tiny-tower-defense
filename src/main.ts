import { audio } from './audio'
import { Game } from './game'
import { Hud } from './ui'
import './style.css'

const app = document.getElementById('app')
if (!app) throw new Error('Missing #app')

const hud = new Hud(app)
const game = new Game(app, hud)

hud.onStart = () => {
  audio.unlock()
  game.startWave(true)
}
hud.onSpeed = () => game.toggleSpeed()
hud.onMute = () => game.toggleMute()
hud.onGear = () => game.openSettings()
hud.onDamage = () => game.toggleDamage()
hud.onRetry = () => {
  audio.unlock()
  game.retry()
}
hud.onNext = () => {
  audio.unlock()
  game.next()
}
hud.onPlay = () => {
  audio.unlock()
  game.playSelected()
}
hud.onPickLevel = (id) => game.previewLevel(id)
hud.onCoach = () => game.skipCoach()
hud.onCloseSettings = () => game.closeSettings()
hud.onSettings = (patch) => game.updateSettings(patch)
document.addEventListener('gesturestart', (event) => event.preventDefault())
hud.onAction = (id) => {
  audio.unlock()
  if (!game.act(id)) {
    audio.play('deny')
    hud.flashGold()
  }
}

void game.init().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  hud.setLoading(message)
  window.__TINY_TD__ = {
    ready: true,
    error: message,
    getState: () => ({
      ready: true,
      error: message,
      phase: 'error',
      gold: 0,
      wave: 0,
      waves: 0,
      pets: 0,
      petMax: 0,
      enemies: 0,
      kills: 0,
      leaks: 0,
      towers: 0,
      spawned: 0,
      rescues: 0,
      abductions: 0,
      stars: 0,
      carries: 0,
      fps: 0,
      draws: 0,
      zoom: 0,
      board: { width: 0, height: 0 },
      level: 1,
      pads: [],
      hint: { x: 0, z: 0 },
      tutor: 0,
      tier: 'low',
      log: [],
      gate: 99,
    }),
    cellKind: () => null,
    project: () => null,
    buy: () => false,
    startWave: () => {},
    setTimeScale: () => {},
    setGold: () => {},
    cameraFocus: () => {},
    cameraLook: () => {},
    deselect: () => {},
    select: () => {},
    debugAbduct: () => {},
    debugRescue: () => {},
    debugBoss: () => {},
    debugPreview: () => {},
    debugPop: () => {},
    debugWin: () => {},
    debugLose: () => {},
    retry: () => {},
    startLevel: () => {},
    next: () => {},
    debugTitle: () => {},
    debugSettings: () => {},
    debugCoach: () => {},
    iconUrl: () => '',
  }
})
