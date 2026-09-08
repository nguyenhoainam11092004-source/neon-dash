import Phaser from 'phaser';
import { DEPTH, PALETTE } from '@/config/constants';
import { TEX } from './TextureFactory';

/** One live particle. Plain data so the pool can reuse the object wholesale. */
interface Particle {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  /** Seconds remaining. */
  life: number;
  /** Life the particle started with, for normalising the fade. */
  maxLife: number;
  /** Per-second drag applied to the velocity. */
  drag: number;
  gravity: number;
  spin: number;
  startScale: number;
  endScale: number;
  startAlpha: number;
  active: boolean;
}

export interface BurstOptions {
  count?: number;
  color?: number;
  /** Emission speed range in pixels per second. */
  speed?: [number, number];
  /** Lifetime range in seconds. */
  life?: [number, number];
  /** Scale range. */
  scale?: [number, number];
  /** Scale multiplier at the end of life. */
  endScale?: number;
  /** Restrict emission to an arc, in degrees. */
  angle?: [number, number];
  gravity?: number;
  drag?: number;
  spin?: number;
  texture?: string;
  blend?: Phaser.BlendModes;
  /** Spread the emission over an area rather than a point. */
  spread?: number;
}

/**
 * A pooled particle system.
 *
 * Phaser's own emitters are perfectly good, but a rhythm platformer emits in
 * short, frequent bursts of varied shapes, and creating an emitter per burst
 * would allocate constantly. This pool creates a fixed number of sprites once
 * and recycles them, so a level's particle cost is bounded no matter how many
 * effects fire.
 */
export class ParticleManager {
  private readonly scene: Phaser.Scene;
  private readonly pool: Particle[] = [];
  private readonly capacity: number;

  /** Round-robin cursor, so an exhausted pool recycles the oldest particle. */
  private cursor = 0;

  /** Scales every burst's count; lowered by the quality setting. */
  private densityScale = 1;

  constructor(scene: Phaser.Scene, capacity = 400) {
    this.scene = scene;
    this.capacity = capacity;
  }

  /** Sets the quality multiplier: 1 is full, 0 disables particles entirely. */
  setDensity(scale: number): void {
    this.densityScale = Math.max(0, Math.min(1, scale));
  }

  private acquire(texture: string, blend: Phaser.BlendModes): Particle {
    // Find a free particle, starting from the cursor so the search is O(1)
    // amortised rather than scanning from zero every time.
    for (let i = 0; i < this.pool.length; i += 1) {
      const index = (this.cursor + i) % this.pool.length;
      const particle = this.pool[index];
      if (particle && !particle.active) {
        this.cursor = (index + 1) % this.pool.length;
        particle.sprite.setTexture(texture);
        particle.sprite.setBlendMode(blend);
        return particle;
      }
    }

    if (this.pool.length < this.capacity) {
      const sprite = this.scene.add
        .image(0, 0, texture)
        .setDepth(DEPTH.PARTICLES)
        .setBlendMode(blend)
        .setVisible(false);

      const particle: Particle = {
        sprite,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        drag: 0,
        gravity: 0,
        spin: 0,
        startScale: 1,
        endScale: 0,
        startAlpha: 1,
        active: false,
      };
      this.pool.push(particle);
      return particle;
    }

    // Pool is full: steal the one at the cursor. Recycling the oldest is a
    // better failure mode than dropping the newest, which would make the most
    // recent, most relevant effect the one that goes missing.
    const victim = this.pool[this.cursor] as Particle;
    this.cursor = (this.cursor + 1) % this.pool.length;
    victim.sprite.setTexture(texture);
    victim.sprite.setBlendMode(blend);
    return victim;
  }

  /** Emits a burst at a point. */
  burst(x: number, y: number, options: BurstOptions = {}): void {
    if (this.densityScale <= 0) return;

    const count = Math.max(1, Math.round((options.count ?? 12) * this.densityScale));
    const color = options.color ?? PALETTE.CYAN;
    const speed = options.speed ?? [90, 320];
    const life = options.life ?? [0.28, 0.62];
    const scale = options.scale ?? [0.25, 0.6];
    const angle = options.angle ?? [0, 360];
    const texture = options.texture ?? TEX.PARTICLE;
    const blend = options.blend ?? Phaser.BlendModes.ADD;
    const spread = options.spread ?? 0;

    for (let i = 0; i < count; i += 1) {
      const particle = this.acquire(texture, blend);

      const theta = Phaser.Math.DegToRad(Phaser.Math.Between(angle[0], angle[1]));
      const magnitude = Phaser.Math.FloatBetween(speed[0], speed[1]);
      const startScale = Phaser.Math.FloatBetween(scale[0], scale[1]);
      const maxLife = Phaser.Math.FloatBetween(life[0], life[1]);

      particle.vx = Math.cos(theta) * magnitude;
      particle.vy = Math.sin(theta) * magnitude;
      particle.life = maxLife;
      particle.maxLife = maxLife;
      particle.drag = options.drag ?? 2.2;
      particle.gravity = options.gravity ?? 0;
      particle.spin = options.spin ?? 0;
      particle.startScale = startScale;
      particle.endScale = startScale * (options.endScale ?? 0);
      particle.startAlpha = 1;
      particle.active = true;

      particle.sprite
        .setPosition(
          x + (spread > 0 ? Phaser.Math.FloatBetween(-spread, spread) : 0),
          y + (spread > 0 ? Phaser.Math.FloatBetween(-spread, spread) : 0),
        )
        .setTint(color)
        .setScale(startScale)
        .setAlpha(1)
        .setAngle(0)
        .setVisible(true);
    }
  }

