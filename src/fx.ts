import * as THREE from 'three'
import { perf } from './perf'

interface Particle {
  life: number
  max: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  r: number
  g: number
  b: number
}

interface Popup {
  sprite: THREE.Sprite
  life: number
  max: number
  vy: number
  active: boolean
}

interface Chunk {
  mesh: THREE.Mesh
  life: number
  max: number
  vy: number
  spin: number
}

interface Ring {
  mesh: THREE.Mesh
  life: number
  max: number
}

const MAX = 420
const POP_W = 256
const POP_H = 64

export class Fx {
  private parts: Particle[] = []
  private positions = new Float32Array(MAX * 3)
  private colors = new Float32Array(MAX * 3)
  private points: THREE.Points
  private smoke: THREE.Points
  private smokeParts: Particle[] = []
  private smokePos = new Float32Array(80 * 3)
  private smokeCol = new Float32Array(80 * 3)
  private popups: Popup[] = []
  private readonly popA = new THREE.Vector3()
  private readonly popB = new THREE.Vector3()
  private popupFree: Popup[] = []
  private chunks: Chunk[] = []
  private chunkFree: Chunk[] = []
  private rings: Ring[] = []
  private ringFree: Ring[] = []
  private ringGeo: THREE.RingGeometry
  private chunkGeo: THREE.BoxGeometry
  private ringMat: THREE.MeshBasicMaterial
  private readonly scratchColor = new THREE.Color()
  private readonly glyphs = new Map<string, THREE.CanvasTexture>()
  private partFree: Particle[] = []

