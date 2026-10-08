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

export interface CoachView {
  text: string
  target: CoachBox
  avoid: CoachBox[]
  lane: Array<{ x: number; y: number }>
}

export interface HudState {
  gold: number
  waveLabel: string
  pets: number
  petMax: number
  phase: string
  countdown: number
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
  coach: CoachView | null
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
  onCloseSettings: () => void = () => {}
  onSettings: (patch: Partial<Settings>) => void = () => {}

  private root: HTMLElement
  private goldEl: HTMLElement
  private waveEl: HTMLElement
  private petsEl: HTMLElement
  private muteEl: HTMLButtonElement
  private speedEl: HTMLButtonElement
  private startEl: HTMLButtonElement
  private hintEl: HTMLElement
  private cardEl: HTMLElement
  private titleEl: HTMLElement
  private blurbEl: HTMLElement
  private statsEl: HTMLElement
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
  private muteIcon: HTMLImageElement
  private titleElScreen: HTMLElement
  private levelsEl: HTMLElement
  private coachEl: HTMLElement
  private coachText: HTMLElement
  private sheetEl: HTMLElement
  private nextEl: HTMLButtonElement
  private levelsBtn: HTMLButtonElement
  private titleSig = ''
  private coachSig = ''

  constructor(app: HTMLElement) {
    app.innerHTML = `
      <div id="hud">
        <header id="top">
          <div class="pill gold" id="gold"><img alt="" src="${asset('assets/icons/coin.png')}" /><span>0</span></div>
          <div class="pill wave" id="wave"><img alt="" src="${asset('assets/icons/flag.png')}" /><span>1/9</span></div>
          <div class="pill pets" id="pets"><img alt="" src="${heartUrl()}" /><span>5</span></div>
          <button type="button" id="mute" class="round" aria-label="Sound"><img alt="" src="${asset('assets/icons/audio-on.png')}" /></button>
          <button type="button" id="gear" class="round" aria-label="Settings"><img alt="" src="${asset('assets/ui/mobile-controls/Sprites/Icons/Default/icon_cog.png')}" /></button>
        </header>
        <div id="banner" hidden>
          <p id="banner-title"></p>
          <div id="banner-chips"></div>
        </div>
        <div id="dock">
          <div id="preview" class="chip-row" hidden></div>
          <p id="hint"></p>
          <section id="card" hidden>
            <h2 id="card-title"></h2>
            <p id="card-stats"></p>
            <p id="card-blurb" hidden></p>
            <div id="tray"></div>
          </section>
          <div id="actions">
            <button type="button" id="speed" class="btn yellow">1×</button>
            <button type="button" id="dmg" class="btn yellow" aria-pressed="true">Nums</button>
            <div id="count" hidden></div>
            <button type="button" id="start" class="btn green">Call wave</button>
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
    this.muteEl = this.need('#mute') as HTMLButtonElement
    this.muteIcon = this.need('#mute img') as HTMLImageElement
    this.speedEl = this.need('#speed') as HTMLButtonElement
    this.startEl = this.need('#start') as HTMLButtonElement
    this.hintEl = this.need('#hint')
    this.cardEl = this.need('#card')
    this.titleEl = this.need('#card-title')
    this.blurbEl = this.need('#card-blurb')
    this.statsEl = this.need('#card-stats')
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
    this.coachEl = this.need('#coach')
    this.coachText = this.need('#coach-text')
    this.sheetEl = this.need('#sheet')
    this.nextEl = this.need('#next') as HTMLButtonElement
    this.levelsBtn = this.need('#to-levels') as HTMLButtonElement

    this.speedEl.addEventListener('click', () => this.onSpeed())
    this.startEl.addEventListener('click', () => this.onStart())
    this.muteEl.addEventListener('click', () => this.onMute())
    this.need('#gear').addEventListener('click', () => this.onGear())
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

  flyCoin(x: number, y: number): void {
    const icon = this.goldEl.parentElement?.querySelector('img')
    if (!(icon instanceof HTMLImageElement)) return
    const coin = document.createElement('img')
    coin.alt = ''
    coin.className = 'fly-coin'
    coin.src = asset('assets/icons/coin.png')
    this.root.appendChild(coin)
    const dest = icon.getBoundingClientRect()
    const size = 22
    const dx = dest.left + (dest.width - size) / 2
    const dy = dest.top + (dest.height - size) / 2
    const hopX = x + (dx - x) * 0.42
    const hopY = Math.min(y, dy) - 22
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      coin.remove()
      this.flashGold()
    }
    const anim = coin.animate(
      [
        { transform: `translate(${x - size / 2}px, ${y - size / 2}px) scale(0.65)`, opacity: 1 },
        { transform: `translate(${hopX}px, ${hopY}px) scale(1.35)`, opacity: 1, offset: 0.38 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.22)`, opacity: 0.2 },
      ],
      { duration: 340, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' },
    )
    void anim.finished.then(finish, finish)
    window.setTimeout(finish, 420)
  }

  flashGold(): void {
    const pill = this.goldEl.parentElement
    pill?.classList.remove('shake')
    void pill?.offsetWidth
    pill?.classList.add('shake')
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
    this.muteIcon.src = asset(state.muted ? 'assets/icons/audio-off.png' : 'assets/icons/audio-on.png')
    this.muteEl.setAttribute('aria-label', state.muted ? 'Muted' : 'Sound')
    this.muteEl.setAttribute('aria-pressed', state.muted ? 'true' : 'false')
    this.speedEl.textContent = `${state.speed}×`
    this.speedEl.classList.toggle('pressed', state.speed > 1)
    this.damageEl.textContent = state.damageNumbers ? 'Nums' : 'Nums off'
    this.damageEl.setAttribute('aria-pressed', state.damageNumbers ? 'true' : 'false')
    this.damageEl.classList.toggle('pressed', state.damageNumbers)
    this.startEl.textContent = state.startLabel
    this.startEl.disabled = !state.startEnabled
    this.countEl.hidden = !state.countdownLabel
    this.countEl.textContent = state.countdownLabel ?? ''
    this.hintEl.textContent = 'Tap a pad to build, then stack a weapon. Taller towers reach farther.'
    this.hintEl.hidden = !state.hint
    this.fillChips(this.previewEl, state.preview, 'chip')
    this.bannerEl.hidden = !state.bannerTitle
    this.bannerTitle.textContent = state.bannerTitle ?? ''
    this.fillChips(this.bannerChipsEl, state.bannerChips, 'bchip')

    if (!state.selection) {
      this.cardEl.hidden = true
      this.signature = ''
      this.focusedId = null
      this.actions = []
    } else {
      this.cardEl.hidden = false
      this.titleEl.textContent = state.selection.title
      this.statsEl.textContent = state.selection.stats
      this.actions = state.selection.actions
      const sig = state.selection.actions.map((action) => action.id).join('|')
      if (sig !== this.signature) {
        this.signature = sig
        this.focusedId = null
        this.trayEl.innerHTML = ''
        const coin = asset('assets/icons/coin.png')
        for (const action of state.selection.actions) {
          const button = document.createElement('button')
          button.type = 'button'
          button.dataset.part = action.id
          button.className = `piece ${action.tone}`
          const thumb =
            action.id === 'upgrade'
              ? asset('assets/ui/ui-pack/PNG/Yellow/Double/star.png')
              : pieceThumbnail(action.id)
          const art = thumb
            ? `<img class="thumb" alt="" src="${thumb}" />`
            : `<img class="thumb fallback" alt="" src="${coin}" />`
          button.innerHTML = `${art}<span class="piece-name">${action.label}</span><span class="piece-effect">${action.effect}</span><span class="piece-cost"><img class="coin" alt="" src="${coin}" /><span class="cost-num">${action.cost}</span></span>`
          this.trayEl.appendChild(button)
        }
      }
      const buttons = this.trayEl.querySelectorAll('button')
      state.selection.actions.forEach((action, index) => {
        const button = buttons[index] as HTMLButtonElement | undefined
        if (!button) return
        button.setAttribute('aria-disabled', action.enabled ? 'false' : 'true')
        const cost = button.querySelector('.cost-num')
        if (cost) cost.textContent = action.cost
        button.classList.toggle('off', !action.enabled)
        button.classList.toggle('hot', action.id === this.focusedId)
      })
      this.showFocused()
      this.syncCardFade()
    }

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
    this.renderCoach(state.coach)
    this.renderSettings(state)
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

  private renderCoach(coach: CoachView | null): void {
    this.coachEl.hidden = !coach
    if (!coach) {
      this.coachSig = ''
      return
    }
    const sig = `${coach.text}:${Math.round(coach.target.l)}:${Math.round(coach.target.t)}:${Math.round(coach.target.r)}`
    if (sig === this.coachSig) return
    this.coachSig = sig
    this.coachText.textContent = coach.text
    this.coachEl.hidden = false
    const spot = this.placeCoach(coach)
    this.coachEl.dataset.side = spot.side
    this.coachEl.style.left = `${spot.x}px`
    this.coachEl.style.top = `${spot.y}px`
  }

  private placeCoach(coach: CoachView): { x: number; y: number; side: string } {
    const bubbleW = this.coachEl.offsetWidth || 220
    const bubbleH = this.coachEl.offsetHeight || 96
    const vw = window.innerWidth
    const vh = window.innerHeight
    const margin = 14
    const gap = 22
    const target = coach.target
    const cx = (target.l + target.r) / 2
    const cy = (target.t + target.b) / 2
    const candidates: Array<{ x: number; y: number; side: string; prefer?: boolean }> = [
      { x: cx - bubbleW / 2, y: target.t - gap - bubbleH, side: 'down' },
      { x: cx - bubbleW / 2, y: target.t - bubbleH - 48, side: 'down' },
      { x: cx - bubbleW / 2, y: target.b + gap, side: 'up' },
      { x: target.l - gap - bubbleW, y: cy - bubbleH / 2, side: 'right' },
      { x: target.r + gap, y: cy - bubbleH / 2, side: 'left' },
      { x: margin, y: cy - bubbleH / 2, side: 'right' },
      { x: vw - margin - bubbleW, y: cy - bubbleH / 2, side: 'left' },
      { x: margin, y: target.t - gap - bubbleH, side: 'down' },
      { x: vw - margin - bubbleW, y: target.t - gap - bubbleH, side: 'down' },
    ]
    const panel = coach.avoid.find((box) => box.r - box.l > vw * 0.55 && box.b - box.t > 70)
    if (panel) {
      candidates.unshift({
        x: cx - bubbleW / 2,
        y: panel.t - gap - bubbleH,
        side: 'down',
        prefer: true,
      })
    }
    for (const avoid of coach.avoid) {
      const y = avoid.t - gap - bubbleH
      if (Math.abs(cy - (y + bubbleH / 2)) > 220) continue
      candidates.push({ x: cx - bubbleW / 2, y, side: 'down' })
      candidates.push({ x: margin, y, side: 'down' })
    }
    let best = { x: margin, y: margin + 72, side: 'down', score: Infinity }
    for (const candidate of candidates) {
      const x = Math.min(vw - margin - bubbleW, Math.max(margin, candidate.x))
      const y = Math.min(vh - margin - bubbleH, Math.max(margin, candidate.y))
      const rect = { l: x, t: y, r: x + bubbleW, b: y + bubbleH }
      const dist = Math.hypot((rect.l + rect.r) / 2 - cx, (rect.t + rect.b) / 2 - cy)
      let score = dist
      if (this.boxesOverlap(rect, this.padBox(target, 10))) score += 4000
      for (const avoid of coach.avoid) {
        if (this.boxesOverlap(rect, this.padBox(avoid, 6))) score += 2500
      }
      if (this.hitsLane(rect, coach.lane, cx, cy)) score += dist < 200 ? 110 : 800
      if (candidate.prefer && score < 4000) score -= 1800
      if (score < best.score) best = { x, y, side: candidate.side, score }
    }
    const bx = best.x + bubbleW / 2
    const by = best.y + bubbleH / 2
    const side = Math.abs(cx - bx) > Math.abs(cy - by) ? (cx > bx ? 'right' : 'left') : cy > by ? 'down' : 'up'
    best.side = side
    const arrow = this.coachEl.querySelector('#coach-arrow')
    if (arrow instanceof HTMLElement) {
      arrow.style.left = ''
      arrow.style.right = ''
      arrow.style.top = ''
      arrow.style.bottom = ''
      if (side === 'down' || side === 'up') {
        const rel = (cx - best.x) / bubbleW
        arrow.style.left = `${Math.min(78, Math.max(22, rel * 100))}%`
        arrow.style.right = 'auto'
      }
    }
    return best
  }

  private padBox(box: CoachBox, pad: number): CoachBox {
    return { l: box.l - pad, t: box.t - pad, r: box.r + pad, b: box.b + pad }
  }

  private boxesOverlap(a: CoachBox, b: CoachBox): boolean {
    return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t
  }

  private hitsLane(rect: CoachBox, lane: Array<{ x: number; y: number }>, cx: number, cy: number): boolean {
    if (lane.length < 2) return false
    const samples = [
      [(rect.l + rect.r) / 2, (rect.t + rect.b) / 2],
      [rect.l, rect.t],
      [rect.r, rect.t],
      [rect.l, rect.b],
      [rect.r, rect.b],
    ]
    const nearTarget = (x: number, y: number) => Math.hypot(x - cx, y - cy) < 120
    for (let i = 1; i < lane.length; i++) {
      const a = lane[i - 1]
      const b = lane[i]
      if (nearTarget(a.x, a.y) && nearTarget(b.x, b.y)) continue
      for (const [px, py] of samples) {
        if (this.segmentDistance(a.x, a.y, b.x, b.y, px, py) < 26) return true
      }
    }
    return false
  }

  private segmentDistance(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
    const abx = bx - ax
    const aby = by - ay
    const ab2 = abx * abx + aby * aby || 1
    let t = ((px - ax) * abx + (py - ay) * aby) / ab2
    t = Math.max(0, Math.min(1, t))
    return Math.hypot(px - (ax + abx * t), py - (ay + aby * t))
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
        label.textContent = `${chip.count}× ${chip.name} · ${chip.weak}`
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

  private syncCardFade(): void {
    const overflow = this.cardEl.scrollHeight > this.cardEl.clientHeight + 2
    this.cardEl.classList.toggle('fade', overflow)
  }

  private need(selector: string): HTMLElement {
    const node = this.root.querySelector(selector)
    if (!node) throw new Error(`Missing ${selector}`)
    return node as HTMLElement
  }
}
