'use client'

import { animate, createTimer } from 'animejs'
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'

// Placeholder character art, to be replaced once the character is redesigned.
// Any light-on-black image works: the effect below is computed from it.
const HERO_SRC = '/login-hero.webp'

const HEIGHT = 1800 // internal canvas height in px
const ROW = 3 // scanline pitch: 2px line + 1px gap
const CELL = 4 // horizontal sampling step
const SCATTER = 0.3 // extra canvas width on the left for particles, as a fraction of the image width
const STREAM_SHARE = 0.42 // share of eroded cells that keep flying as particles; the rest vanish in the shatter
const BURST_SHARE = 0.3 // share of the intact cells that turn into fragments when the whole figure shatters
const ALPHA_LEVELS = 5 // particle opacity is quantized to a few precomputed colors
const TONES = 3
const OVERLAY_SCALE = 0.5 // the particle layer is redrawn every frame, so it runs at half resolution
const OVERLAY_EXTRA = 1 // the particle layer reaches this much further left than the figure, as a fraction of its width
const EDGE_FADE = 260 // fragments fade out over this distance before the particle layer's left edge

type RGB = [number, number, number]

/** Colors from the darkest to the brightest part of the source image, plus the accent for its saturated parts. */
interface Palette { low: RGB; mid: RGB; high: RGB; accent: RGB }
const PALETTES: Record<'dark' | 'light', Palette> = {
  // Glowing on a dark stage: brighter source pixels are lighter
  dark: { low: [38, 52, 128], mid: [128, 146, 232], high: [206, 222, 255], accent: [86, 170, 240] },
  // Ink on a light stage: brighter source pixels are denser blue
  light: { low: [150, 168, 236], mid: [84, 104, 214], high: [42, 58, 160], accent: [30, 122, 214] },
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const smoothstep = (lo: number, hi: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)))
  return t * t * (3 - 2 * t)
}

/** Deterministic PRNG so the scatter looks the same on every load. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Smooth 2D value noise in [0, 1], used to erode the figure in clumps rather than evenly. */
function makeNoise(rand: () => number, size = 64) {
  const grid = Float32Array.from({ length: size * size }, rand)
  const at = (x: number, y: number) => grid[(((y % size) + size) % size) * size + (((x % size) + size) % size)]
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y)
    const fx = smoothstep(0, 1, x - xi), fy = smoothstep(0, 1, y - yi)
    const top = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * fx
    const bottom = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * fx
    return top + (bottom - top) * fy
  }
}

/**
 * Particles in struct-of-arrays form. Each one is a cell of the figure:
 * it starts at (ox, oy) and travels by (dx, dy).
 */
interface Particles {
  count: number
  ox: Float32Array; oy: Float32Array
  dx: Float32Array; dy: Float32Array
  width: Float32Array
  alpha: Float32Array
  phase: Float32Array // where in its life cycle a stream particle starts, 0..1
  rate: Float32Array // life cycles per second (stream particles only)
  tone: Uint8Array
}

/** [ox, oy, dx, dy, width, alpha, phase, rate, tone] */
type ParticleRow = [number, number, number, number, number, number, number, number, number]

function pack(rows: ParticleRow[]): Particles {
  const count = rows.length
  const p: Particles = {
    count,
    ox: new Float32Array(count), oy: new Float32Array(count),
    dx: new Float32Array(count), dy: new Float32Array(count),
    width: new Float32Array(count),
    alpha: new Float32Array(count),
    phase: new Float32Array(count),
    rate: new Float32Array(count),
    tone: new Uint8Array(count),
  }
  rows.forEach((row, i) => {
    p.ox[i] = row[0]; p.oy[i] = row[1]
    p.dx[i] = row[2]; p.dy[i] = row[3]
    p.width[i] = row[4]
    p.alpha[i] = row[5]
    p.phase[i] = row[6]
    p.rate[i] = row[7]
    p.tone[i] = row[8]
  })
  return p
}

interface Scene {
  stream: Particles // eroded cells that keep peeling off the figure
  vanish: Particles // eroded cells that only exist for the opening shatter
  burst: Particles // fragments of the intact figure, used when the whole figure shatters
  extra: number // how far the particle layer extends left of x = 0, in figure pixels
  // The particle layer's pixels, written directly each frame: far cheaper than drawing
  // thousands of rectangles, since a particle is only a few pixels wide and one high
  image: ImageData
  pixels: Uint32Array
  colors: Uint32Array // packed pixel value per (tone, opacity level)
}

