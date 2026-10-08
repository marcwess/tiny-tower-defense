import * as THREE from 'three'

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
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  tex: THREE.CanvasTexture
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
const POP_W = 1024
const POP_H = 256

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
  private popupFree: Popup[] = []
  private chunks: Chunk[] = []
  private chunkFree: Chunk[] = []
  private rings: Ring[] = []
  private ringFree: Ring[] = []
  private ringGeo: THREE.RingGeometry
  private chunkGeo: THREE.BoxGeometry
  private ringMat: THREE.MeshBasicMaterial

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
  }

  burst(x: number, y: number, z: number, color: number, count: number, speed: number): void {
    const c = new THREE.Color(color)
    for (let i = 0; i < count; i++) {
      if (this.parts.length >= MAX) this.parts.shift()
      const life = 0.28 + Math.random() * 0.35
      this.parts.push({
        life,
        max: life,
        x,
        y,
        z,
        vx: (Math.random() - 0.5) * speed,
        vy: Math.random() * speed * 0.8,
        vz: (Math.random() - 0.5) * speed,
        r: c.r,
        g: c.g,
        b: c.b,
      })
    }
  }

  puff(x: number, y: number, z: number): void {
    for (let i = 0; i < 7; i++) {
      if (this.smokeParts.length >= 80) this.smokeParts.shift()
      const life = 0.45 + Math.random() * 0.4
      const gray = 0.45 + Math.random() * 0.35
      this.smokeParts.push({
        life,
        max: life,
        x: x + (Math.random() - 0.5) * 0.15,
        y,
        z: z + (Math.random() - 0.5) * 0.15,
        vx: (Math.random() - 0.5) * 0.4,
        vy: 0.35 + Math.random() * 0.7,
        vz: (Math.random() - 0.5) * 0.4,
        r: gray,
        g: gray * 0.96,
        b: gray * 0.9,
      })
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
    const canvas = document.createElement('canvas')
    canvas.width = POP_W
    canvas.height = POP_H
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.magFilter = THREE.LinearFilter
    tex.minFilter = THREE.LinearFilter
    tex.generateMipmaps = false
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
    const sprite = new THREE.Sprite(mat)
    sprite.visible = false
    this.scene.add(sprite)
    return { sprite, canvas, ctx, tex, life: 0, max: 1, vy: 0.65, active: false }
  }

  popup(x: number, y: number, z: number, text: string, color: string, life = 0.9): void {
    const slot = this.takePopup()
    if (!slot) return
    const fontSize = 72
    const font = `700 ${fontSize}px "Kenney Bold", "Kenney Future", sans-serif`
    const ctx = slot.ctx
    ctx.font = font
    const measured = Math.ceil(ctx.measureText(text).width)
    // Kenney Bold's outlines sit outside the em box. Keep the canvas size fixed so the
    // GL texture is never reallocated (that realloc was the copySubTexture overflow).
    const stroke = 18
    const padX = stroke + 48
    const ascent = Math.ceil(fontSize * 1.65) + stroke
    const descent = Math.ceil(fontSize * 0.6) + stroke
    const width = Math.min(POP_W, Math.max(64, measured + padX * 2))
    const height = Math.min(POP_H, ascent + descent)
    ctx.clearRect(0, 0, POP_W, POP_H)
    ctx.font = font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.lineJoin = 'round'
    ctx.miterLimit = 2
    ctx.lineWidth = stroke
    ctx.strokeStyle = 'rgba(20, 24, 32, 0.85)'
    ctx.strokeText(text, width / 2, ascent)
    ctx.fillStyle = color
    ctx.fillText(text, width / 2, ascent)
    slot.tex.offset.set(0, 1 - height / POP_H)
    slot.tex.repeat.set(width / POP_W, height / POP_H)
    slot.tex.needsUpdate = true
    slot.sprite.position.set(x, y, z)
    const worldH = 0.52
    slot.sprite.scale.set(worldH * (width / height), worldH, 1)
    slot.sprite.visible = true
    ;(slot.sprite.material as THREE.SpriteMaterial).opacity = 1
    slot.life = life
    slot.max = life
    slot.vy = 0.65
    slot.active = true
    this.popups.push(slot)
  }

  /** Drop floating combat text, debris, and rings. Used when a round ends. */
  clear(): void {
    for (const popup of this.popups) this.parkPopup(popup)
    this.popups = []
    for (const chunk of this.chunks) this.parkChunk(chunk)
    this.chunks = []
    for (const ring of this.rings) this.parkRing(ring)
    this.rings = []
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
        this.parts.splice(i, 1)
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
        parts.splice(i, 1)
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
