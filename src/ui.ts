import { asset, heartUrl, pieceThumbnail } from './assets'
import type { WaveChip } from './config'
import type { Settings } from './progress'

export interface ActionButton {
  id: string
  label: string
  effect: string
  detail?: string
  cost: string
  enabled: boolean
  tone: 'blue' | 'green' | 'red' | 'yellow'
}

export interface SelectionView {
  title: string
  blurb: string
  stats: string
  actions: ActionButton[]
  anchor: { x: number; y: number } | null
}

export interface TitleLevel {
  id: number
  name: string
  blurb: string
  lock: string
  stars: number
  unlocked: boolean
  selected: boolean
}

export interface CoachBox {
  l: number
  t: number
  r: number
  b: number
}

export interface HandView {
  text: string
  x: number
  y: number
  part: string | null
}

export interface CoachView {
  text: string
  target: CoachBox
  avoid: CoachBox[]
  lane: Array<{ x: number; y: number }>
  pin?: 'down' | 'up' | 'left' | 'right'
}

export interface HudState {
  gold: number
  waveLabel: string
  pets: number
  petMax: number
  phase: string
  countdown: number
  countdownFull: number
  enemies: number
  speed: number
  muted: boolean
  damageNumbers: boolean
  hint: boolean
  startLabel: string
  startEnabled: boolean
  countdownLabel: string | null
  preview: WaveChip[] | null
  bannerTitle: string | null
  bannerChips: WaveChip[] | null
  selection: SelectionView | null
  end: { kind: 'win' | 'lose'; title: string; detail: string; stars: number } | null
  title: TitleLevel[] | null
  coach: HandView | null
  paused: boolean
  settingsOpen: boolean
  settings: Settings
  hapticsAvailable: boolean
}

export class Hud {
  onAction: (id: string) => void = () => {}
  onStart: () => void = () => {}
  onSpeed: () => void = () => {}
  onMute: () => void = () => {}
  onGear: () => void = () => {}
  onDamage: () => void = () => {}
  onRetry: () => void = () => {}
  onNext: () => void = () => {}
  onPlay: () => void = () => {}
  onPickLevel: (id: number) => void = () => {}
  onCoach: () => void = () => {}
  onPause: () => void = () => {}
  onResume: () => void = () => {}
  onQuit: () => void = () => {}
  onCloseSettings: () => void = () => {}
  onSettings: (patch: Partial<Settings>) => void = () => {}

  private root: HTMLElement
  private goldEl: HTMLElement
  private waveEl: HTMLElement
  private petsEl: HTMLElement
  private muteEl: HTMLButtonElement | null
  private speedEl: HTMLButtonElement
  private startEl: HTMLButtonElement
  private startLabelEl: HTMLElement
  private startRing: SVGCircleElement
  private hintEl: HTMLElement
  private cardEl: HTMLElement
  private blurbEl: HTMLElement
  private trayEl: HTMLElement
  private endEl: HTMLElement
  private endTitle: HTMLElement
  private endDetail: HTMLElement
  private endIcon: HTMLImageElement
  private starsEl: HTMLElement
  private previewEl: HTMLElement
  private bannerEl: HTMLElement
  private bannerTitle: HTMLElement
  private bannerChipsEl: HTMLElement
  private countEl: HTMLElement
  private damageEl: HTMLButtonElement
  private loadingEl: HTMLElement
  private loadingText: HTMLElement
  private signature = ''
  private starSignature = ''
  private gold = -1
  private actions: ActionButton[] = []
  private focusedId: string | null = null
  private holdTimer = 0
  private suppressClick = false
  private muteIcon: HTMLImageElement | null
  private radialEl: HTMLElement
  private handEl: HTMLElement
  private handLine: HTMLElement
  private pauseEl: HTMLElement
  private pauseBtn: HTMLButtonElement
  private soundBtn: HTMLButtonElement
  private titleElScreen: HTMLElement
  private levelsEl: HTMLElement
  private sheetEl: HTMLElement
  private nextEl: HTMLButtonElement
  private levelsBtn: HTMLButtonElement
  private titleSig = ''

