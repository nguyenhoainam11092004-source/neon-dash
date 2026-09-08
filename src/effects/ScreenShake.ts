import { clamp } from '@/utils/MathUtils';

/**
 * A decaying screen-shake value.
 *
 * Separated from the camera so the same shake can drive a non-camera target —
 * the editor's canvas, a UI panel — and so the decay curve lives in one place.
 * The camera controller has its own copy of this logic for the gameplay camera;
 * this is the reusable form for everything else.
 */
export class ScreenShake {
  private intensity = 0;
  private duration = 0;
  private elapsed = 0;
  /** Scales every shake; 0 disables it for the accessibility setting. */
  private scale = 1;

  private offsetX = 0;
  private offsetY = 0;

  setScale(scale: number): void {
    this.scale = clamp(scale, 0, 2);
  }

  /**
   * Starts a shake.
   *
   * A stronger shake replaces a weaker one rather than adding to it: stacking
   * would let a burst of small impacts produce something unplayable.
   */
  shake(intensity: number, duration: number): void {
    if (this.scale <= 0) return;
    if (intensity < this.intensity) return;
    this.intensity = intensity;
    this.duration = Math.max(0.05, duration);
    this.elapsed = 0;
  }

  update(dt: number): void {
    if (this.intensity <= 0) {
      this.offsetX = 0;
      this.offsetY = 0;
      return;
    }

    this.elapsed += dt;
    if (this.elapsed >= this.duration) {
      this.intensity = 0;
      this.offsetX = 0;
      this.offsetY = 0;
      return;
    }

    // Quadratic falloff: the shake tapers rather than stopping abruptly.
    const remaining = 1 - this.elapsed / this.duration;
    const amount = this.intensity * remaining * remaining * this.scale;

    this.offsetX = (Math.random() * 2 - 1) * amount;
    this.offsetY = (Math.random() * 2 - 1) * amount;
  }

  get x(): number {
    return this.offsetX;
  }

  get y(): number {
    return this.offsetY;
  }

  get isActive(): boolean {
    return this.intensity > 0;
  }

  stop(): void {
    this.intensity = 0;
    this.offsetX = 0;
    this.offsetY = 0;
  }
}