/** How far each part of the animation has run, 0..1. */
interface Progress {
  shatter: number // opening: 0 = figure whole, 1 = left side dissolved into the stream
  exit: number // leaving: 0 = normal, 1 = the whole figure has shattered away
}

/**
 * Draws the intact part of the mirrored (right-facing) figure as blue scanlines onto
 * `base`, and returns the particles for everything that moves.
 */
function buildScene(base: HTMLCanvasElement, overlay: HTMLCanvasElement, img: HTMLImageElement, palette: Palette): Scene | null {
  const width = Math.round((img.naturalWidth / img.naturalHeight) * HEIGHT)
  const pad = Math.round(width * SCATTER)

  // Mirrored source pixels
  const source = document.createElement('canvas')
  source.width = width
  source.height = HEIGHT
  const sctx = source.getContext('2d', { willReadFrequently: true })
  const ctx = base.getContext('2d')
  if (!sctx || !ctx) return null
  sctx.translate(width, 0)
  sctx.scale(-1, 1)
  sctx.drawImage(img, 0, 0, width, HEIGHT)
  const pixels = sctx.getImageData(0, 0, width, HEIGHT).data

  base.width = width + pad
  base.height = HEIGHT
  const extra = Math.round(base.width * OVERLAY_EXTRA)
  overlay.width = Math.round((base.width + extra) * OVERLAY_SCALE)
  overlay.height = Math.round(base.height * OVERLAY_SCALE)
  const image = ctx.createImageData(base.width, base.height)
  const out = image.data

  const rand = mulberry32(7)
  const noise = makeNoise(rand)
  // Separate generator, so adding fragments does not change how the figure erodes
  const burstRand = mulberry32(11)
  const maxReach = pad + width * 0.2
  const stream: ParticleRow[] = [], vanish: ParticleRow[] = [], burst: ParticleRow[] = []

  for (let y = 0; y < HEIGHT; y += ROW) {
    for (let x = 0; x < width; x += CELL) {
      const i = (Math.min(HEIGHT - 1, y + 1) * width + Math.min(width - 1, x + 2)) * 4
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
      if (lum < 0.07) continue

      const alpha = smoothstep(0.07, 0.45, lum)
      const tone = Math.min(TONES - 1, Math.floor(lum * TONES))

      // 0 on the intact right side, rising to 1 at the left edge of the figure
      const dissolve = smoothstep(0, 1, (width * 0.5 - x) / (width * 0.5))
      const erosion = dissolve * 1.05 + (noise(x / 60, y / 60) - 0.5) * 0.6 + (rand() - 0.5) * 0.3

      if (erosion < 0.5) {
        // Marble maps to periwinkle, the saturated (gold) parts to the accent blue
        const max = Math.max(r, g, b)
        const saturation = max ? (max - Math.min(r, g, b)) / max : 0
        let color = lum < 0.5 ? mix(palette.low, palette.mid, lum / 0.5) : mix(palette.mid, palette.high, (lum - 0.5) / 0.5)
        color = mix(color, palette.accent, smoothstep(0.3, 0.7, saturation) * 0.75)
        const right = Math.min(pad + x + CELL, base.width)
        for (let row = y; row < y + ROW - 1 && row < HEIGHT; row++) {
          for (let o = (row * base.width + pad + x) * 4, end = (row * base.width + right) * 4; o < end; o += 4) {
            out[o] = color[0]; out[o + 1] = color[1]; out[o + 2] = color[2]; out[o + 3] = alpha * 255
          }
        }

        if (burstRand() < BURST_SHARE) {
          // Flies outward in every direction, leaning up and to the left, when the whole
          // figure shatters
          const angle = burstRand() * Math.PI * 2
          const reach = 140 + burstRand() ** 1.5 * 820
          // Not clamped to the canvas: fragments that reach the top or right simply leave the screen
          const dx = Math.cos(angle) * reach - reach * 0.35
          const dy = Math.sin(angle) * reach * 0.8 - reach * 0.15
          burst.push([pad + x, y, dx, dy, CELL * 2, alpha, 0, 0, tone])
        }
        continue
      }

      if (rand() < STREAM_SHARE) {
        // Keeps peeling off the figure, drifting up and to the left
        const reach = (0.15 + rand() ** 1.6 * 0.85) * dissolve * maxReach
        stream.push([
          pad + x, y,
          -reach, -reach * 0.32 + (rand() - 0.5) * (40 + reach * 0.5),
          2 + Math.floor(rand() * 7),
          alpha * (0.5 + rand() * 0.5),
          rand(),
          1 / (7 + rand() * 9),
          tone,
        ])
      } else {
        // Only part of the opening shatter: slides off and fades out
        vanish.push([pad + x, y, -(20 + rand() * 90), (rand() - 0.6) * 50, CELL, alpha, 0, 0, tone])
      }
    }
  }

  ctx.putImageData(image, 0, 0)

  const octx = overlay.getContext('2d')
  if (!octx) return null
  const overlayImage = octx.createImageData(overlay.width, overlay.height)

  const colors = new Uint32Array(TONES * ALPHA_LEVELS)
  for (let tone = 0; tone < TONES; tone++) {
    const t = (tone + 0.5) / TONES
    const shade = t < 0.5 ? mix(palette.low, palette.mid, t / 0.5) : mix(palette.mid, palette.high, (t - 0.5) / 0.5)
    const [r, g, b] = mix(shade, palette.accent, 0.55)
    for (let level = 0; level < ALPHA_LEVELS; level++) {
      const a = Math.round(((level + 1) / ALPHA_LEVELS) * 255)
      // Canvas pixels are RGBA bytes, which read as ABGR in a little-endian 32-bit word
      colors[tone * ALPHA_LEVELS + level] = ((a << 24) | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0)) >>> 0
    }
  }

  return {
    stream: pack(stream), vanish: pack(vanish), burst: pack(burst), extra,
    image: overlayImage, pixels: new Uint32Array(overlayImage.data.buffer), colors,
  }
}