  constructor(app: HTMLElement) {
    app.innerHTML = `
      <div id="hud">
        <header id="top">
          <div class="pill gold" id="gold"><img alt="" src="${asset('assets/icons/coin.png')}" /><span>0</span></div>
          <div class="pill wave" id="wave"><img alt="" src="${asset('assets/icons/flag.png')}" /><span>1/9</span></div>
          <div class="pill pets" id="pets"><img alt="" src="${heartUrl()}" /><span>5</span></div>
          <button type="button" id="pause" class="round hud-round" aria-label="Pause"><span class="pause-glyph"></span></button>
        </header>
        <div id="banner" hidden>
          <p id="banner-title"></p>
          <div id="banner-chips"></div>
        </div>
        <div id="dock">
          <div id="preview" class="chip-row" hidden></div>
          <p id="hint" hidden></p>
          <section id="card" hidden>
            <h2 id="card-title"></h2>
            <p id="card-stats"></p>
            <p id="card-blurb" hidden></p>
            <div id="tray"></div>
          </section>
          <div id="actions">
            <button type="button" id="speed" class="btn yellow">1×</button>
            <button type="button" id="dmg" class="btn yellow" hidden aria-pressed="true">Nums</button>
            <div id="count" hidden></div>
            <button type="button" id="start" class="btn green">
              <svg class="count-ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18"></circle></svg>
              <span id="start-label">Call wave</span>
            </button>
          </div>
        </div>
      </div>
      <div id="end" hidden>
        <div class="card end-card">
          <img id="end-icon" alt="" src="${heartUrl()}" />
          <div id="stars" hidden></div>
          <h1 id="end-title"></h1>
          <p id="end-detail"></p>
          <div id="end-row">
            <button type="button" id="retry" class="btn green">Retry</button>
            <button type="button" id="next" class="btn blue">Next</button>
            <button type="button" id="to-levels" class="btn blue" hidden>Levels</button>
          </div>
        </div>
      </div>
      <div id="title" hidden>
        <div id="title-copy">
          <h1><span>Tiny</span><span>Tower</span><span>Defense</span></h1>
        </div>
        <div id="title-band">
          <button type="button" id="play" class="btn green">Play</button>
          <div id="levels"></div>
        </div>
      </div>
      <div id="radial" hidden></div>
      <div id="hand" hidden>
        <img id="hand-img" alt="" src="${asset('assets/ui/mobile-controls/Sprites/Icons/Default/icon_hand.png')}" />
        <p id="hand-line"></p>
        <button type="button" id="hand-skip" class="btn yellow">Skip</button>
      </div>
      <div id="pause-menu" hidden>
        <div class="sheet">
          <h2>Paused</h2>
          <button type="button" id="resume" class="btn green">Resume</button>
          <button type="button" id="restart" class="btn blue">Restart</button>
          <button type="button" id="pause-settings" class="btn blue">Settings</button>
          <button type="button" id="pause-sound" class="btn yellow">Sound</button>
          <button type="button" id="quit" class="btn red">Quit</button>
        </div>
      </div>
      <div id="coach" hidden>
        <img id="coach-arrow" alt="" src="${asset('assets/ui/ui-pack/PNG/Green/Default/arrow_basic_s.png')}" />
        <p id="coach-text"></p>
        <button type="button" id="coach-next" class="btn yellow">Next</button>
      </div>
      <div id="sheet" hidden>
        <div class="sheet">
          <h2>Settings</h2>
          <button type="button" data-set="sound">Sound</button>
          <button type="button" data-set="music">Music</button>
          <button type="button" data-set="haptics">Haptics</button>
          <button type="button" data-set="damage">Damage numbers</button>
          <div id="quality" class="quality">
            <span>Quality</span>
            <button type="button" data-quality="auto">Auto</button>
            <button type="button" data-quality="low">Low</button>
            <button type="button" data-quality="high">High</button>
          </div>
          <button type="button" id="sheet-close" class="btn blue">Close</button>
        </div>
      </div>
      <div id="loading">
        <h1>Tiny Tower Defense</h1>
        <p id="loading-text">Raising the meadow…</p>
      </div>
    `
    this.root = app
    this.goldEl = this.need('#gold span')
    this.waveEl = this.need('#wave span')
    this.petsEl = this.need('#pets span')
    this.muteEl = this.root.querySelector('#mute') as HTMLButtonElement | null
    this.muteIcon = this.root.querySelector('#mute img') as HTMLImageElement | null
    this.radialEl = this.need('#radial')
    this.handEl = this.need('#hand')
    this.handLine = this.need('#hand-line')
    this.pauseEl = this.need('#pause-menu')
    this.pauseBtn = this.need('#pause') as HTMLButtonElement
    this.soundBtn = this.need('#pause-sound') as HTMLButtonElement
    this.speedEl = this.need('#speed') as HTMLButtonElement
    this.startEl = this.need('#start') as HTMLButtonElement
    this.startLabelEl = this.need('#start-label')
    this.startRing = this.need('#start .count-ring circle') as unknown as SVGCircleElement
    this.hintEl = this.need('#hint')
    this.cardEl = this.need('#card')
    this.blurbEl = this.need('#card-blurb')
    this.trayEl = this.need('#tray')
    this.endEl = this.need('#end')
    this.endTitle = this.need('#end-title')
    this.endDetail = this.need('#end-detail')
    this.endIcon = this.need('#end-icon') as HTMLImageElement
    this.starsEl = this.need('#stars')
    this.previewEl = this.need('#preview')
    this.bannerEl = this.need('#banner')
    this.bannerTitle = this.need('#banner-title')
    this.bannerChipsEl = this.need('#banner-chips')
    this.countEl = this.need('#count')
    this.damageEl = this.need('#dmg') as HTMLButtonElement
    this.loadingEl = this.need('#loading')
    this.loadingText = this.need('#loading-text')
    this.titleElScreen = this.need('#title')
    this.levelsEl = this.need('#levels')
    this.sheetEl = this.need('#sheet')
    this.nextEl = this.need('#next') as HTMLButtonElement
    this.levelsBtn = this.need('#to-levels') as HTMLButtonElement

    this.speedEl.addEventListener('click', () => this.onSpeed())
    this.startEl.addEventListener('click', () => this.onStart())
    this.muteEl?.addEventListener('click', () => this.onMute())
    this.root.querySelector('#gear')?.addEventListener('click', () => this.onGear())
    this.pauseBtn.addEventListener('click', () => this.onPause())
    this.need('#resume').addEventListener('click', () => this.onResume())
    this.need('#restart').addEventListener('click', () => this.onRetry())
    this.need('#pause-settings').addEventListener('click', () => this.onGear())
    this.soundBtn.addEventListener('click', () => this.onMute())
    this.need('#quit').addEventListener('click', () => this.onQuit())
    this.need('#hand-skip').addEventListener('click', () => this.onCoach())
    this.damageEl.addEventListener('click', () => this.onDamage())
    this.need('#retry').addEventListener('click', () => this.onRetry())
    this.nextEl.addEventListener('click', () => this.onNext())
    this.levelsBtn.addEventListener('click', () => this.onNext())
    this.need('#play').addEventListener('click', () => this.onPlay())
    this.need('#coach-next').addEventListener('click', () => this.onCoach())
    this.need('#sheet-close').addEventListener('click', () => this.onCloseSettings())
    this.sheetEl.addEventListener('click', (event) => {
      if (event.target === this.sheetEl) this.onCloseSettings()
    })
    this.levelsEl.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('button')
      const id = Number(button?.dataset.level)
      if (id) this.onPickLevel(id)
    })
    this.sheetEl.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('button')
      if (!(button instanceof HTMLButtonElement)) return
      if (button.dataset.set) {
        const key = button.dataset.set as 'sound' | 'music' | 'haptics' | 'damage'
        const on = button.getAttribute('aria-pressed') !== 'true'
        this.onSettings({ [key]: on })
      }
      if (button.dataset.quality) {
        const quality = button.dataset.quality as Settings['quality']
        this.onSettings({ quality })
      }
    })
    this.trayEl.addEventListener('pointerdown', (event) => {
      const button = (event.target as HTMLElement).closest('button')
      const id = button?.dataset.part
      if (!id) return
      window.clearTimeout(this.holdTimer)
      this.holdTimer = window.setTimeout(() => {
        this.suppressClick = true
        this.focusedId = id
        this.showFocused()
      }, 420)
    })
    const cancelHold = () => window.clearTimeout(this.holdTimer)
    this.trayEl.addEventListener('pointerup', cancelHold)
    this.trayEl.addEventListener('pointercancel', cancelHold)
    this.trayEl.addEventListener('pointerleave', cancelHold)
    this.trayEl.addEventListener('click', (event) => {
      if (this.suppressClick) {
        this.suppressClick = false
        event.preventDefault()
        return
      }
      const button = (event.target as HTMLElement).closest('button')
      const id = button?.dataset.part
      if (id) this.onAction(id)
    })
    this.radialEl.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('button')
      const id = button?.dataset.part
      if (!id || button?.classList.contains('off')) {
        if (id) this.onAction(id)
        return
      }
      if (id) this.onAction(id)
    })
  }

  private showFocused(): void {
    const action = this.actions.find((item) => item.id === this.focusedId)
    this.blurbEl.hidden = !action?.detail
    this.blurbEl.textContent = action?.detail ?? ''
    this.trayEl.querySelectorAll('button').forEach((button) => {
      button.classList.toggle('hot', button.dataset.part === this.focusedId)
    })
  }

  setLoading(text: string | null): void {
    if (text === null) {
      this.loadingEl.hidden = true
      return
    }
    this.loadingEl.hidden = false
    this.loadingText.textContent = text
  }

  private coinPool: HTMLImageElement[] = []
  private coinCursor = 0
  private coinDest = { x: 0, y: 0, ready: false }

  rememberLayout(): void {
    const icon = this.goldEl.parentElement?.querySelector('img')
    if (!(icon instanceof HTMLImageElement)) return
    const dest = icon.getBoundingClientRect()
    this.coinDest.x = dest.left + (dest.width - 22) / 2
    this.coinDest.y = dest.top + (dest.height - 22) / 2
    this.coinDest.ready = dest.width > 0
  }

  flyCoin(x: number, y: number): void {
    if (!this.coinDest.ready) return
    let coin = this.coinPool[this.coinCursor]
    if (!coin) {
      coin = document.createElement('img')
      coin.alt = ''
      coin.className = 'fly-coin'
      coin.src = asset('assets/icons/coin.png')
      this.root.appendChild(coin)
      this.coinPool.push(coin)
    }
    this.coinCursor = (this.coinCursor + 1) % 8
    const dx = this.coinDest.x
    const dy = this.coinDest.y
    const hopX = x + (dx - x) * 0.42
    const hopY = Math.min(y, dy) - 22
    coin.style.opacity = '1'
    const anim = coin.animate(
      [
        { transform: `translate(${x - 11}px, ${y - 11}px) scale(0.65)`, opacity: 1 },
        { transform: `translate(${hopX}px, ${hopY}px) scale(1.35)`, opacity: 1, offset: 0.38 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.22)`, opacity: 0.2 },
      ],
      { duration: 340, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' },
    )
    const finish = () => {
      coin.style.opacity = '0'
    }
    void anim.finished.then(finish, finish)
  }

  flashGold(): void {
    const pill = this.goldEl.parentElement
    if (!pill) return
    pill.classList.remove('shake')
    window.requestAnimationFrame(() => pill.classList.add('shake'))
  }

  /** Coin flights and other DOM ghosts. World popups are cleared on the effect system. */
  clearTransient(): void {
    this.root.querySelectorAll('.fly-coin').forEach((node) => node.remove())
  }

  render(state: HudState): void {
    if (state.gold !== this.gold) {
      this.gold = state.gold
      this.goldEl.textContent = String(state.gold)
    }
    this.waveEl.textContent = state.waveLabel.replace(/^Wave\s+/i, '')
    this.petsEl.textContent = `${state.pets}/${state.petMax}`
    if (this.muteIcon && this.muteEl) {
      const nextSrc = asset(state.muted ? 'assets/icons/audio-off.png' : 'assets/icons/audio-on.png')
      if (!this.muteIcon.src.endsWith(nextSrc.slice(nextSrc.lastIndexOf('/') + 1))) this.muteIcon.src = nextSrc
      this.muteEl.setAttribute('aria-label', state.muted ? 'Muted' : 'Sound')
      this.muteEl.setAttribute('aria-pressed', state.muted ? 'true' : 'false')
    }
    this.soundBtn.textContent = state.muted ? 'Sound off' : 'Sound on'
    this.pauseBtn.hidden = state.phase === 'title'
    this.pauseEl.hidden = !state.paused
    this.speedEl.textContent = `${state.speed}×`
    this.speedEl.classList.toggle('pressed', state.speed > 1)
    this.damageEl.textContent = state.damageNumbers ? 'Nums' : 'Nums off'
    this.damageEl.setAttribute('aria-pressed', state.damageNumbers ? 'true' : 'false')
    this.damageEl.classList.toggle('pressed', state.damageNumbers)
    this.startLabelEl.textContent = state.startLabel
    this.startEl.disabled = !state.startEnabled
    this.countEl.hidden = true
    const counting = state.countdown > 0.05 && (state.phase === 'ready' || state.phase === 'breather')
    this.startEl.classList.toggle('counting', counting)
    const length = 2 * Math.PI * 18
    const full = Math.max(0.2, state.countdownFull || 1)
    const left = counting ? Math.max(0, Math.min(1, state.countdown / full)) : 0
    this.startRing.style.strokeDasharray = `${length}`
    this.startRing.style.strokeDashoffset = `${length * (1 - left)}`
    this.hintEl.hidden = true
    this.fillChips(this.previewEl, state.preview, 'chip')
    this.bannerEl.hidden = !state.bannerTitle
    this.bannerTitle.textContent = state.bannerTitle ?? ''
    this.fillChips(this.bannerChipsEl, state.bannerChips, 'bchip')

    this.cardEl.hidden = true
    this.renderRadial(state.selection)

    if (state.end) {
      this.endEl.hidden = false
      this.endEl.dataset.kind = state.end.kind
      this.endTitle.textContent = state.end.title
      this.endDetail.textContent = state.end.detail
      const stars = state.end.kind === 'win' ? state.end.stars : 0
      this.starsEl.hidden = stars <= 0
      const starKey = `${state.end.kind}:${stars}`
      if (starKey !== this.starSignature) {
        this.starSignature = starKey
        this.starsEl.innerHTML = ''
        if (stars > 0) {
          const filled = asset('assets/ui/ui-pack/PNG/Yellow/Double/star.png')
          const empty = asset('assets/ui/ui-pack/PNG/Yellow/Double/star_outline.png')
          for (let i = 0; i < 3; i++) {
            const img = document.createElement('img')
            img.alt = i < stars ? 'Star' : 'Empty star'
            img.src = i < stars ? filled : empty
            this.starsEl.appendChild(img)
          }
        }
      }
      this.endIcon.src =
        state.end.kind === 'win' ? heartUrl() : asset('assets/ui/ui-pack/PNG/Red/Double/icon_cross.png')
      const lose = state.end.kind === 'lose'
      this.nextEl.hidden = lose
      this.levelsBtn.hidden = !lose
    } else {
      this.endEl.hidden = true
      this.starSignature = ''
    }
    this.renderTitle(state.title)
    this.renderHand(state.coach)
    this.renderSettings(state)
  }

  private ringSpots(count: number): Array<{ x: number; y: number; pillX: number; pillY: number }> {
    const angles = count <= 2 ? [-Math.PI / 2, Math.PI / 2] : [-Math.PI / 2, 0, Math.PI / 2, Math.PI]
    const radius = 88
    return angles.slice(0, count).map((angle) => {
      const pill = radius + 40
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        pillX: Math.cos(angle) * pill,
        pillY: Math.sin(angle) * pill,
      }
    })
  }

  private renderRadial(selection: SelectionView | null): void {
    if (!selection || selection.actions.length === 0 || !selection.anchor) {
      this.radialEl.hidden = true
      this.signature = ''
      this.actions = []
      return
    }
    this.radialEl.hidden = false
    const spots = this.ringSpots(selection.actions.length)
    let minX = 0
    let maxX = 0
    let minY = 0
    let maxY = 0
    for (const spot of spots) {
      minX = Math.min(minX, spot.x - 34, spot.pillX - 28)
      maxX = Math.max(maxX, spot.x + 34, spot.pillX + 28)
      minY = Math.min(minY, spot.y - 34, spot.pillY - 14)
      maxY = Math.max(maxY, spot.y + 34, spot.pillY + 14)
    }
    const viewW = window.innerWidth
    const viewH = window.innerHeight
    const topBar = document.querySelector('#top')?.getBoundingClientRect().bottom ?? 58
    const bottomBar = document.querySelector('#actions')?.getBoundingClientRect().top ?? viewH - 72
    const margin = 8
    let originX = selection.anchor.x
    let originY = selection.anchor.y
    if (originX + minX < margin) originX = margin - minX
    if (originX + maxX > viewW - margin) originX = viewW - margin - maxX
    if (originY + minY < topBar + 4) originY = topBar + 4 - minY
    if (originY + maxY > bottomBar - 6) originY = bottomBar - 6 - maxY
    this.radialEl.style.left = `${originX}px`
    this.radialEl.style.top = `${originY}px`
    this.actions = selection.actions
    const sig = selection.actions.map((action) => action.id).join('|')
    if (sig !== this.signature) {
      this.signature = sig
      this.radialEl.replaceChildren()
      const coin = asset('assets/icons/coin.png')
      const arrow = asset('assets/ui/ui-pack/PNG/Extra/Double/icon_arrow_up_dark.png')
      selection.actions.forEach((action, index) => {
        const spot = spots[index]
        const button = document.createElement('button')
        button.type = 'button'
        button.dataset.part = action.id
        button.className = `radial-btn ${action.tone}`
        button.style.left = `${spot.x}px`
        button.style.top = `${spot.y}px`
        button.setAttribute('aria-label', action.label)
        const thumb =
          action.id === 'upgrade' ? arrow : action.id === 'sell' ? coin : pieceThumbnail(action.id)
        if (thumb) {
          const img = document.createElement('img')
          img.alt = ''
          img.src = thumb
          button.append(img)
        }
        const pill = document.createElement('span')
        pill.className = 'radial-pill'
        pill.style.left = `${spot.pillX}px`
        pill.style.top = `${spot.pillY}px`
        const coinImg = document.createElement('img')
        coinImg.alt = ''
        coinImg.src = coin
        const num = document.createElement('span')
        num.className = 'cost-num'
        num.textContent = action.cost
        pill.append(coinImg, num)
        this.radialEl.append(button, pill)
      })
    }
    const buttons = this.radialEl.querySelectorAll('button')
    selection.actions.forEach((action, index) => {
      const button = buttons[index] as HTMLButtonElement | undefined
      if (!button) return
      button.classList.toggle('off', !action.enabled)
      button.setAttribute('aria-disabled', action.enabled ? 'false' : 'true')
      const pill = this.radialEl.querySelectorAll('.radial-pill')[index]
      const cost = pill?.querySelector('.cost-num')
      if (cost && cost.textContent !== action.cost) cost.textContent = action.cost
    })
  }

  private renderHand(hand: HandView | null): void {
    this.handEl.hidden = !hand
    if (!hand) return
    if (this.handLine.textContent !== hand.text) this.handLine.textContent = hand.text
    let x = hand.x
    let y = hand.y
    if (hand.part) {
      const node =
        hand.part === 'start'
          ? document.querySelector('#start')
          : document.querySelector(`#radial [data-part="${hand.part}"]`)
      if (node instanceof HTMLElement) {
        const box = node.getBoundingClientRect()
        if (box.width > 2) {
          x = box.left + box.width * 0.55
          y = box.top + box.height * 0.45
        }
      }
    }
    const viewW = window.innerWidth
    const viewH = window.innerHeight
    const room = 132
    const flip = x > viewW - room
    this.handEl.classList.toggle('flip', flip)
    if (flip) x = Math.max(room, Math.min(viewW - 20, x))
    else x = Math.max(20, Math.min(viewW - room, x))
    y = Math.max(72, Math.min(viewH - 150, y))
    this.handEl.style.left = `${x}px`
    this.handEl.style.top = `${y}px`
  }

  private renderTitle(levels: TitleLevel[] | null): void {
    const show = !!levels
    this.titleElScreen.hidden = !show
    this.root.classList.toggle('mode-title', show)
    if (!levels) {
      this.titleSig = ''
      return
    }
    const sig = levels.map((level) => `${level.id}:${level.stars}:${level.unlocked}:${level.selected}`).join('|')
    if (sig === this.titleSig) return
    this.titleSig = sig
    const filled = asset('assets/ui/ui-pack/PNG/Yellow/Double/star.png')
    const empty = asset('assets/ui/ui-pack/PNG/Yellow/Double/star_outline.png')
    this.levelsEl.replaceChildren()
    for (const level of levels) {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.level = String(level.id)
      button.className = 'level'
      button.disabled = !level.unlocked
      button.classList.toggle('selected', level.selected)
      button.classList.toggle('locked', !level.unlocked)
      const stars = document.createElement('span')
      stars.className = 'level-stars'
      for (let i = 0; i < 3; i++) {
        const img = document.createElement('img')
        img.alt = ''
        img.src = i < level.stars ? filled : empty
        stars.append(img)
      }
      const name = document.createElement('span')
      name.className = 'level-name'
      if (level.unlocked) {
        name.textContent = level.name
        const blurb = document.createElement('span')
        blurb.className = 'level-blurb'
        blurb.textContent = level.blurb
        button.append(name, blurb, stars)
      } else {
        const icon = document.createElement('img')
        icon.className = 'level-lock'
        icon.alt = ''
        icon.src = asset('assets/ui/mobile-controls/Sprites/Icons/Default/icon_lock.png')
        name.textContent = level.lock || 'Locked'
        button.append(icon, name)
      }
      this.levelsEl.append(button)
    }
  }

  private renderSettings(state: HudState): void {
    this.sheetEl.hidden = !state.settingsOpen
    const rows: Array<['sound' | 'music' | 'haptics' | 'damage', boolean]> = [
      ['sound', state.settings.sound],
      ['music', state.settings.music],
      ['haptics', state.settings.haptics],
      ['damage', state.settings.damage],
    ]
    for (const [key, on] of rows) {
      const button = this.sheetEl.querySelector(`[data-set="${key}"]`)
      if (!(button instanceof HTMLButtonElement)) continue
      button.setAttribute('aria-pressed', on ? 'true' : 'false')
      button.disabled = key === 'haptics' && !state.hapticsAvailable
      const label = button.dataset.label ?? button.textContent?.replace(/: .*$/, '') ?? key
      button.dataset.label = label
      button.textContent = `${label}: ${on ? 'On' : 'Off'}`
    }
    this.sheetEl.querySelectorAll('[data-quality]').forEach((node) => {
      if (!(node instanceof HTMLButtonElement)) return
      node.classList.toggle('pressed', node.dataset.quality === state.settings.quality)
    })
  }

  private fillChips(host: HTMLElement, chips: WaveChip[] | null, kind: 'chip' | 'bchip'): void {
    const list = chips ?? []
    host.hidden = list.length === 0
    const sig = list.map((chip) => `${chip.count}|${chip.name}|${chip.weak}|${chip.tint}`).join(';')
    if (host.dataset.sig === sig) return
    host.dataset.sig = sig
    host.replaceChildren()
    for (const chip of list) {
      const row = document.createElement('span')
      row.className = kind
      const swatch = document.createElement('i')
      swatch.style.background = chip.tint
      row.append(swatch)
      if (kind === 'chip') {
        const label = document.createElement('span')
        label.textContent = String(chip.count)
        row.append(label)
      } else {
        const copy = document.createElement('span')
        copy.className = 'bchip-copy'
        const name = document.createElement('span')
        name.textContent = `${chip.count} ${chip.name}`
        copy.append(name)
        for (const part of chip.weak.split('/')) {
          const line = document.createElement('span')
          line.textContent = part
          copy.append(line)
        }
        row.append(copy)
      }
      host.append(row)
    }
  }

  private need(selector: string): HTMLElement {
    const node = this.root.querySelector(selector)
    if (!node) throw new Error(`Missing ${selector}`)
    return node as HTMLElement
  }
}
