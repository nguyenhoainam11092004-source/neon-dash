import Phaser from 'phaser';
import { DEPTH, VIEW } from '@/config/constants';

/**
 * A full-screen colour flash.
 *
 * Implemented as one persistent rectangle whose alpha is tweened, rather than
 * as the camera's built-in flash: this way several flashes can be told apart by
 * colour, the effect respects the reduced-motion setting, and nothing is
 * allocated when it fires.
 */
export class ScreenFlash {
  private readonly rect: Phaser.GameObjects.Rectangle;
  private readonly scene: Phaser.Scene;
  private enabled = true;
  private tween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, depth: number = DEPTH.FOREGROUND) {
    this.scene = scene;
    this.rect = scene.add
      .rectangle(0, 0, VIEW.WIDTH, VIEW.HEIGHT, 0xffffff, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(depth)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  /** Disables flashing entirely, for photosensitivity. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.tween?.stop();
      this.rect.setFillStyle(0xffffff, 0);
    }
  }

  /** Flashes `color`, fading out over `seconds`. */
  flash(color: number, seconds = 0.2, peak = 0.45): void {
    if (!this.enabled) return;

    // Restart rather than layer: two overlapping flashes read as one brighter
    // one, which is rarely what the caller meant.
    this.tween?.stop();
    this.rect.setFillStyle(color, peak);

    this.tween = this.scene.tweens.add({
      targets: this.rect,
      fillAlpha: 0,
      duration: seconds * 1000,
      ease: 'Quad.easeOut',
    });
  }

  destroy(): void {
    this.tween?.stop();
    this.rect.destroy();
  }
}
