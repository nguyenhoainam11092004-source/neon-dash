import Phaser from 'phaser';
import { DEPTH, PALETTE, VIEW } from '@/config/constants';
import { createRandom } from '@/utils/MathUtils';
import { TEX } from './TextureFactory';

export interface NeonBackgroundOptions {
  /** Top and bottom colours of the sky wash. */
  top?: number;
  bottom?: number;
  /** Accent colour for the moving geometry. */
  accent?: number;
  /** Which pattern to draw behind the gradient. */
  pattern?: 'grid' | 'stars' | 'waves' | 'rings' | 'none';
  /** Fixed seed so a level's background is identical every attempt. */
  seed?: number;
  /** Scrolls with the camera at this fraction of its speed. */
  parallax?: number;
  /** Lower values calm the animation for the reduced-motion setting. */
  motion?: number;
}

/**
 * The animated backdrop shared by the menus and by gameplay.
 *
 * Everything is drawn into one Graphics object and a handful of pooled sprites
 * that are repositioned rather than recreated, so an animated background costs
 * a fixed, small number of draw calls no matter how long a level runs.
 */
export class NeonBackground {
  private readonly scene: Phaser.Scene;
  private readonly opts: Required<NeonBackgroundOptions>;

  private readonly container: Phaser.GameObjects.Container;
  private readonly sky: Phaser.GameObjects.Graphics;
  private readonly pattern: Phaser.GameObjects.Graphics;
  private readonly motes: Phaser.GameObjects.Image[] = [];
  private readonly moteSpeeds: number[] = [];

  private elapsed = 0;
  /** Driven by the beat manager; decays back to 0 between beats. */
  private pulse = 0;
  private scrollX = 0;

  constructor(scene: Phaser.Scene, options: NeonBackgroundOptions = {}) {
    this.scene = scene;
    this.opts = {
      top: options.top ?? PALETTE.BG_GLOW,
      bottom: options.bottom ?? PALETTE.BG_DEEP,
      accent: options.accent ?? PALETTE.VIOLET,
      pattern: options.pattern ?? 'grid',
      seed: options.seed ?? 1337,
      parallax: options.parallax ?? 0.25,
      motion: options.motion ?? 1,
    };

    this.container = scene.add.container(0, 0).setDepth(DEPTH.BACKGROUND).setScrollFactor(0);

    this.sky = scene.add.graphics();
    this.pattern = scene.add.graphics();
    this.container.add([this.sky, this.pattern]);

    this.drawSky();
    this.createMotes();
  }

