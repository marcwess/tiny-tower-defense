import { asset } from './assets'

export interface ActionButton {
  id: string
  label: string
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
  hint: boolean
  startLabel: string
  startEnabled: boolean
  selection: SelectionView | null
  end: { kind: 'win' | 'lose'; title: string; detail: string } | null
}

export class Hud {
  onAction: (id: string) => void = () => {}
  onStart: () => void = () => {}
  onSpeed: () => void = () => {}
  onMute: () => void = () => {}
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
  private loadingEl: HTMLElement
  private loadingText: HTMLElement
  private signature = ''
  private gold = -1

  constructor(app: HTMLElement) {
    app.innerHTML = `
      <div id="hud">
        <header id="top">
          <div class="pill" id="gold"><img alt="" src="${asset('assets/ui/ui-pack/PNG/Yellow/Double/star.png')}" /><span>0</span></div>
          <div class="pill" id="wave">Wave 1</div>
          <div class="pill" id="pets">Pets 5</div>
          <button type="button" id="mute" class="round" aria-label="Mute">Sound</button>
        </header>
        <div id="dock">
          <p id="hint"></p>
          <section id="card" hidden>
            <h2 id="card-title"></h2>
            <p id="card-blurb"></p>
            <p id="card-stats"></p>
            <div id="tray"></div>
          </section>
          <div id="actions">
            <button type="button" id="speed" class="btn yellow">1×</button>
            <button type="button" id="start" class="btn green">Start wave</button>
          </div>
        </div>
      </div>
      <div id="end" hidden>
        <div class="card">
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
    this.waveEl = this.need('#wave')
    this.petsEl = this.need('#pets')
    this.muteEl = this.need('#mute') as HTMLButtonElement
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
    this.loadingEl = this.need('#loading')
    this.loadingText = this.need('#loading-text')

    this.speedEl.addEventListener('click', () => this.onSpeed())
    this.startEl.addEventListener('click', () => this.onStart())
    this.muteEl.addEventListener('click', () => this.onMute())
    this.need('#retry').addEventListener('click', () => this.onRetry())
    this.trayEl.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest('button')
      const id = button?.dataset.part
      if (id) this.onAction(id)
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
    this.waveEl.textContent = state.waveLabel
    this.petsEl.textContent = `Pets ${state.pets}/${state.petMax}`
    this.muteEl.textContent = state.muted ? 'Muted' : 'Sound'
    this.muteEl.setAttribute('aria-pressed', state.muted ? 'true' : 'false')
    this.speedEl.textContent = `${state.speed}×`
    this.speedEl.classList.toggle('pressed', state.speed > 1)
    this.startEl.textContent = state.startLabel
    this.startEl.disabled = !state.startEnabled
    this.hintEl.hidden = !state.hint
    if (state.hint) {
      this.hintEl.textContent = 'Tap the grass under the arrow, then stack a weapon. Height adds range. Walls change the rate. Roofs add a trick.'
    }

    if (!state.selection) {
      this.cardEl.hidden = true
      this.signature = ''
    } else {
      this.cardEl.hidden = false
      this.titleEl.textContent = state.selection.title
      this.blurbEl.textContent = state.selection.blurb
      this.statsEl.textContent = state.selection.stats
      const sig = state.selection.actions.map((action) => action.id).join('|')
      if (sig !== this.signature) {
        this.signature = sig
        this.trayEl.innerHTML = ''
        for (const action of state.selection.actions) {
          const button = document.createElement('button')
          button.type = 'button'
          button.dataset.part = action.id
          button.className = `piece ${action.tone}`
          button.innerHTML = `<span class="piece-name">${action.label}</span><span class="piece-cost">${action.cost}</span>`
          this.trayEl.appendChild(button)
        }
      }
      const buttons = this.trayEl.querySelectorAll('button')
      state.selection.actions.forEach((action, index) => {
        const button = buttons[index] as HTMLButtonElement | undefined
        if (!button) return
        button.setAttribute('aria-disabled', action.enabled ? 'false' : 'true')
        const cost = button.querySelector('.piece-cost')
        if (cost) cost.textContent = action.cost
        button.classList.toggle('off', !action.enabled)
      })
    }

    if (state.end) {
      this.endEl.hidden = false
      this.endEl.dataset.kind = state.end.kind
      this.endTitle.textContent = state.end.title
      this.endDetail.textContent = state.end.detail
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