  /** Advances every live particle. Call once per frame. */
  update(dt: number): void {
    for (const particle of this.pool) {
      if (!particle.active) continue;

      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        particle.sprite.setVisible(false);
        continue;
      }

      // Exponential drag, so the result does not depend on the frame rate.
      const dragFactor = Math.exp(-particle.drag * dt);
      particle.vx *= dragFactor;
      particle.vy = particle.vy * dragFactor + particle.gravity * dt;

      const sprite = particle.sprite;
      sprite.x += particle.vx * dt;
      sprite.y += particle.vy * dt;

      const t = 1 - particle.life / particle.maxLife;
      sprite.setScale(particle.startScale + (particle.endScale - particle.startScale) * t);
      sprite.setAlpha(particle.startAlpha * (1 - t * t));
      if (particle.spin !== 0) sprite.angle += particle.spin * dt;
    }
  }

  // ---------- Named effects ----------

  /** A puff behind the player as they leave the ground. */
  jump(x: number, y: number, color: number, gravityUp: boolean): void {
    this.burst(x - 12, y + (gravityUp ? -14 : 14), {
      count: 8,
      color,
      speed: [40, 170],
      life: [0.2, 0.4],
      scale: [0.18, 0.38],
      angle: gravityUp ? [200, 340] : [20, 160],
      drag: 3.4,
    });
  }

  /** Dust on touchdown. */
  land(x: number, y: number, color: number, gravityUp: boolean): void {
    this.burst(x, y + (gravityUp ? -16 : 16), {
      count: 6,
      color,
      speed: [60, 190],
      life: [0.16, 0.32],
      scale: [0.16, 0.34],
      angle: gravityUp ? [190, 350] : [10, 170],
      drag: 4.5,
    });
  }

  /** The death explosion: a bright core plus slower shrapnel. */
  death(x: number, y: number, primary: number, secondary: number): void {
    this.burst(x, y, {
      count: 26,
      color: primary,
      speed: [140, 640],
      life: [0.35, 0.85],
      scale: [0.3, 0.8],
      drag: 1.6,
      gravity: 900,
    });
    this.burst(x, y, {
      count: 14,
      color: secondary,
      speed: [80, 380],
      life: [0.4, 0.9],
      scale: [0.35, 0.9],
      drag: 2.4,
      texture: TEX.SPARK,
      spin: 320,
    });
    this.burst(x, y, {
      count: 4,
      color: PALETTE.WHITE,
      speed: [10, 60],
      life: [0.16, 0.28],
      scale: [1.4, 2.4],
      endScale: 0,
      drag: 6,
      texture: TEX.GLOW,
    });
  }

  /** A ring of sparks when a portal fires. */
  portal(x: number, y: number, color: number): void {
    this.burst(x, y, {
      count: 18,
      color,
      speed: [120, 300],
      life: [0.3, 0.55],
      scale: [0.25, 0.5],
      drag: 2.8,
    });
  }

  /** A pickup sparkle. */
  collect(x: number, y: number, color: number): void {
    this.burst(x, y, {
      count: 14,
      color,
      speed: [90, 260],
      life: [0.3, 0.6],
      scale: [0.2, 0.45],
      drag: 2.2,
      gravity: -180,
    });
  }

  /** A trail speck behind a flying player. */
  trail(x: number, y: number, color: number): void {
    this.burst(x, y, {
      count: 1,
      color,
      speed: [0, 40],
      life: [0.22, 0.4],
      scale: [0.22, 0.4],
      endScale: 0,
      drag: 3,
      spread: 3,
    });
  }

  /** Confetti at the finish line. */
  finish(x: number, y: number): void {
    for (const color of [PALETTE.CYAN, PALETTE.MAGENTA, PALETTE.LIME, PALETTE.AMBER]) {
      this.burst(x, y, {
        count: 16,
        color,
        speed: [180, 620],
        life: [0.7, 1.4],
        scale: [0.3, 0.7],
        drag: 1.2,
        gravity: 620,
        spin: 260,
      });
    }
  }

  /** Deactivates every particle, e.g. on respawn. */
  clear(): void {
    for (const particle of this.pool) {
      particle.active = false;
      particle.sprite.setVisible(false);
    }
  }

  get activeCount(): number {
    return this.pool.reduce((total, particle) => total + (particle.active ? 1 : 0), 0);
  }

  destroy(): void {
    for (const particle of this.pool) particle.sprite.destroy();
    this.pool.length = 0;
  }
}
