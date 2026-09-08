import Phaser from 'phaser';
import { clamp01, damp } from '@/utils/MathUtils';
import { FONT_STACK, RADIUS, TYPE, UI_COLORS, hex } from './Theme';

export interface ProgressBarOptions {
  width?: number;
  height?: number;
  color?: number;
  trackColor?: number;
  /** Draws the percentage inside the bar. */
  showLabel?: boolean;
  /** Seconds of smoothing; 0 snaps to the target immediately. */
  smoothing?: number;
  /** Marks drawn on the track, as 0..1 positions. Used for practice checkpoints. */
  markers?: number[];
}

/**
 * The level progress bar, also reused by the loading screen.
 *
 * The displayed value eases toward the target instead of jumping, which reads
 * as smooth motion even when progress is only recomputed a few times a second.
 */
export class ProgressBar extends Phaser.GameObjects.Container {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly label?: Phaser.GameObjects.Text;
  private readonly opts: Required<Omit<ProgressBarOptions, 'markers'>> & { markers: number[] };

  private target = 0;
  private displayed = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, options: ProgressBarOptions = {}) {
    super(scene, x, y);

    this.opts = {
      width: options.width ?? 420,
      height: options.height ?? 22,
      color: options.color ?? UI_COLORS.accent,
      trackColor: options.trackColor ?? UI_COLORS.panel,
      showLabel: options.showLabel ?? true,
      smoothing: options.smoothing ?? 0.18,
      markers: options.markers ?? [],
    };

    this.graphics = scene.add.graphics();
    this.add(this.graphics);

    if (this.opts.showLabel) {
      this.label = scene.add
        .text(0, 0, '0%', {
          fontFamily: FONT_STACK,
          fontSize: `${TYPE.caption.size}px`,
          fontStyle: '700',
          color: hex(UI_COLORS.text),
        })
        .setOrigin(0.5);
      this.add(this.label);
    }

    this.setSize(this.opts.width, this.opts.height);
    this.redraw();
    scene.add.existing(this);
  }

  /** Sets the value the bar animates toward. Input is clamped to 0..1. */
  setProgress(value: number): this {
    this.target = clamp01(value);
    return this;
  }

  /** Sets the value with no animation, for a reset between attempts. */
  setProgressImmediate(value: number): this {
    this.target = clamp01(value);
    this.displayed = this.target;
    this.redraw();
    return this;
  }

  setMarkers(markers: number[]): this {
    this.opts.markers = markers.map(clamp01);
    this.redraw();
    return this;
  }

  setColor(color: number): this {
    this.opts.color = color;
    this.redraw();
    return this;
  }

  /** Advances the easing. Call once per frame with the frame delta in seconds. */
  override update(_time: number, deltaMs: number): void {
    if (Math.abs(this.displayed - this.target) < 0.0005) {
      if (this.displayed !== this.target) {
        this.displayed = this.target;
        this.redraw();
      }
      return;
    }

    const dt = deltaMs / 1000;
    this.displayed =
      this.opts.smoothing > 0
        ? damp(this.displayed, this.target, 1 / this.opts.smoothing, dt)
        : this.target;
    this.redraw();
  }

  private redraw(): void {
    const { width, height, color, trackColor } = this.opts;
    const x = -width / 2;
    const y = -height / 2;
    const radius = Math.min(RADIUS.pill, height / 2);

    this.graphics.clear();

    this.graphics.fillStyle(trackColor, 0.85);
    this.graphics.fillRoundedRect(x, y, width, height, radius);

    const fillWidth = width * this.displayed;
    if (fillWidth > 1) {
      // Clip the fill to the track's rounded ends so a short bar keeps the pill
      // shape rather than showing a square edge.
      const fillRadius = Math.min(radius, fillWidth / 2);
      this.graphics.fillStyle(color, 0.95);
      this.graphics.fillRoundedRect(x, y, fillWidth, height, fillRadius);

      this.graphics.fillStyle(UI_COLORS.text, 0.18);
      this.graphics.fillRoundedRect(x, y, fillWidth, height * 0.42, fillRadius);
    }

    for (const marker of this.opts.markers) {
      const mx = x + width * marker;
      this.graphics.fillStyle(UI_COLORS.warning, 0.9);
      this.graphics.fillRect(mx - 1, y - 3, 2, height + 6);
    }

    this.graphics.lineStyle(2, color, 0.5);
    this.graphics.strokeRoundedRect(x, y, width, height, radius);

    this.label?.setText(`${Math.floor(this.displayed * 100)}%`);
  }

  get value(): number {
    return this.target;
  }
}
