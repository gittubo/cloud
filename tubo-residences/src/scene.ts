// The 3D world: city, coast, the two towers with a selectable volume for
// every residence, the sky and the time-of-day lighting, and the camera.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Sky } from 'three/addons/objects/Sky.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ellipseR, FLOOR_H, floorBase, slabR, SLOT_SPAN, slots, statusColor, towers, units, type Tower, type Unit } from './data'

export type Mode = 'location' | 'apartments' | 'window'
type Shot = { pos: THREE.Vector3; target: THREE.Vector3 }

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)

/** Unit vector pointing out of the facade at plan angle `a` (π/2 = the sea, at -z). */
export const outward = (a: number) => v3(Math.cos(a), 0, -Math.sin(a))

// ---------- Geometry helpers ----------

/** A closed plan outline from a radius function, extruded upwards by `h`. */
function extrudeOutline(r: (a: number) => number, h: number, a0 = 0, a1 = Math.PI * 2, steps = 120): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  const full = a1 - a0 >= Math.PI * 2 - 1e-6
  const n = Math.max(8, Math.round((steps * (a1 - a0)) / (Math.PI * 2)))
  if (!full) shape.moveTo(0, 0)
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    const x = Math.cos(a) * r(a)
    const y = Math.sin(a) * r(a)
    if (full && i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 })
  g.rotateX(-Math.PI / 2)
  return g
}

/** A vertical ribbon following a radius function: glass balustrades. */
function ribbon(r: (a: number) => number, y: number, h: number, steps = 120): THREE.BufferGeometry {
  const pos: number[] = []
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    const b = ((i + 1) / steps) * Math.PI * 2
    const p = [Math.cos(a) * r(a), -Math.sin(a) * r(a)]
    const q = [Math.cos(b) * r(b), -Math.sin(b) * r(b)]
    pos.push(p[0], y, p[1], q[0], y, q[1], q[0], y + h, q[1], p[0], y, p[1], q[0], y + h, q[1], p[0], y + h, p[1])
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

// ---------- Procedural textures ----------

function canvasTexture(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void, srgb = true): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  draw(cv.getContext('2d')!, size)
  const t = new THREE.CanvasTexture(cv)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}

/** One city block (34 m): pavement inside, half a road on every edge. */
const BLOCK = 34
const groundTex = () =>
  canvasTexture(256, (c, s) => {
    const road = (3.8 / BLOCK) * s
    c.fillStyle = '#6f6e6c'
    c.fillRect(0, 0, s, s)
    c.fillStyle = '#cfc6b4'
    c.fillRect(road, road, s - 2 * road, s - 2 * road)
    c.fillStyle = '#c3b9a5'
    c.fillRect(road + 6, road + 6, s - 2 * road - 12, s - 2 * road - 12)
    c.strokeStyle = 'rgba(255,255,255,0.5)'
    c.setLineDash([10, 12])
    c.lineWidth = 2
    c.strokeRect(1, 1, s - 2, s - 2)
  })

/** Facade of a city building: plaster with rows of windows. Roofs map to the plain corner. */
const facadeTex = (lit: boolean) =>
  canvasTexture(256, (c, s) => {
    c.fillStyle = lit ? '#000' : '#f1ece2'
    c.fillRect(0, 0, s, s)
    const cols = 6
    const rows = 8
    for (let r = 0; r < rows; r++)
      for (let k = 0; k < cols; k++) {
        const x = 16 + k * ((s - 24) / cols)
        const y = 16 + r * ((s - 24) / rows)
        if (lit) {
          if (Math.random() > 0.42) continue
          c.fillStyle = Math.random() > 0.3 ? '#ffd9a0' : '#fff2d8'
        } else c.fillStyle = r % 2 ? '#7f8c99' : '#6e7c8a'
        c.fillRect(x, y, (s - 24) / cols - 12, (s - 24) / rows - 12)
      }
    c.fillStyle = lit ? '#000' : '#e6e0d4'
    c.fillRect(0, 0, 12, 12)
  })