/** Draws one frame of the particles. `seconds` advances the stream. */
function drawParticles(overlay: HTMLCanvasElement, scene: Scene, { shatter, exit }: Progress, seconds: number) {
  const ctx = overlay.getContext('2d')
  if (!ctx) return
  const { stream, vanish, burst, extra, image, pixels, colors } = scene
  const width = overlay.width, height = overlay.height
  pixels.fill(0)

  const put = (p: Particles, i: number, travel: number, alpha: number) => {
    const x = p.ox[i] + p.dx[i] * travel
    // Dissolve before the layer's own left edge, so that edge never shows as a line
    const edge = Math.min(1, (x + extra) / EDGE_FADE)
    const level = Math.min(ALPHA_LEVELS, Math.ceil(alpha * edge * ALPHA_LEVELS)) - 1
    if (level < 0) return
    // Snapped to the scanline grid, then to the layer's (half-resolution) pixels
    const row = Math.floor(Math.round((p.oy[i] + p.dy[i] * travel) / ROW) * ROW * OVERLAY_SCALE)
    if (row < 0 || row >= height) return
    let from = Math.floor((x + extra) * OVERLAY_SCALE)
    let to = from + Math.max(1, Math.round(p.width[i] * OVERLAY_SCALE))
    if (from < 0) from = 0
    if (to > width) to = width
    const color = colors[p.tone[i] * ALPHA_LEVELS + level]
    for (let o = row * width + from, stop = row * width + to; o < stop; o++) pixels[o] = color
  }

  const staying = (1 - exit) ** 2

  for (let i = 0; i < stream.count; i++) {
    const life = (stream.phase[i] + seconds * stream.rate[i]) % 1
    // Fades in as it leaves the figure and out toward the end of its path
    const envelope = Math.min(1, life / 0.06) * (1 - life) ** 1.3
    put(stream, i, life * shatter + exit * 0.6, stream.alpha[i] * (1 - shatter + shatter * envelope) * staying)
  }

  if (shatter < 1) {
    const fade = (1 - shatter) ** 2 * staying
    for (let i = 0; i < vanish.count; i++) put(vanish, i, shatter, vanish.alpha[i] * fade)
  }

  if (exit > 0) {
    const travel = 1 - (1 - exit) ** 2
    const fade = (1 - exit) ** 1.5
    for (let i = 0; i < burst.count; i++) put(burst, i, travel, burst.alpha[i] * fade)
  }

  ctx.putImageData(image, 0, 0)
}

