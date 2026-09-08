import Phaser from 'phaser';
import { PALETTE } from '@/config/constants';

/**
 * Generates every texture the game uses at runtime.
 *
 * NEON DASH ships no image files: shapes are drawn into canvas textures on
 * boot. That keeps all art original, removes the network cost of a sprite
 * atlas, and lets the palette be changed in one place.
 */

export const TEX = {
  PARTICLE: 'nd-particle',
  GLOW: 'nd-glow',
  SPARK: 'nd-spark',
  RING: 'nd-ring',
  SQUARE: 'nd-square',
  TRIANGLE: 'nd-triangle',
  SAW: 'nd-saw',
  CHEVRON: 'nd-chevron',
  STAR: 'nd-star',
  COIN: 'nd-coin',
  NOISE: 'nd-noise',
} as const;

export type TextureKey = (typeof TEX)[keyof typeof TEX];

/** Draws into an offscreen canvas texture and returns its key. */
function paint(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): string {
  if (scene.textures.exists(key)) return key;

  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return key;

  const ctx = texture.getContext();
  ctx.clearRect(0, 0, width, height);
  draw(ctx, width, height);
  texture.refresh();
  return key;
}

function cssColor(color: number, alpha = 1): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * A soft radial dot. Used for most particles; tinting at draw time means one
 * texture serves every colour in the game.
 */
function makeParticle(scene: Phaser.Scene): void {
  const size = 32;
  paint(scene, TEX.PARTICLE, size, size, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
}

/** A large, very soft blob used for bloom behind bright objects. */
function makeGlow(scene: Phaser.Scene): void {
  const size = 128;
  paint(scene, TEX.GLOW, size, size, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.32)');
    gradient.addColorStop(0.65, 'rgba(255,255,255,0.08)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
}

/** A short elongated streak for speed lines and death shrapnel. */
function makeSpark(scene: Phaser.Scene): void {
  paint(scene, TEX.SPARK, 48, 8, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** A hollow ring, used for jump rings and portal pulses. */
function makeRing(scene: Phaser.Scene): void {
  const size = 96;
  paint(scene, TEX.RING, size, size, (ctx, w, h) => {
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 8, 0, Math.PI * 2);
    ctx.stroke();
  });
}

/** A rounded square with an inner bevel: the base block and cube body. */
function makeSquare(scene: Phaser.Scene): void {
  const size = 64;
  paint(scene, TEX.SQUARE, size, size, (ctx, w, h) => {
    const r = 8;
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.beginPath();
    ctx.roundRect(2, 2, w - 4, h - 4, r);
    ctx.fill();

    // Punch a darker core so a flat tint still reads as a lit edge.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.roundRect(9, 9, w - 18, h - 18, r - 3);
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  });
}

/** An upward-pointing triangle: the spike. Rotation makes the other headings. */
function makeTriangle(scene: Phaser.Scene): void {
  const size = 64;
  paint(scene, TEX.TRIANGLE, size, size, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.beginPath();
    ctx.moveTo(w / 2, 3);
    ctx.lineTo(w - 3, h - 3);
    ctx.lineTo(3, h - 3);
    ctx.closePath();
    ctx.fill();

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(w / 2, 18);
    ctx.lineTo(w - 14, h - 10);
    ctx.lineTo(14, h - 10);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  });
}

/** A toothed disc: the saw blade. Spun by the obstacle at runtime. */
function makeSaw(scene: Phaser.Scene): void {
  const size = 96;
  const teeth = 12;
  paint(scene, TEX.SAW, size, size, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const outer = w / 2 - 3;
    const inner = outer * 0.72;

    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i += 1) {
      const angle = (i / (teeth * 2)) * Math.PI * 2 - Math.PI / 2;
      const radius = i % 2 === 0 ? outer : inner;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // Hollow hub, so the blade reads as machined rather than solid.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cx, cy, outer * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, outer * 0.46, 0, Math.PI * 2);
    ctx.stroke();
  });
}

/** A double chevron: speed portals and pad arrows. */
function makeChevron(scene: Phaser.Scene): void {
  paint(scene, TEX.CHEVRON, 64, 64, (ctx, w, h) => {
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const offset of [-13, 8]) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + offset - 9, 16);
      ctx.lineTo(w / 2 + offset + 9, h / 2);
      ctx.lineTo(w / 2 + offset - 9, h - 16);
      ctx.stroke();
    }
  });
}

/** A five-pointed star for level ratings and achievement badges. */
function makeStar(scene: Phaser.Scene): void {
  const size = 48;
  paint(scene, TEX.STAR, size, size, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const outer = w / 2 - 2;
    const inner = outer * 0.44;
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const radius = i % 2 === 0 ? outer : inner;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  });
}

/** A faceted hexagon coin, the collectible. */
function makeCoin(scene: Phaser.Scene): void {
  const size = 56;
  paint(scene, TEX.COIN, size, size, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const r = w / 2 - 3;

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(angle) * r * 0.62;
      const y = cy + Math.sin(angle) * r * 0.62;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * A tileable low-contrast noise field, multiplied over backgrounds so large
 * flat areas do not band on 8-bit displays.
 */
function makeNoise(scene: Phaser.Scene): void {
  const size = 128;
  paint(scene, TEX.NOISE, size, size, (ctx, w, h) => {
    const image = ctx.createImageData(w, h);
    // A fixed seed keeps the grain identical between sessions and machines.
    let state = 0x9e3779b9;
    for (let i = 0; i < image.data.length; i += 4) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const value = state >>> 24;
      image.data[i] = 255;
      image.data[i + 1] = 255;
      image.data[i + 2] = 255;
      image.data[i + 3] = value >> 4;
    }
    ctx.putImageData(image, 0, 0);
  });
}

/**
 * Creates every shared texture. Called once from PreloadScene; safe to call
 * again because `paint` skips keys that already exist.
 */
export function generateCoreTextures(scene: Phaser.Scene): void {
  makeParticle(scene);
  makeGlow(scene);
  makeSpark(scene);
  makeRing(scene);
  makeSquare(scene);
  makeTriangle(scene);
  makeSaw(scene);
  makeChevron(scene);
  makeStar(scene);
  makeCoin(scene);
  makeNoise(scene);
}

/**
 * Builds a vertical gradient strip for a level's sky.
 *
 * Levels ask for these by theme colour, so the key encodes the colours: two
 * levels with the same palette share one texture.
 */
export function generateGradient(
  scene: Phaser.Scene,
  top: number,
  bottom: number,
  height = 256,
): string {
  const key = `nd-gradient-${top.toString(16)}-${bottom.toString(16)}-${height}`;
  return paint(scene, key, 8, height, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, cssColor(top));
    gradient.addColorStop(1, cssColor(bottom));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
}

/** A single grid cell outline, tiled behind the play area. */
export function generateGridTile(
  scene: Phaser.Scene,
  cell: number,
  color: number = PALETTE.VIOLET,
  alpha = 0.16,
): string {
  const key = `nd-grid-${cell}-${color.toString(16)}-${Math.round(alpha * 100)}`;
  return paint(scene, key, cell, cell, (ctx, w, h) => {
    ctx.strokeStyle = cssColor(color, alpha);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0.5, 0);
    ctx.lineTo(0.5, h);
    ctx.moveTo(0, 0.5);
    ctx.lineTo(w, 0.5);
    ctx.stroke();
  });
}
