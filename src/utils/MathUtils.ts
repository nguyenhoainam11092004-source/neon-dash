import type { EasingFunction, EasingTable } from '@/types/TriggerTypes';

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Frame-rate independent exponential smoothing.
 *
 * A plain `lerp(current, target, 0.1)` per frame moves faster on a 144 Hz
 * display than on a 60 Hz one. This converges at `rate` per second regardless.
 */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

/** Maps `value` from one range onto another without clamping. */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax === inMin) return outMin;
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radToDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}

/** Wraps an angle in degrees into [0, 360). */
export function wrapDegrees(degrees: number): number {
  const wrapped = degrees % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** Rounds `value` to the nearest multiple of `step`. */
export function snap(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

/** True when the two axis-aligned rectangles overlap. */
export function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/** True when point (px, py) is inside the axis-aligned rectangle. */
export function pointInRect(
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

/**
 * Distance from a point to an axis-aligned rectangle, 0 when inside.
 * Used for cheap circle-vs-box tests (saw blades, rings).
 */
export function distancePointToRect(
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  const dx = Math.max(x - px, 0, px - (x + w));
  const dy = Math.max(y - py, 0, py - (y + h));
  return Math.hypot(dx, dy);
}

/**
 * Signed distance from a point to a triangle, used for spike collision.
 * Returns true when the point is inside the triangle.
 */
export function pointInTriangle(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): boolean {
  const d1 = (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
  const d2 = (px - x3) * (y2 - y3) - (x2 - x3) * (py - y3);
  const d3 = (px - x1) * (y3 - y1) - (x3 - x1) * (py - y1);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/** Deterministic 32-bit hash of a string; used for stable procedural seeds. */
export function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * A small, fast, seedable PRNG (mulberry32).
 *
 * Procedural backgrounds and particle jitter use this rather than Math.random
 * so a level looks identical on every machine and in every replay.
 */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return function random(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const easeOutBounceFn: EasingFunction = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) {
    const t2 = t - 1.5 / d1;
    return n1 * t2 * t2 + 0.75;
  }
  if (t < 2.5 / d1) {
    const t2 = t - 2.25 / d1;
    return n1 * t2 * t2 + 0.9375;
  }
  const t2 = t - 2.625 / d1;
  return n1 * t2 * t2 + 0.984375;
};

/** Every easing a trigger may name, keyed by its schema name. */
export const EASING: EasingTable = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeOutElastic: (t) => {
    if (t === 0 || t === 1) return t;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  easeOutBounce: easeOutBounceFn,
};

/** Resolves an easing by name, falling back to linear for unknown names. */
export function getEasing(name: string): EasingFunction {
  return (EASING as Record<string, EasingFunction>)[name] ?? EASING.linear;
}

/** Packs three 0..255 channels into a single 0xRRGGBB integer. */
export function packColor(r: number, g: number, b: number): number {
  return (
    ((clamp(Math.round(r), 0, 255) << 16) |
      (clamp(Math.round(g), 0, 255) << 8) |
      clamp(Math.round(b), 0, 255)) >>>
    0
  );
}

/** Splits a 0xRRGGBB integer into its channels. */
export function unpackColor(color: number): { r: number; g: number; b: number } {
  return {
    r: (color >> 16) & 0xff,
    g: (color >> 8) & 0xff,
    b: color & 0xff,
  };
}

/** Blends two packed colours; `t` of 0 returns `a`, 1 returns `b`. */
export function mixColor(a: number, b: number, t: number): number {
  const ca = unpackColor(a);
  const cb = unpackColor(b);
  const k = clamp01(t);
  return packColor(lerp(ca.r, cb.r, k), lerp(ca.g, cb.g, k), lerp(ca.b, cb.b, k));
}

/** Parses "#rrggbb" or "rrggbb" into a packed integer. Returns null when invalid. */
export function parseHexColor(hex: string): number | null {
  const cleaned = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  return Number.parseInt(cleaned, 16);
}

/** Formats a packed integer as "#rrggbb". */
export function toHexColor(color: number): string {
  return `#${(color >>> 0).toString(16).padStart(6, '0')}`;
}
