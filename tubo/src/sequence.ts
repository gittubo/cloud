// Scroll-scrubbed image sequence drawn to a canvas.
// Frames stream in nearest-first around the playhead; until a frame arrives
// the closest loaded neighbour stands in. Fractional positions crossfade the
// two neighbouring frames, which keeps the 12 fps footage smooth.


const CONCURRENCY = 6

export class FrameSequence {
  private readonly images: (HTMLImageElement | null)[]
  private readonly requested: boolean[]
  private inFlight = 0
  private loadedCount = 0
  private playhead = 0
  private readonly priority: number[]
  onLoad: (() => void) | null = null

  /** dir is the frames folder under frames/, e.g. 'port/hd'. */
  constructor(readonly count: number, private readonly dir: string, sparseStep = 8, densePrefix = 6) {
    this.images = new Array(count).fill(null)
    this.requested = new Array(count).fill(false)
    // First the opening frames densely, then a coarse pass over the whole film,
    // so any scroll position has something to show almost immediately.
    const opening = Array.from({ length: Math.min(densePrefix, count) }, (_, i) => i)
    const sparse = Array.from({ length: Math.ceil(count / sparseStep) }, (_, i) => i * sparseStep)
    this.priority = [...new Set([...opening, ...sparse, count - 1])]
  }

  get bootstrapSize(): number {
    return this.priority.length
  }

  get loaded(): number {
    return this.loadedCount
  }

  url(i: number): string {
    return `${import.meta.env.BASE_URL}frames/${this.dir}/f${String(i).padStart(5, '0')}.webp`
  }

  start(): void {
    for (let i = 0; i < CONCURRENCY; i++) this.pump()
  }

  setPlayhead(frame: number): void {
    this.playhead = frame
  }

  private next(): number {
    while (this.priority.length) {
      const i = this.priority.shift()!
      if (!this.requested[i]) return i
    }
    // Nearest unrequested frame, looking ahead of the playhead first.
    const p = Math.round(this.playhead)
    for (let d = 0; d < this.count; d++) {
      const ahead = p + d
      if (ahead < this.count && !this.requested[ahead]) return ahead
      const behind = p - d
      if (d > 0 && behind >= 0 && !this.requested[behind]) return behind
    }
    return -1
  }

  private pump(): void {
    if (this.inFlight >= CONCURRENCY) return
    const i = this.next()
    if (i < 0) return
    this.requested[i] = true
    this.inFlight++
    const img = new Image()
    img.decoding = 'async'
    img.src = this.url(i)
    img
      .decode()
      .then(() => {
        this.images[i] = img
        this.loadedCount++
        this.onLoad?.()
      })
      .catch(() => {
        // A failed frame is left empty; neighbours cover it.
      })
      .finally(() => {
        this.inFlight--
        this.pump()
      })
  }

  /** The loaded frame closest to i, or null if nothing has loaded yet. */
  nearest(i: number): HTMLImageElement | null {
    if (this.images[i]) return this.images[i]
    for (let d = 1; d < this.count; d++) {
      const a = this.images[i - d]
      if (a) return a
      const b = this.images[i + d]
      if (b) return b
    }
    return null
  }

  has(i: number): boolean {
    return this.images[i] != null
  }
}

/** Draws image cover-fitted into a canvas, optionally on top at an alpha. */
export function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, alpha = 1, zoom = 1): void {
  const { width: cw, height: ch } = ctx.canvas
  const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight) * zoom
  const w = img.naturalWidth * scale
  const h = img.naturalHeight * scale
  ctx.globalAlpha = alpha
  ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h)
  ctx.globalAlpha = 1
}

export function renderFrame(ctx: CanvasRenderingContext2D, seq: FrameSequence, frame: number, zoom = 1): void {
  const lo = Math.max(0, Math.min(seq.count - 1, Math.floor(frame)))
  const hi = Math.min(seq.count - 1, lo + 1)
  const t = frame - lo
  const base = seq.nearest(lo)
  if (!base) return
  drawCover(ctx, base, 1, zoom)
  if (t > 0.02 && hi !== lo && seq.has(lo) && seq.has(hi)) drawCover(ctx, seq.nearest(hi)!, t, zoom)
}