  constructor(private scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3))
    const mat = new THREE.PointsMaterial({
      size: 0.2,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
    this.points = new THREE.Points(geo, mat)
    this.parkPoints(this.positions, this.colors, MAX)
    this.points.frustumCulled = false
    scene.add(this.points)

    const smokeGeo = new THREE.BufferGeometry()
    smokeGeo.setAttribute('position', new THREE.BufferAttribute(this.smokePos, 3))
    smokeGeo.setAttribute('color', new THREE.BufferAttribute(this.smokeCol, 3))
    this.smoke = new THREE.Points(
      smokeGeo,
      new THREE.PointsMaterial({
        size: 0.55,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    )
    this.parkPoints(this.smokePos, this.smokeCol, 80)
    this.smoke.frustumCulled = false
    scene.add(this.smoke)

    this.ringGeo = new THREE.RingGeometry(0.82, 1, 28)
    this.chunkGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08)
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xffe08a,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
    for (let i = 0; i < MAX; i++) {
      this.partFree.push({
        life: 0,
        max: 1,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        r: 1,
        g: 1,
        b: 1,
      })
    }
  }

  /** Bake the strings combat actually prints so the first shot does not upload a texture. */
  prepare(): void {
    const gold = '#ffe08a'
    const white = '#fff6ea'
    const green = '#b6ff8a'
    const saved = '#b8ffb0'
    const lost = '#ffb0a8'
    const sell = '#fff1b8'
    for (let n = 1; n <= 160; n++) this.glyph(String(n), white)
    for (const reward of [2, 4, 7, 9, 36]) this.glyph(`+${reward}`, gold)
    for (const cost of [56, 68, 74, 80]) {
      let spent = cost
      this.glyph(`+${Math.floor(spent * 0.5)}`, sell)
      for (const add of [40, 70, 100]) {
        spent += add
        this.glyph(`+${Math.floor(spent * 0.5)}`, sell)
      }
    }
    this.glyph('Effective!', green)
    this.glyph('Saved!', saved)
    this.glyph('Lost!', lost)
  }

  /**
   * Upload every baked glyph and put one chunk, ring, and popup on screen
   * so the warmup frame owns their geometry. Call the returned function after that frame.
   */
  prime(renderer: THREE.WebGLRenderer): () => void {
    this.prepare()
    for (const tex of this.glyphs.values()) {
      renderer.initTexture(tex)
      tex.needsUpdate = false
    }
    const chunk = this.takeChunk(0xfff2c4)
    chunk.mesh.position.set(2, 0.5, 6)
    chunk.mesh.frustumCulled = false
    const ring = this.ringFree.pop() ?? this.makeRing()
    ring.mesh.visible = true
    ring.mesh.position.set(2.4, 0.28, 6)
    ring.mesh.frustumCulled = false
    const popup = this.takePopup()
    if (popup) {
      const mat = popup.sprite.material as THREE.SpriteMaterial
      mat.map = this.glyph('12', '#fff6ea')
      popup.sprite.visible = true
      popup.sprite.position.set(2, 1.1, 6)
      popup.sprite.frustumCulled = false
    }
    return () => {
      this.parkChunk(chunk)
      this.parkRing(ring)
      if (popup) this.parkPopup(popup)
    }
  }

  private takePart(): Particle | null {
    const free = this.partFree.pop()
    if (free) return free
    if (this.parts.length === 0) return null
    const oldest = this.parts.pop()
    return oldest ?? null
  }

  burst(x: number, y: number, z: number, color: number, count: number, speed: number): void {
    const c = this.scratchColor.set(color)
    for (let i = 0; i < count; i++) {
      const part = this.takePart()
      if (!part) return
      const life = 0.28 + Math.random() * 0.35
      part.life = life
      part.max = life
      part.x = x
      part.y = y
      part.z = z
      part.vx = (Math.random() - 0.5) * speed
      part.vy = Math.random() * speed * 0.8
      part.vz = (Math.random() - 0.5) * speed
      part.r = c.r
      part.g = c.g
      part.b = c.b
      this.parts.push(part)
    }
  }

  puff(x: number, y: number, z: number): void {
    for (let i = 0; i < 7; i++) {
      if (this.smokeParts.length >= 80) {
        const oldest = this.smokeParts.pop()
        if (oldest) this.partFree.push(oldest)
      }
      const part = this.takePart()
      if (!part) return
      const life = 0.45 + Math.random() * 0.4
      const gray = 0.45 + Math.random() * 0.35
      part.life = life
      part.max = life
      part.x = x + (Math.random() - 0.5) * 0.15
      part.y = y
      part.z = z + (Math.random() - 0.5) * 0.15
      part.vx = (Math.random() - 0.5) * 0.4
      part.vy = 0.35 + Math.random() * 0.7
      part.vz = (Math.random() - 0.5) * 0.4
      part.r = gray
      part.g = gray * 0.96
      part.b = gray * 0.9
      this.smokeParts.push(part)
    }
  }

  ring(x: number, z: number, color: number): void {
    const ring = this.ringFree.pop() ?? this.makeRing()
    const mat = ring.mesh.material as THREE.MeshBasicMaterial
    mat.color.set(color)
    mat.opacity = 0.8
    ring.mesh.position.set(x, 0.28, z)
    ring.mesh.scale.setScalar(0.2)
    ring.mesh.visible = true
    ring.life = 0.35
    ring.max = 0.35
    this.rings.push(ring)
  }

  private makeRing(): Ring {
    const mesh = new THREE.Mesh(this.ringGeo, this.ringMat.clone())
    mesh.rotation.x = -Math.PI / 2
    mesh.visible = false
    this.scene.add(mesh)
    return { mesh, life: 0, max: 0.35 }
  }

  private takePopup(): Popup | null {
    const idle = this.popupFree.pop()
    if (idle) return idle
    if (this.popups.length + this.popupFree.length >= 18) {
      const old = this.popups.shift()
      if (!old) return null
      old.active = false
      return old
    }
    const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false })
    const sprite = new THREE.Sprite(mat)
    sprite.visible = false
    this.scene.add(sprite)
    return { sprite, life: 0, max: 1, vy: 0.65, active: false }
  }

  private glyph(text: string, color: string): THREE.CanvasTexture {
    const key = `${color}|${text}`
    const cached = this.glyphs.get(key)
    if (cached) return cached
    const canvas = document.createElement('canvas')
    canvas.width = POP_W
    canvas.height = POP_H
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      const empty = new THREE.CanvasTexture(canvas)
      this.glyphs.set(key, empty)
      return empty
    }
    const fontSize = 28
    ctx.clearRect(0, 0, POP_W, POP_H)
    ctx.font = `400 ${fontSize}px "Kenney Future", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 6
    ctx.strokeStyle = 'rgba(20, 24, 32, 0.88)'
    ctx.strokeText(text, POP_W / 2, POP_H / 2 + 1)
    ctx.fillStyle = color
    ctx.fillText(text, POP_W / 2, POP_H / 2 + 1)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.magFilter = THREE.LinearFilter
    tex.minFilter = THREE.LinearFilter
    tex.generateMipmaps = false
    tex.needsUpdate = true
    this.glyphs.set(key, tex)
    return tex
  }

  popup(x: number, y: number, z: number, text: string, color: string, life = 0.9): void {
    const slot = this.takePopup()
    if (!slot) return
    const tex = this.glyph(text, color)
    const mat = slot.sprite.material as THREE.SpriteMaterial
    if (mat.map !== tex) mat.map = tex
    mat.opacity = 1
    slot.sprite.position.set(x, y, z)
    const worldH = text.length > 6 ? 0.46 : 0.36
    slot.sprite.scale.set(worldH * (POP_W / POP_H) * 0.42, worldH, 1)
    slot.sprite.visible = true
    slot.life = life
    slot.max = life
    slot.vy = 0.65
    slot.active = true
    this.popups.push(slot)
    perf.notePopup()
  }

  /**
   * Slide any combat sprite whose top sits in the HUD back down, and stop it rising.
   * minTop is a canvas pixel measured from the top of the view.
   */
  keepUnderHud(camera: THREE.Camera, viewHeight: number, minTop: number): void {
    if (viewHeight < 2) return
    camera.updateMatrixWorld()
    for (const popup of this.popups) {
      const pos = popup.sprite.position
      this.popA.copy(pos).project(camera)
      if (this.popA.z > 1) continue
      const half = popup.sprite.scale.y * 0.5
      this.popB.setFromMatrixColumn(camera.matrixWorld, 1).setLength(half).add(pos)
      this.popB.project(camera)
      const top = (-this.popB.y * 0.5 + 0.5) * viewHeight
      if (top >= minTop) continue
      const center = (-this.popA.y * 0.5 + 0.5) * viewHeight
      const next = center + (minTop - top)
      this.popA.y = -((next / viewHeight) * 2 - 1)
      popup.sprite.position.copy(this.popA.unproject(camera))
      popup.vy = 0
    }
  }

  /** Drop floating combat text, debris, and rings. Used when a round ends. */
  clear(): void {
    for (const popup of this.popups) this.parkPopup(popup)
    this.popups = []
    for (const chunk of this.chunks) this.parkChunk(chunk)
    this.chunks = []
    for (const ring of this.rings) this.parkRing(ring)
    this.rings = []
    for (const part of this.parts) this.partFree.push(part)
    for (const part of this.smokeParts) this.partFree.push(part)
    this.parts = []
    this.smokeParts = []
    this.parkPoints(this.positions, this.colors, MAX)
    this.parkPoints(this.smokePos, this.smokeCol, 80)
    const geo = this.points.geometry
    ;(geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    ;(geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true
    const smokeGeo = this.smoke.geometry
    ;(smokeGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    ;(smokeGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true
  }

  private parkPopup(popup: Popup): void {
    popup.active = false
    popup.sprite.visible = false
    this.popupFree.push(popup)
  }

  private parkChunk(chunk: Chunk): void {
    chunk.mesh.visible = false
    chunk.life = 0
    this.chunkFree.push(chunk)
  }

  private parkRing(ring: Ring): void {
    ring.mesh.visible = false
    ring.life = 0
    this.ringFree.push(ring)
  }

  private takeChunk(color: number): Chunk {
    const idle = this.chunkFree.pop()
    if (idle) {
      ;(idle.mesh.material as THREE.MeshLambertMaterial).color.set(color)
      idle.mesh.visible = true
      return idle
    }
    if (this.chunks.length >= 24) {
      const old = this.chunks.shift()
      if (old) {
        ;(old.mesh.material as THREE.MeshLambertMaterial).color.set(color)
        old.mesh.visible = true
        return old
      }
    }
    const mesh = new THREE.Mesh(this.chunkGeo, new THREE.MeshLambertMaterial({ color }))
    mesh.castShadow = false
    mesh.receiveShadow = false
    this.scene.add(mesh)
    return { mesh, life: 0, max: 1, vy: 0, spin: 0 }
  }

  /** A few solid bits when a UFO pops. Kept small so phones stay smooth. */
  debris(x: number, y: number, z: number, color: number): void {
    for (let i = 0; i < 5; i++) {
      const chunk = this.takeChunk(color)
      chunk.mesh.position.set(x, y, z)
      chunk.mesh.rotation.set(0, 0, 0)
      const life = 0.35 + Math.random() * 0.2
      chunk.life = life
      chunk.max = life
      chunk.vy = 1.2 + Math.random() * 1.6
      chunk.spin = (Math.random() - 0.5) * 8
      chunk.mesh.userData.vx = (Math.random() - 0.5) * 2.2
      chunk.mesh.userData.vz = (Math.random() - 0.5) * 2.2
      this.chunks.push(chunk)
    }
  }

  update(dt: number): void {
    const pos = this.positions
    const col = this.colors
    let n = 0
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]
      p.life -= dt
      if (p.life <= 0) {
        const last = this.parts.pop()
        if (last && i < this.parts.length) {
          this.parts[i] = last
          i += 1
        }
        this.partFree.push(p)
        continue
      }
      p.vy -= dt * 2.2
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      const fade = p.life / p.max
      const o = n * 3
      pos[o] = p.x
      pos[o + 1] = p.y
      pos[o + 2] = p.z
      col[o] = p.r * fade
      col[o + 1] = p.g * fade
      col[o + 2] = p.b * fade
      n += 1
    }
    this.parkPoints(pos, col, MAX, n)
    const geo = this.points.geometry
    ;(geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    ;(geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true
    this.stepCloud(this.smokeParts, this.smokePos, this.smokeCol, 80, this.smoke, dt, 0.15)

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const popup = this.popups[i]
      popup.life -= dt
      popup.sprite.position.y += popup.vy * dt
      const mat = popup.sprite.material as THREE.SpriteMaterial
      mat.opacity = Math.max(0, popup.life / popup.max)
      if (popup.life <= 0) {
        this.parkPopup(popup)
        this.popups.splice(i, 1)
      }
    }

    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const chunk = this.chunks[i]
      chunk.life -= dt
      chunk.vy -= dt * 6
      chunk.mesh.position.x += (chunk.mesh.userData.vx as number) * dt
      chunk.mesh.position.y += chunk.vy * dt
      chunk.mesh.position.z += (chunk.mesh.userData.vz as number) * dt
      chunk.mesh.rotation.x += chunk.spin * dt
      chunk.mesh.rotation.z += chunk.spin * 0.6 * dt
      if (chunk.life <= 0 || chunk.mesh.position.y < 0.02) {
        this.parkChunk(chunk)
        this.chunks.splice(i, 1)
      }
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i]
      ring.life -= dt
      const k = 1 - ring.life / ring.max
      ring.mesh.scale.setScalar(0.25 + k * 1.5)
      ;(ring.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.75 * (1 - k))
      if (ring.life <= 0) {
        this.parkRing(ring)
        this.rings.splice(i, 1)
      }
    }
  }

  /** Unused points stay off the ground plane so they cannot speckle the foreground. */
  private parkPoints(pos: Float32Array, col: Float32Array, max: number, from = 0): void {
    for (let i = from; i < max; i++) {
      pos[i * 3] = 0
      pos[i * 3 + 1] = -800
      pos[i * 3 + 2] = 0
      col[i * 3] = 0
      col[i * 3 + 1] = 0
      col[i * 3 + 2] = 0
    }
  }

  private stepCloud(
    parts: Particle[],
    pos: Float32Array,
    col: Float32Array,
    max: number,
    points: THREE.Points,
    dt: number,
    lift: number,
  ): void {
    let n = 0
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      p.life -= dt
      if (p.life <= 0) {
        const last = parts.pop()
        if (last && i < parts.length) {
          parts[i] = last
          i += 1
        }
        this.partFree.push(p)
        continue
      }
      p.vy += lift * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      const fade = p.life / p.max
      const o = n * 3
      pos[o] = p.x
      pos[o + 1] = p.y
      pos[o + 2] = p.z
      col[o] = p.r * fade
      col[o + 1] = p.g * fade
      col[o + 2] = p.b * fade
      n += 1
      if (n >= max) break
    }
    this.parkPoints(pos, col, max, n)
    const geo = points.geometry
    ;(geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    ;(geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true
  }
}
