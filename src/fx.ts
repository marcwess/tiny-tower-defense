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
  life: number
  max: number
  vy: number
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
  private chunks: Chunk[] = []
  private rings: Ring[] = []
  private ringGeo: THREE.RingGeometry
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
    this.smoke.frustumCulled = false
    scene.add(this.smoke)

    this.ringGeo = new THREE.RingGeometry(0.82, 1, 28)
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
    const mesh = new THREE.Mesh(this.ringGeo, this.ringMat.clone())
    ;(mesh.material as THREE.MeshBasicMaterial).color.set(color)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x, 0.28, z)
    mesh.scale.setScalar(0.2)
    this.scene.add(mesh)
    this.rings.push({ mesh, life: 0.35, max: 0.35 })
  }

  popup(x: number, y: number, z: number, text: string, color: string, life = 0.9): void {
    if (this.popups.length > 16) {
      const old = this.popups.shift()
      if (old) {
        this.scene.remove(old.sprite)
        const oldMat = old.sprite.material as THREE.SpriteMaterial
        oldMat.map?.dispose()
        oldMat.dispose()
      }
    }
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 128
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, 512, 128)
    ctx.font = '700 64px "Kenney Bold", "Kenney Future", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 10
    ctx.strokeStyle = 'rgba(20, 24, 32, 0.85)'
    ctx.strokeText(text, 256, 64)
    ctx.fillStyle = color
    ctx.fillText(text, 256, 64)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
    const sprite = new THREE.Sprite(mat)
    sprite.position.set(x, y, z)
    const wide = Math.min(2.4, 0.7 + text.length * 0.14)
    sprite.scale.set(wide, 0.62, 1)
    this.scene.add(sprite)
    this.popups.push({ sprite, life, max: life, vy: 0.65 })
  }

  /** A few solid bits when a UFO pops. Kept small so phones stay smooth. */
  debris(x: number, y: number, z: number, color: number): void {
    const tint = new THREE.Color(color)
    for (let i = 0; i < 5; i++) {
      if (this.chunks.length >= 24) {
        const old = this.chunks.shift()
        if (old) {
          this.scene.remove(old.mesh)
          old.mesh.geometry.dispose()
          ;(old.mesh.material as THREE.Material).dispose()
        }
      }
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.08),
        new THREE.MeshLambertMaterial({ color: tint }),
      )
      mesh.position.set(x, y, z)
      this.scene.add(mesh)
      const life = 0.35 + Math.random() * 0.2
      this.chunks.push({
        mesh,
        life,
        max: life,
        vy: 1.2 + Math.random() * 1.6,
        spin: (Math.random() - 0.5) * 8,
      })
      mesh.userData.vx = (Math.random() - 0.5) * 2.2
      mesh.userData.vz = (Math.random() - 0.5) * 2.2
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
    for (let i = n; i < MAX; i++) {
      pos[i * 3 + 1] = -50
      col[i * 3] = 0
      col[i * 3 + 1] = 0
      col[i * 3 + 2] = 0
    }
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
        this.scene.remove(popup.sprite)
        mat.map?.dispose()
        mat.dispose()
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
        this.scene.remove(chunk.mesh)
        chunk.mesh.geometry.dispose()
        ;(chunk.mesh.material as THREE.Material).dispose()
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
        this.scene.remove(ring.mesh)
        ;(ring.mesh.material as THREE.Material).dispose()
        this.rings.splice(i, 1)
      }
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
    for (let i = n; i < max; i++) pos[i * 3 + 1] = -50
    const geo = points.geometry
    ;(geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
    ;(geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true
  }
}
