import { asset, pieceThumbnail } from './assets'

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
  preview: string | null
  bannerTitle: string | null
  bannerBody: string | null
  selection: SelectionView | null
  end: { kind: 'win' | 'lose'; title: string; detail: string; stars: number } | null
}

export class Hud {
  onAction: (id: string) => void = () => {}
  onStart: () => void = () => {}
  onSpeed: () => void = () => {}
  onMute: () => void = () => {}
  onDamage: () => void = () => {}
  onRetry: () => void = () => {}

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
  private bannerBody: HTMLElement
  private damageEl: HTMLButtonElement
  private loadingEl: HTMLElement
  private loadingText: HTMLElement
  private signature = ''
  private gold = -1
  private actions: ActionButton[] = []
  private focusedId: string | null = null
  private holdTimer = 0
  private suppressClick = false
  private muteIcon: HTMLImageElement

  constructor(app: HTMLElement) {
    app.innerHTML = `
      <div id="hud">
        <header id="top">
          <div class="pill gold" id="gold"><img alt="" src="${asset('assets/icons/coin.png')}" /><span>0</span></div>
          <div class="pill wave" id="wave"><img alt="" src="${asset('assets/icons/flag.png')}" /><span>1/9</span></div>
          <div class="pill pets" id="pets"><img alt="" src="${asset('assets/icons/heart.png')}" /><span>5</span></div>
          <button type="button" id="mute" class="round" aria-label="Sound"><img alt="" src="${asset('assets/icons/audio-on.png')}" /></button>
        </header>
        <div id="banner" hidden>
          <p id="banner-title"></p>
          <p id="banner-body"></p>
        </div>
        <div id="dock">
          <p id="preview" hidden></p>
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
            <button type="button" id="start" class="btn green">Call wave</button>
          </div>
        </div>
      </div>
      <div id="end" hidden>
        <div class="card end-card">
          <img id="end-icon" alt="" src="${asset('assets/icons/heart.png')}" />
          <div id="stars" hidden></div>
          <h1 id="end-title"></h1>
          <p id="end-detail"></p>
          <button type="button" id="retry" class="btn green">Retry</button>
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
    this.bannerBody = this.need('#banner-body')
    this.damageEl = this.need('#dmg') as HTMLButtonElement
    this.loadingEl = this.need('#loading')
    this.loadingText = this.need('#loading-text')

    this.speedEl.addEventListener('click', () => this.onSpeed())
    this.startEl.addEventListener('click', () => this.onStart())
    this.muteEl.addEventListener('click', () => this.onMute())
    this.damageEl.addEventListener('click', () => this.onDamage())
    this.need('#retry').addEventListener('click', () => this.onRetry())
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
    const size = 28
    const dx = dest.left + (dest.width - size) / 2
    const dy = dest.top + (dest.height - size) / 2
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      coin.remove()
      this.flashGold()
    }
    const anim = coin.animate(
      [
        { transform: `translate(${x - size / 2}px, ${y - size / 2}px) scale(1)`, opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.8)`, opacity: 1, offset: 0.78 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.35)`, opacity: 0 },
      ],
      { duration: 620, easing: 'cubic-bezier(.2,.75,.2,1)', fill: 'forwards' },
    )
    void anim.finished.then(finish, finish)
    window.setTimeout(finish, 780)
  }

  flashGold(): void {
    const pill = this.goldEl.parentElement
    pill?.classList.remove('shake')
    void pill?.offsetWidth
    pill?.classList.add('shake')
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
    this.hintEl.hidden = !state.hint
    if (state.hint) {
      this.hintEl.textContent = 'Tap the grass under the arrow, then stack a weapon. Taller towers reach farther.'
    }
    this.previewEl.hidden = !state.preview
    this.previewEl.textContent = state.preview ?? ''
    this.bannerEl.hidden = !state.bannerTitle
    this.bannerTitle.textContent = state.bannerTitle ?? ''
    this.bannerBody.textContent = state.bannerBody ?? ''

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
          const thumb = pieceThumbnail(action.id)
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
    }

    if (state.end) {
      this.endEl.hidden = false
      this.endEl.dataset.kind = state.end.kind
      this.endTitle.textContent = state.end.title
      this.endDetail.textContent = state.end.detail
      const stars = state.end.kind === 'win' ? state.end.stars : 0
      this.starsEl.hidden = stars <= 0
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
      this.endIcon.src = asset(
        state.end.kind === 'win' ? 'assets/icons/heart.png' : 'assets/ui/ui-pack/PNG/Red/Double/icon_cross.png',
      )
    } else {
      this.endEl.hidden = true
    }
  }

  private need(selector: string): HTMLElement {
    const node = this.root.querySelector(selector)
    if (!node) throw new Error(`Missing ${selector}`)
    return node as HTMLElement
  }
}