export interface LoginHeroHandle {
  /** Shatters the whole figure into fragments that fly off. Resolves when it is gone. */
  shatterAll(): Promise<void>
}

// Both theme layers read the same clock, so their particles line up across the wave's edge
let epoch = 0

/**
 * Login artwork: the character rendered as blue scanlines. With `intro` the figure
 * appears whole and its left side shatters; after that the fragments keep streaming away.
 * While `active` is false (the layer is hidden) nothing is drawn.
 */
export function LoginHero({ theme, active, intro, onReady, className = '', ref }: {
  theme: 'dark' | 'light'
  active: boolean
  intro: boolean
  onReady?: () => void // called once the figure has been built and is about to appear
  className?: string
  ref?: Ref<LoginHeroHandle>
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const activeRef = useRef(active)
  const buildRef = useRef<() => void>(() => {})
  const progressRef = useRef<Progress>({ shatter: 1, exit: 0 })
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useImperativeHandle(ref, () => ({
    shatterAll: () =>
      new Promise<void>((resolve) => {
        const base = baseRef.current
        if (!base) return resolve()
        // The solid figure gives way to its fragments
        animate(base, { opacity: 0, duration: 200, ease: 'out(2)' })
        animate(progressRef.current, { exit: 1, duration: 800, ease: 'out(2)', onComplete: () => resolve() })
      }),
  }), [])

  useEffect(() => {
    const img = new Image()
    const progress = progressRef.current
    let scene: Scene | null = null
    const animations: { pause(): unknown }[] = []
    progress.shatter = 1
    progress.exit = 0

    // Builds the figure on first need; the hidden layer waits until things have settled
    const build = (withIntro: boolean) => {
      const wrapper = wrapperRef.current, base = baseRef.current, overlay = overlayRef.current
      if (scene || !wrapper || !base || !overlay || !loaded) return
      // Not shown on phones: no figure, no particles, no work
      if (wrapper.offsetParent === null) return
      scene = buildScene(base, overlay, img, PALETTES[theme])
      if (!scene) return
      epoch ||= performance.now()
      onReadyRef.current?.()

      if (withIntro) {
        progress.shatter = 0
        animations.push(
          animate(wrapper, { opacity: [0, 1], duration: 900, ease: 'out(2)' }),
          animate(progress, { shatter: 1, duration: 2600, delay: 700, ease: 'inOut(2)' }),
        )
      } else {
        wrapper.style.opacity = '1'
      }
    }
    buildRef.current = () => build(false)

    let deferred = 0
    let loaded = false
    img.onload = () => {
      loaded = true
      if (activeRef.current) build(intro)
      else deferred = window.setTimeout(() => build(false), 4500)
    }
    img.src = HERO_SRC

    // No frame-rate cap: redraws on every display frame
    const timer = createTimer({
      onUpdate: () => {
        const wrapper = wrapperRef.current, overlay = overlayRef.current
        // Hidden layer, or hidden on small screens: skip the work
        if (!activeRef.current || !wrapper || !overlay || wrapper.offsetParent === null) return
        // The window grew from phone to desktop size: build now
        if (!scene) build(false)
        if (!scene) return
        drawParticles(overlay, scene, progress, (performance.now() - epoch) / 1000)
      },
    })

    return () => {
      img.onload = null
      window.clearTimeout(deferred)
      timer.pause()
      animations.forEach((animation) => animation.pause())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  useEffect(() => {
    activeRef.current = active
    // Shown before its deferred build happened: build right away
    if (active) buildRef.current()
  }, [active])

  return (
    <div ref={wrapperRef} aria-hidden="true" className={className} style={{ opacity: 0 }}>
      <canvas ref={baseRef} className="block h-full w-auto max-w-none" />
      {/* Wider than the figure: anchored to its right edge, it extends to the left */}
      <canvas ref={overlayRef} className="absolute top-0 right-0 h-full w-auto max-w-none" />
    </div>
  )
}