  /**
   * A vertical wash painted as horizontal bands.
   *
   * Graphics has no gradient fill, and a full-screen gradient texture would need
   * regenerating whenever a colour trigger fires, so bands are both cheaper and
   * easier to retint.
   */
  private drawSky(): void {
    const bands = 48;
    const bandHeight = Math.ceil(VIEW.HEIGHT / bands) + 1;

    this.sky.clear();
    for (let i = 0; i < bands; i += 1) {
      const t = i / (bands - 1);
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(this.opts.top),
        Phaser.Display.Color.ValueToColor(this.opts.bottom),
        1,
        t,
      );
      const packed = ((color.r & 0xff) << 16) | ((color.g & 0xff) << 8) | (color.b & 0xff);
      this.sky.fillStyle(packed, 1);
      this.sky.fillRect(0, i * (VIEW.HEIGHT / bands), VIEW.WIDTH, bandHeight);
    }
  }

  /** Slow drifting specks that give the parallax something to act on. */
  private createMotes(): void {
    const random = createRandom(this.opts.seed);
    const count = 26;

    for (let i = 0; i < count; i += 1) {
      const mote = this.scene.add
        .image(random() * VIEW.WIDTH, random() * VIEW.HEIGHT, TEX.PARTICLE)
        .setTint(i % 3 === 0 ? PALETTE.CYAN : this.opts.accent)
        .setAlpha(0.1 + random() * 0.25)
        .setScale(0.2 + random() * 0.55)
        .setBlendMode(Phaser.BlendModes.ADD);

      this.container.add(mote);
      this.motes.push(mote);
      this.moteSpeeds.push(6 + random() * 26);
    }
  }

  /** Called by the beat manager; makes the backdrop breathe with the music. */
  onBeat(strength = 1): void {
    this.pulse = Math.min(1, this.pulse + strength);
  }

  /** Recolours the backdrop, e.g. from a colour trigger. */
  setColors(top: number, bottom: number, accent: number): void {
    this.opts.top = top;
    this.opts.bottom = bottom;
    this.opts.accent = accent;
    this.drawSky();
  }

  setMotion(motion: number): void {
    this.opts.motion = motion;
  }

  /**
   * Advances the animation.
   *
   * `cameraX` lets gameplay scroll the pattern with the level while the whole
   * container stays pinned to the viewport, which is what makes it parallax
   * rather than simply move.
   */
  update(dt: number, cameraX = 0): void {
    const motion = this.opts.motion;
    this.elapsed += dt * motion;
    this.scrollX = cameraX * this.opts.parallax;
    this.pulse = Math.max(0, this.pulse - dt * 3.2);

    for (let i = 0; i < this.motes.length; i += 1) {
      const mote = this.motes[i];
      const speed = this.moteSpeeds[i];
      if (!mote || speed === undefined) continue;

      mote.y -= speed * dt * motion;
      if (mote.y < -20) {
        mote.y = VIEW.HEIGHT + 20;
        mote.x = Math.random() * VIEW.WIDTH;
      }
      // Parallax the specks a little harder than the pattern so depth reads.
      mote.x = Phaser.Math.Wrap(mote.x - speed * dt * motion * 0.4, -20, VIEW.WIDTH + 20);
    }

    this.drawPattern();
  }

  private drawPattern(): void {
    const g = this.pattern;
    g.clear();

    if (this.opts.pattern === 'none') return;

    const glow = 0.14 + this.pulse * 0.22;
    const accent = this.opts.accent;

    switch (this.opts.pattern) {
      case 'grid':
        this.drawGrid(g, accent, glow);
        break;
      case 'waves':
        this.drawWaves(g, accent, glow);
        break;
      case 'rings':
        this.drawRings(g, accent, glow);
        break;
      case 'stars':
        this.drawStars(g, accent, glow);
        break;
    }
  }

  private drawGrid(g: Phaser.GameObjects.Graphics, color: number, alpha: number): void {
    const cell = 96;
    const offset = Phaser.Math.Wrap(-this.scrollX, 0, cell);

    g.lineStyle(1, color, alpha);
    for (let x = offset - cell; x <= VIEW.WIDTH + cell; x += cell) {
      g.lineBetween(x, 0, x, VIEW.HEIGHT);
    }
    for (let y = 0; y <= VIEW.HEIGHT; y += cell) {
      g.lineBetween(0, y, VIEW.WIDTH, y);
    }

    // A brighter horizon line stops the grid reading as flat wallpaper.
    g.lineStyle(2, color, alpha * 2.2);
    g.lineBetween(0, VIEW.HEIGHT * 0.62, VIEW.WIDTH, VIEW.HEIGHT * 0.62);
  }

  private drawWaves(g: Phaser.GameObjects.Graphics, color: number, alpha: number): void {
    const layers = 4;
    for (let layer = 0; layer < layers; layer += 1) {
      const amplitude = 26 + layer * 16;
      const wavelength = 260 + layer * 90;
      const speed = 0.35 + layer * 0.12;
      const baseY = VIEW.HEIGHT * (0.5 + layer * 0.12);

      g.lineStyle(2, color, alpha * (1 - layer * 0.18));
      g.beginPath();
      for (let x = 0; x <= VIEW.WIDTH; x += 12) {
        const phase = (x + this.scrollX * (0.4 + layer * 0.2)) / wavelength;
        const y = baseY + Math.sin(phase * Math.PI * 2 + this.elapsed * speed) * amplitude;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokePath();
    }
  }

  private drawRings(g: Phaser.GameObjects.Graphics, color: number, alpha: number): void {
    const cx = VIEW.WIDTH * 0.5;
    const cy = VIEW.HEIGHT * 0.45;
    const count = 7;
    // Rings expand outward continuously; the modulo makes the cycle seamless.
    for (let i = 0; i < count; i += 1) {
      const phase = (((this.elapsed * 0.22 + i / count) % 1) + 1) % 1;
      const radius = 60 + phase * 620;
      g.lineStyle(2, color, alpha * (1 - phase));
      g.strokeCircle(cx, cy, radius);
    }
  }

  private drawStars(g: Phaser.GameObjects.Graphics, color: number, alpha: number): void {
    const random = createRandom(this.opts.seed ^ 0x5f3a);
    g.fillStyle(color, alpha * 1.6);
    for (let i = 0; i < 70; i += 1) {
      const baseX = random() * VIEW.WIDTH * 1.4;
      const y = random() * VIEW.HEIGHT;
      const depth = 0.3 + random() * 0.7;
      const x = Phaser.Math.Wrap(baseX - this.scrollX * depth, -10, VIEW.WIDTH + 10);
      const twinkle = 0.5 + 0.5 * Math.sin(this.elapsed * 2 + i);
      g.fillRect(x, y, 2, 2 * twinkle + 0.5);
    }
  }

  /** Adds this backdrop's objects to a scene container or camera ignore list. */
  get gameObject(): Phaser.GameObjects.Container {
    return this.container;
  }

  destroy(): void {
    this.container.destroy(true);
    this.motes.length = 0;
    this.moteSpeeds.length = 0;
  }
}
