import { describe, expect, it } from 'vitest';
import {
  clamp,
  clamp01,
  createRandom,
  damp,
  getEasing,
  lerp,
  mixColor,
  packColor,
  parseHexColor,
  pointInTriangle,
  rectsOverlap,
  snap,
  toHexColor,
  unpackColor,
} from '@/utils/MathUtils';

describe('MathUtils', () => {
  it('clamps within bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('clamp01 restricts to the unit interval', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
  });

  it('lerp interpolates linearly', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it('damp converges toward the target over time regardless of step size', () => {
    let value = 0;
    for (let i = 0; i < 100; i += 1) value = damp(value, 100, 5, 1 / 60);
    expect(value).toBeGreaterThan(95);

    // Coarser steps should reach approximately the same place after the same
    // total elapsed time - this is the entire point of frame-rate independence.
    let coarse = 0;
    for (let i = 0; i < 10; i += 1) coarse = damp(coarse, 100, 5, 1 / 6);
    expect(Math.abs(coarse - value)).toBeLessThan(1);
  });

  it('snap rounds to the nearest step', () => {
    expect(snap(23, 10)).toBe(20);
    expect(snap(27, 10)).toBe(30);
    expect(snap(5, 0)).toBe(5);
  });

  it('rectsOverlap detects overlap correctly', () => {
    expect(rectsOverlap(0, 0, 10, 10, 5, 5, 10, 10)).toBe(true);
    expect(rectsOverlap(0, 0, 10, 10, 20, 20, 10, 10)).toBe(false);
    expect(rectsOverlap(0, 0, 10, 10, 10, 10, 10, 10)).toBe(false);
  });

  it('pointInTriangle finds points inside and rejects points outside', () => {
    // A triangle with apex at (0,-10), base corners at (-10,10) and (10,10).
    expect(pointInTriangle(0, 0, 0, -10, 10, 10, -10, 10)).toBe(true);
    expect(pointInTriangle(0, -9, 0, -10, 10, 10, -10, 10)).toBe(true);
    expect(pointInTriangle(0, 100, 0, -10, 10, 10, -10, 10)).toBe(false);
    expect(pointInTriangle(-100, -100, 0, -10, 10, 10, -10, 10)).toBe(false);
  });

  it('createRandom is deterministic for a given seed', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    const sequenceA = Array.from({ length: 5 }, () => a());
    const sequenceB = Array.from({ length: 5 }, () => b());
    expect(sequenceA).toEqual(sequenceB);
    for (const value of sequenceA) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('createRandom produces different sequences for different seeds', () => {
    const a = createRandom(1);
    const b = createRandom(2);
    expect(a()).not.toBe(b());
  });

  it('easing functions map 0 to 0 and 1 to 1', () => {
    for (const name of [
      'linear',
      'easeIn',
      'easeOut',
      'easeInOut',
      'easeOutBack',
      'easeOutBounce',
    ] as const) {
      const fn = getEasing(name);
      expect(fn(0)).toBeCloseTo(0, 1);
      expect(fn(1)).toBeCloseTo(1, 1);
    }
  });

  it('getEasing falls back to linear for an unknown name', () => {
    const fn = getEasing('not-a-real-easing');
    expect(fn(0.5)).toBe(0.5);
  });

  it('packs and unpacks colours symmetrically', () => {
    const packed = packColor(47, 243, 240);
    const unpacked = unpackColor(packed);
    expect(unpacked).toEqual({ r: 47, g: 243, b: 240 });
  });

  it('mixColor blends toward the target', () => {
    const a = packColor(0, 0, 0);
    const b = packColor(255, 255, 255);
    expect(mixColor(a, b, 0)).toBe(a);
    expect(mixColor(a, b, 1)).toBe(b);
    const mid = unpackColor(mixColor(a, b, 0.5));
    expect(mid.r).toBeGreaterThanOrEqual(127);
    expect(mid.r).toBeLessThanOrEqual(128);
  });

  it('parseHexColor accepts valid hex strings and rejects invalid ones', () => {
    expect(parseHexColor('#2ff3f0')).toBe(0x2ff3f0);
    expect(parseHexColor('2ff3f0')).toBe(0x2ff3f0);
    expect(parseHexColor('not-a-color')).toBeNull();
    expect(parseHexColor('#fff')).toBeNull();
  });

  it('toHexColor formats a packed colour back to a hex string', () => {
    expect(toHexColor(0x2ff3f0)).toBe('#2ff3f0');
    expect(toHexColor(0)).toBe('#000000');
  });
});