/** Ripple normals for the sea, from a sum of sines so the tile wraps. */
const waterNormals = () =>
  canvasTexture(
    256,
    (c, s) => {
      const img = c.createImageData(s, s)
      const waves = Array.from({ length: 7 }, (_, i) => ({ kx: Math.round(Math.random() * 12 - 6) || 1, ky: 1 + Math.round(Math.random() * 6), ph: Math.random() * 6.28, amp: 1 / (1 + i) }))
      for (let y = 0; y < s; y++)
        for (let x = 0; x < s; x++) {
          let dx = 0
          let dy = 0
          for (const w of waves) {
            const arg = ((w.kx * x + w.ky * y) / s) * Math.PI * 2 + w.ph
            dx += w.amp * w.kx * Math.cos(arg) * 0.09
            dy += w.amp * w.ky * Math.cos(arg) * 0.09
          }
          const n = new THREE.Vector3(-dx, -dy, 1).normalize()
          const i = (y * s + x) * 4
          img.data[i] = (n.x * 0.5 + 0.5) * 255
          img.data[i + 1] = (n.y * 0.5 + 0.5) * 255
          img.data[i + 2] = (n.z * 0.5 + 0.5) * 255
          img.data[i + 3] = 255
        }
      c.putImageData(img, 0, 0)
    },
    false,
  )

/** Landscaped site plan around the towers: lawns, paths, planting. */
const siteTex = () =>
  canvasTexture(1024, (c, s) => {
    c.fillStyle = '#e9e1d0'
    c.fillRect(0, 0, s, s)
    c.fillStyle = '#86a85c'
    for (const [x, y, rx, ry, rot] of [
      [0.22, 0.25, 0.2, 0.13, 0.3],
      [0.78, 0.2, 0.17, 0.12, -0.2],
      [0.2, 0.78, 0.17, 0.15, 0.1],
      [0.8, 0.8, 0.16, 0.14, 0.5],
      [0.5, 0.5, 0.08, 0.3, 1.3],
    ]) {
      c.beginPath()
      c.ellipse(x * s, y * s, rx * s, ry * s, rot, 0, Math.PI * 2)
      c.fill()
    }
    c.strokeStyle = '#f6f1e6'
    c.lineWidth = 14
    c.beginPath()
    c.moveTo(0, s * 0.55)
    c.bezierCurveTo(s * 0.3, s * 0.35, s * 0.6, s * 0.75, s, s * 0.45)
    c.stroke()
    c.strokeStyle = '#6f9a4e'
    c.lineWidth = 6
    c.strokeRect(10, 10, s - 20, s - 20)
  })

// ---------- Time of day ----------

// Keyframes for the slider: 0 sunrise, 1 day, 2 overcast, 3 night.
const KEYS = {
  elev: [7, 50, 36, -8],
  azim: [95, 160, 205, 250],
  turbidity: [5, 2.2, 14, 1],
  rayleigh: [2.2, 1.4, 0.6, 0.2],
  mie: [0.012, 0.004, 0.02, 0.002],
  clouds: [0.3, 0.18, 0.9, 0.15],
  cloudDensity: [0.35, 0.35, 0.8, 0.1],
  sun: [2.4, 3.0, 0.9, 0],
  sunColor: ['#ffb27a', '#fff3e2', '#dfe4ea', '#8ea6d8'],
  hemi: [0.5, 0.7, 1.0, 0.32],
  hemiSky: ['#ffcfaa', '#c4dcff', '#c9cfd6', '#2b3e6b'],
  hemiGround: ['#6b5a48', '#8a8070', '#77777a', '#0d111c'],
  fog: ['#e9b892', '#c9d9ea', '#b9c0c8', '#0a1226'],
  fogDensity: [0.0011, 0.0007, 0.0021, 0.0012],
  exposure: [0.5, 0.42, 0.46, 0.62],
  glow: [0.45, 0, 0.2, 1.25],
  night: [0, 0, 0, 1],
  moon: [0, 0, 0, 0.7],
}
type NumKey = { [K in keyof typeof KEYS]: (typeof KEYS)[K] extends number[] ? K : never }[keyof typeof KEYS]
type ColKey = Exclude<keyof typeof KEYS, NumKey>

function sample(t: number) {
  const i = Math.min(2, Math.max(0, Math.floor(t)))
  const f = Math.min(1, Math.max(0, t - i))
  const num = (k: NumKey) => {
    const a = KEYS[k]
    return a[i] + (a[i + 1] - a[i]) * f
  }
  const col = (k: ColKey) => {
    const a = KEYS[k]
    return new THREE.Color(a[i]).lerp(new THREE.Color(a[i + 1]), f)
  }
  return { num, col }
}

type OverlayMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>

// ---------- The world ----------

export class World {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.3, 9000)
  readonly controls: OrbitControls
  mode: Mode = 'location'
  time = 1

  onHover: (u: Unit | null, tower: Tower | null, x: number, y: number) => void = () => {}
  onPickUnit: (u: Unit) => void = () => {}
  onPickTower: (t: Tower) => void = () => {}
  onFrame: () => void = () => {}

  private sky = new Sky()
  private envSky = new Sky()
  private envScene = new THREE.Scene()
  private pmrem: THREE.PMREMGenerator
  private envRT: THREE.WebGLRenderTarget | null = null
  private envDirty = true
  private envAt = -1
  private sunLight = new THREE.DirectionalLight(0xffffff, 3)
  private moonLight = new THREE.DirectionalLight(0x9fb6ff, 0)
  private hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1)
  private nightDome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>
  private stars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>
  private water!: THREE.MeshStandardMaterial
  private cityMat!: THREE.MeshStandardMaterial
  private glassMats: THREE.MeshStandardMaterial[] = []
  private overlays = new Map<string, OverlayMesh>()
  private towerHits: THREE.Object3D[] = []
  private pickables: THREE.Object3D[] = []
  private hovered: Unit | null = null
  private selected: Unit | null = null
  private selectEdges: THREE.LineSegments | null = null
  private hiddenTower: Tower | null = null
  private ray = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private down: { x: number; y: number } | null = null
  private tween: { p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; start: number; dur: number; arc: number; done: () => void } | null = null
  private clock = new THREE.Clock()

  constructor(private host: HTMLElement) {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true })
    // Phones get a lighter render: fill-rate is their bottleneck.
    r.setPixelRatio(Math.min(window.innerWidth < 760 ? 1.5 : 2, window.devicePixelRatio))
    r.toneMapping = THREE.ACESFilmicToneMapping
    r.outputColorSpace = THREE.SRGBColorSpace
    r.shadowMap.enabled = true
    r.shadowMap.type = THREE.PCFSoftShadowMap
    host.appendChild(r.domElement)
    this.renderer = r
    this.pmrem = new THREE.PMREMGenerator(r)

    this.controls = new OrbitControls(this.camera, r.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.07

    this.buildSky()
    this.nightDome = this.buildNightDome()
    this.stars = this.buildStars()
    this.buildLights()
    this.buildLand()
    this.buildCity()
    this.buildSite()
    towers.forEach((t) => this.buildTower(t))
    this.setFilter(() => true)
    this.setMode('location')
    this.setTime(1)

    this.bindPointer()
    new ResizeObserver(() => this.resize()).observe(host)
    this.resize()
    r.setAnimationLoop(() => this.frame())
  }

  // ----- Building the scene -----

  private buildSky(): void {
    for (const s of [this.sky, this.envSky]) s.scale.setScalar(8000)
    this.envSky.material = this.sky.material
    this.scene.add(this.sky)
    this.envScene.add(this.envSky)
  }

  private buildNightDome() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uNight: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uNight; varying vec3 vP;
        void main(){ float h = clamp(vP.y, 0.0, 1.0);
          vec3 c = mix(vec3(0.09,0.15,0.30), vec3(0.01,0.02,0.07), pow(h, 0.55));
          gl_FragColor = vec4(c, uNight); }`,
    })
    const dome = new THREE.Mesh(new THREE.SphereGeometry(7000, 32, 16), mat)
    dome.renderOrder = -1
    this.scene.add(dome)
    this.envScene.add(new THREE.Mesh(dome.geometry, mat))
    return dome
  }

  private buildStars() {
    const pos: number[] = []
    for (let i = 0; i < 1600; i++) {
      const u = Math.random() * Math.PI * 2
      const h = 0.08 + Math.random() * 0.92
      const rr = Math.sqrt(1 - h * h)
      pos.push(Math.cos(u) * rr * 6500, h * 6500, Math.sin(u) * rr * 6500)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }))
    this.scene.add(pts)
    return pts
  }

  private buildLights(): void {
    const s = this.sunLight
    s.castShadow = true
    s.shadow.mapSize.set(2048, 2048)
    s.shadow.camera.left = s.shadow.camera.bottom = -140
    s.shadow.camera.right = s.shadow.camera.top = 140
    s.shadow.camera.near = 10
    s.shadow.camera.far = 900
    s.shadow.bias = -0.0004
    s.shadow.normalBias = 0.6
    this.scene.add(s, s.target, this.moonLight, this.hemi)
    this.moonLight.position.set(-200, 300, 250)
  }

  private buildLand(): void {
    const tex = groundTex()
    tex.repeat.set(2400 / BLOCK, 2000 / BLOCK)
    tex.offset.set(0.5, 0.5)
    const land = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2000), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }))
    land.rotation.x = -Math.PI / 2
    land.position.set(0, 0, 920)
    land.receiveShadow = true

    const sand = new THREE.Mesh(new THREE.PlaneGeometry(2400, 70), new THREE.MeshStandardMaterial({ color: 0xe4d3ad, roughness: 1 }))
    sand.rotation.x = -Math.PI / 2
    sand.position.set(0, 0.02, -114)
    sand.receiveShadow = true

    const normals = waterNormals()
    normals.repeat.set(220, 220)
    this.water = new THREE.MeshStandardMaterial({ color: 0x0d4f73, roughness: 0.22, metalness: 0.1, normalMap: normals, normalScale: new THREE.Vector2(0.16, 0.16) })
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), this.water)
    sea.rotation.x = -Math.PI / 2
    sea.position.set(0, -0.4, -4600)

    // A few boats on the bay.
    const hull = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }), 16)
    const m = new THREE.Matrix4()
    for (let i = 0; i < 16; i++) {
      const len = 6 + Math.random() * 14
      m.compose(v3(-500 + Math.random() * 1000, 0.3, -220 - Math.random() * 900), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * 3, 0)), v3(len, 1.6, len * 0.32))
      hull.setMatrixAt(i, m)
    }
    this.scene.add(land, sand, sea, hull)
  }

  private buildCity(): void {
    const geo = new THREE.BoxGeometry(1, 1, 1)
    geo.translate(0, 0.5, 0)
    // Roofs and floors sample the plain corner of the facade texture.
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 8; i < 16; i++) uv.setXY(i, 0.01, 0.99)
    this.cityMat = new THREE.MeshStandardMaterial({
      map: facadeTex(false),
      emissiveMap: facadeTex(true),
      emissive: new THREE.Color(0xffc98a),
      emissiveIntensity: 0,
      roughness: 0.85,
    })
    const boxes: THREE.Matrix4[] = []
    const colors: THREE.Color[] = []
    const palette = ['#ffffff', '#f3ece0', '#efe6d6', '#e7e2da', '#f6efe4', '#dcd6cc']
    const m = new THREE.Matrix4()
    for (let gx = -22; gx <= 22; gx++)
      for (let gz = -2; gz <= 28; gz++) {
        const cx = gx * BLOCK
        const cz = gz * BLOCK
        if (cx > -95 && cx < 100 && cz > -70 && cz < 70) continue
        const d = Math.hypot(cx, cz)
        const n = d > 520 ? 1 : 1 + Math.floor(Math.random() * 3)
        for (let k = 0; k < n; k++) {
          const w = 8 + Math.random() * (n === 1 ? 16 : 9)
          const dd = 8 + Math.random() * (n === 1 ? 16 : 9)
          const coast = gz <= -1
          let h = 6 + Math.random() * 18 + (coast ? 12 : 0)
          if (Math.random() < (coast ? 0.25 : 0.06)) h = 30 + Math.random() * 45
          const ox = n === 1 ? 0 : (Math.random() - 0.5) * (BLOCK - 4 - w)
          const oz = n === 1 ? 0 : (Math.random() - 0.5) * (BLOCK - 4 - dd)
          m.compose(v3(cx + ox, 0, cz + oz), new THREE.Quaternion(), v3(w, h, dd))
          boxes.push(m.clone())
          colors.push(new THREE.Color(palette[Math.floor(Math.random() * palette.length)]))
        }
      }
    const city = new THREE.InstancedMesh(geo, this.cityMat, boxes.length)
    boxes.forEach((b, i) => {
      city.setMatrixAt(i, b)
      city.setColorAt(i, colors[i])
    })
    city.castShadow = city.receiveShadow = true
    this.scene.add(city)

    // Street trees around the site.
    const spots: THREE.Vector3[] = []
    for (let i = 0; i < 1400; i++) {
      const gx = Math.round((Math.random() - 0.5) * 34)
      const gz = Math.round(Math.random() * 18) - 1
      const along = (Math.random() - 0.5) * BLOCK
      const p = Math.random() > 0.5 ? v3(gx * BLOCK + BLOCK / 2 - 4.5, 0, gz * BLOCK + along) : v3(gx * BLOCK + along, 0, gz * BLOCK + BLOCK / 2 - 4.5)
      if (p.z < -80 || (Math.abs(p.x) < 90 && Math.abs(p.z) < 66)) continue
      spots.push(p)
    }
    this.plant(spots)
  }

  private plant(spots: THREE.Vector3[]): void {
    const canopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), spots.length)
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.25, 1, 5).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x6b5440 }), spots.length)
    const m = new THREE.Matrix4()
    const tint = new THREE.Color()
    spots.forEach((p, i) => {
      const h = 3 + Math.random() * 4
      const s = 1.6 + Math.random() * 1.6
      m.compose(v3(p.x, h, p.z), new THREE.Quaternion(), v3(s, s * 0.75, s))
      canopy.setMatrixAt(i, m)
      canopy.setColorAt(i, tint.setHSL(0.24 + Math.random() * 0.06, 0.45, 0.3 + Math.random() * 0.1))
      m.compose(p, new THREE.Quaternion(), v3(1, h, 1))
      trunk.setMatrixAt(i, m)
    })
    canopy.castShadow = true
    this.scene.add(canopy, trunk)
  }

  private buildSite(): void {
    const site = new THREE.Mesh(new THREE.PlaneGeometry(190, 140), new THREE.MeshStandardMaterial({ map: siteTex(), roughness: 0.95 }))
    site.rotation.x = -Math.PI / 2
    site.position.set(3, 0.03, -2)
    site.receiveShadow = true

    // Infinity pool between the towers, on the sea side.
    const shape = new THREE.Shape()
    shape.moveTo(-22, -4)
    shape.bezierCurveTo(-10, -9, 10, 1, 24, -5)
    shape.lineTo(24, 4)
    shape.bezierCurveTo(10, 9, -10, 0, -22, 6)
    shape.closePath()
    const deck = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: true, bevelSize: 1.6, bevelThickness: 0.1, bevelSegments: 1 }), new THREE.MeshStandardMaterial({ color: 0xf2ece0 }))
    deck.rotation.x = -Math.PI / 2
    deck.position.set(4, 0, -38)
    deck.receiveShadow = true
    const pool = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: 0x3fd0e6, roughness: 0.05, emissive: 0x0a5b70, emissiveIntensity: 0.4 }))
    pool.rotation.x = -Math.PI / 2
    pool.position.set(4, 0.66, -38)
    this.scene.add(site, deck, pool)

    const palms: THREE.Vector3[] = []
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 40 + Math.random() * 45
      const p = v3(3 + Math.cos(a) * r * 1.1, 0, -2 + Math.sin(a) * r * 0.75)
      if (towers.some((t) => Math.hypot(p.x - t.x, p.z - t.z) < t.rx + 8)) continue
      palms.push(p)
    }
    this.plant(palms)
  }

  private buildTower(t: Tower): void {
    const g = new THREE.Group()
    g.position.set(t.x, 0, t.z)
    const top = floorBase(t.floors + 1)

    const glass = new THREE.MeshStandardMaterial({ color: 0x23435f, metalness: 0.85, roughness: 0.08, emissive: 0xffc27a, emissiveIntensity: 0, envMapIntensity: 1.3 })
    this.glassMats.push(glass)
    const core = new THREE.Mesh(extrudeOutline((a) => ellipseR(t, a) * 0.97, top), glass)
    core.castShadow = true
    core.userData.tower = t
    this.towerHits.push(core)

    // Floor slabs ripple out into balconies; the roof is a thicker crown.
    const slabs: THREE.BufferGeometry[] = []
    const rails: THREE.BufferGeometry[] = []
    for (let f = 1; f <= t.floors + 1; f++) {
      const roof = f === t.floors + 1
      const r = (a: number) => slabR(t, f, a)
      const s = extrudeOutline(roof ? (a) => ellipseR(t, a) * 1.08 : r, roof ? 1.4 : 0.42)
      s.translate(0, floorBase(f) - (roof ? 0 : 0.42), 0)
      slabs.push(s)
      if (!roof) rails.push(ribbon((a) => r(a) - 0.05, floorBase(f), 1.05))
    }
    const canopy = extrudeOutline((a) => ellipseR(t, a) * 1.35, 0.5)
    canopy.translate(0, floorBase(1) - 0.5, 0)
    slabs.push(canopy)
    const slabMesh = new THREE.Mesh(mergeGeometries(slabs), new THREE.MeshStandardMaterial({ color: 0xf7f4ee, roughness: 0.55 }))
    slabMesh.castShadow = slabMesh.receiveShadow = true
    slabMesh.userData.tower = t
    this.towerHits.push(slabMesh)
    const railMesh = new THREE.Mesh(mergeGeometries(rails), new THREE.MeshStandardMaterial({ color: 0xbfe1ff, transparent: true, opacity: 0.28, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }))

    // Mullions on the glass.
    const mull = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, top, 0.16).translate(0, top / 2, 0), new THREE.MeshStandardMaterial({ color: 0xdfe4ea }), 64)
    const m = new THREE.Matrix4()
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2
      const r = ellipseR(t, a) * 0.975
      m.makeTranslation(Math.cos(a) * r, 0, -Math.sin(a) * r)
      mull.setMatrixAt(i, m)
    }
    g.add(core, slabMesh, railMesh, mull)

    // One translucent volume per residence, filling its share of the balcony band.
    for (const u of units.filter((u) => u.tower === t)) {
      const s = slots[u.slot - 1]
      const gap = 0.025
      const r = (a: number) => Math.min(slabR(t, u.floor, a), slabR(t, u.floor + 1, a)) * 0.965
      const geo = extrudeOutline(r, FLOOR_H - 0.62, s.centre - SLOT_SPAN / 2 + gap, s.centre + SLOT_SPAN / 2 - gap, 160)
      geo.translate(0, floorBase(u.floor) + 0.08, 0)
      const mesh: OverlayMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.4, depthWrite: false }))
      mesh.userData.unit = u
      mesh.renderOrder = 2
      this.overlays.set(u.code, mesh)
      g.add(mesh)
    }
    this.scene.add(g)
  }

  // ----- Time of day -----

  setTime(t: number): void {
    this.time = t
    const { num, col } = sample(t)
    const u = this.sky.material.uniforms
    u.turbidity.value = num('turbidity')
    u.rayleigh.value = num('rayleigh')
    u.mieCoefficient.value = num('mie')
    u.mieDirectionalG.value = 0.8
    u.cloudCoverage.value = num('clouds')
    u.cloudDensity.value = num('cloudDensity')
    const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - num('elev')), THREE.MathUtils.degToRad(num('azim')))
    u.sunPosition.value.copy(sun)
    this.sunLight.position.copy(sun).multiplyScalar(400)
    this.sunLight.intensity = num('sun') * Math.max(0, Math.min(1, (num('elev') + 1) / 4))
    this.sunLight.color.copy(col('sunColor'))
    this.moonLight.intensity = num('moon')
    this.hemi.intensity = num('hemi')
    this.hemi.color.copy(col('hemiSky'))
    this.hemi.groundColor.copy(col('hemiGround'))
    this.scene.fog = new THREE.FogExp2(col('fog'), num('fogDensity'))
    this.renderer.toneMappingExposure = num('exposure')
    const glow = num('glow')
    this.cityMat.emissiveIntensity = glow * 1.6
    for (const g of this.glassMats) g.emissiveIntensity = glow * 0.22
    this.nightDome.material.uniforms.uNight.value = num('night')
    this.stars.material.opacity = num('night')
    this.water.color.set(t > 2.5 ? 0x06192b : 0x0d4f73)
    this.envDirty = true
  }

  private refreshEnvironment(now: number): void {
    if (!this.envDirty || now - this.envAt < 0.25) return
    this.envDirty = false
    this.envAt = now
    this.envRT?.dispose()
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 9500)
    this.scene.environment = this.envRT.texture
    this.scene.environmentIntensity = 0.2 + 0.45 * (1 - sample(this.time).num('night'))
  }

  // ----- Residences -----

  setFilter(match: (u: Unit) => boolean): void {
    this.pickables = []
    for (const [, mesh] of this.overlays) {
      const ok = match(mesh.userData.unit)
      mesh.userData.match = ok
      if (ok) this.pickables.push(mesh)
      this.paint(mesh)
    }
  }

  private paint(mesh: OverlayMesh): void {
    const u: Unit = mesh.userData.unit
    const mat = mesh.material
    const on = mesh.userData.match
    const sel = this.selected === u
    const hov = this.hovered === u
    mat.color.set(on ? statusColor[u.status] : '#9aa3ad')
    mat.emissive.set(sel ? '#ffffff' : on ? statusColor[u.status] : '#000000')
    mat.emissiveIntensity = sel ? 0.55 : hov ? 0.75 : 0.28
    mat.opacity = !on ? 0.1 : sel || hov ? 0.95 : 0.8
  }

  select(u: Unit | null): void {
    const prev = this.selected
    this.selected = u
    if (prev) this.paint(this.overlays.get(prev.code)!)
    if (this.selectEdges) {
      this.selectEdges.parent?.remove(this.selectEdges)
      this.selectEdges.geometry.dispose()
      this.selectEdges = null
    }
    if (!u) return
    const mesh = this.overlays.get(u.code)!
    this.paint(mesh)
    this.selectEdges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), new THREE.LineBasicMaterial({ color: 0xffffff }))
    this.selectEdges.renderOrder = 3
    this.selectEdges.visible = this.mode === 'apartments'
    mesh.parent!.add(this.selectEdges)
  }

  /** World position on the facade at the middle of a residence. */
  unitPoint(u: Unit): THREE.Vector3 {
    const a = slots[u.slot - 1].centre
    const r = Math.min(slabR(u.tower, u.floor, a), slabR(u.tower, u.floor + 1, a)) * 0.96
    return outward(a).multiplyScalar(r).add(v3(u.tower.x, floorBase(u.floor) + FLOOR_H / 2, u.tower.z))
  }

  towerTop(t: Tower): THREE.Vector3 {
    return v3(t.x, floorBase(t.floors + 1) + 6, t.z)
  }

  // ----- Modes and camera -----

  setMode(mode: Mode): void {
    this.mode = mode
    const show = mode === 'apartments'
    for (const [, mesh] of this.overlays) mesh.visible = show && mesh.userData.unit.tower !== this.hiddenTower
    if (this.selectEdges) this.selectEdges.visible = show
    const c = this.controls
    if (mode === 'window') {
      c.enablePan = c.enableZoom = false
      c.rotateSpeed = -0.35
      c.minDistance = c.maxDistance = 0.6
      c.minPolarAngle = Math.PI * 0.32
      c.maxPolarAngle = Math.PI * 0.62
    } else {
      c.enablePan = c.enableZoom = true
      c.rotateSpeed = 0.8
      c.minDistance = 18
      c.maxDistance = 900
      c.minPolarAngle = 0
      c.maxPolarAngle = Math.PI * 0.485
    }
    this.setHover(null, null, 0, 0)
  }

  flyTo(shot: Shot, dur = 1.8, arc = 0): Promise<void> {
    this.tween?.done()
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) dur = 0.01
    return new Promise((done) => {
      this.controls.enabled = false
      this.tween = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: shot.pos, t1: shot.target, start: this.clock.elapsedTime, dur, arc, done }
    })
  }

  /** Jump without animating. */
  place(shot: Shot): void {
    this.camera.position.copy(shot.pos)
    this.controls.target.copy(shot.target)
    this.controls.update()
  }

  shotTower(t: Tower): Shot {
    const mid = floorBase(t.floors) * 0.5
    return { pos: v3(t.x + 112, mid + 34, t.z - 124), target: v3(t.x, mid + 4, t.z) }
  }

  shotUnit(u: Unit): Shot {
    const a = slots[u.slot - 1].centre
    const p = this.unitPoint(u)
    return { pos: p.clone().add(outward(a + 0.55).multiplyScalar(62)).add(v3(0, 10, 0)), target: p.clone().add(v3(0, -2, 0)) }
  }

  /** Stand on the residence's balcony and look out. View 2 turns along the coast. */
  shotWindow(u: Unit, view: 1 | 2): Shot {
    const a = slots[u.slot - 1].centre
    // Turn towards the sea (π/2); straight-out sea views turn east along the beach.
    const toSea = Math.sin(Math.PI / 2 - a) > 0 ? 1 : -1
    const look = view === 1 ? a : a + (u.slot === 1 ? -0.95 : 0.95 * toSea)
    const r = ellipseR(u.tower, a) * 1.03
    const pos = outward(a).multiplyScalar(r).add(v3(u.tower.x, floorBase(u.floor) + 1.6, u.tower.z))
    return { pos, target: pos.clone().add(outward(look).multiplyScalar(0.6)).add(v3(0, -0.04, 0)) }
  }

  /** In window view, hide the overlays of the tower we're standing on. */
  standOn(t: Tower | null): void {
    this.hiddenTower = t
    this.setMode(this.mode)
  }

  // ----- Picking -----

  private bindPointer(): void {
    const el = this.renderer.domElement
    el.addEventListener('pointerdown', (e) => (this.down = { x: e.clientX, y: e.clientY }))
    el.addEventListener('pointermove', (e) => {
      if (e.buttons || this.tween) return
      const hit = this.pick(e)
      this.setHover(hit.unit, hit.tower, e.clientX, e.clientY)
    })
    el.addEventListener('pointerleave', () => this.setHover(null, null, 0, 0))
    el.addEventListener('pointerup', (e) => {
      const d = this.down
      this.down = null
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return
      const hit = this.pick(e)
      if (hit.unit) this.onPickUnit(hit.unit)
      else if (hit.tower) this.onPickTower(hit.tower)
    })
  }

  private pick(e: PointerEvent): { unit: Unit | null; tower: Tower | null } {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.ray.setFromCamera(this.pointer, this.camera)
    if (this.mode === 'window') return { unit: null, tower: null }
    if (this.mode === 'apartments') {
      const hit = this.ray.intersectObjects(this.pickables.filter((o) => o.visible), false)[0]
      if (hit) return { unit: hit.object.userData.unit, tower: null }
    }
    const t = this.ray.intersectObjects(this.towerHits, false)[0]
    return { unit: null, tower: t ? t.object.userData.tower : null }
  }

  private setHover(u: Unit | null, t: Tower | null, x: number, y: number): void {
    const prev = this.hovered
    this.hovered = u
    if (prev && prev !== u) this.paint(this.overlays.get(prev.code)!)
    if (u) this.paint(this.overlays.get(u.code)!)
    this.renderer.domElement.style.cursor = u || t ? 'pointer' : ''
    this.onHover(u, t, x, y)
  }

  // ----- Loop -----

  /** Screen position of a world point, or null when behind the camera. */
  project(p: THREE.Vector3): { x: number; y: number } | null {
    const v = p.clone().project(this.camera)
    if (v.z > 1) return null
    return { x: ((v.x + 1) / 2) * this.host.clientWidth, y: ((1 - v.y) / 2) * this.host.clientHeight }
  }

  private resize(): void {
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.fov = w / h < 0.8 ? 58 : 42
    this.camera.updateProjectionMatrix()
  }

  private frame(): void {
    const now = this.clock.getElapsedTime()
    const tw = this.tween
    if (tw) {
      const k = Math.min(1, (now - tw.start) / tw.dur)
      const e = easeInOut(k)
      this.camera.position.lerpVectors(tw.p0, tw.p1, e)
      this.camera.position.y += Math.sin(Math.PI * e) * tw.arc
      this.controls.target.lerpVectors(tw.t0, tw.t1, e)
      // Bypass the controls mid-flight: their distance limits would clamp the path.
      this.camera.lookAt(this.controls.target)
      if (k >= 1) {
        this.tween = null
        this.controls.enabled = true
        tw.done()
      }
    } else this.controls.update()
    this.sky.material.uniforms.time.value = now
    this.water.normalMap!.offset.set(now * 0.004, now * 0.0025)
    this.refreshEnvironment(now)
    this.onFrame()
    this.renderer.render(this.scene, this.camera)
  }
}
