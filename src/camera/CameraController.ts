import Phaser from 'phaser';
import { CAMERA, VIEW } from '@/config/constants';
import type { EasingName } from '@/types/LevelTypes';
import { clamp, damp, getEasing } from '@/utils/MathUtils';

export interface CameraBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface Tweened {
  active: boolean;
  from: number;
  to: number;
  elapsed: number;
  duration: number;
  easing: EasingName;
}

function idleTween(value: number): Tweened {
  return { active: false, from: value, to: value, elapsed: 0, duration: 0, easing: 'linear' };
}

/**
 * Drives the gameplay camera.
 *
 * The camera has two jobs that pull in different directions: keep the player
 * visible with enough room to read what is coming, and stay still enough that
 * the level does not appear to swim. It solves that with an asymmetric follow —
 * tight horizontally, loose vertically, with a dead zone — plus trigger-driven
 * overrides that temporarily take control.
 */
export class CameraController {
  private readonly camera: Phaser.Cameras.Scene2D.Camera;

  /** Where the camera is trying to be, before smoothing. */
  private targetX = 0;
  private targetY = 0;

  /** Manual offsets a camera trigger has applied. */
  private offsetX = 0;
  private offsetY = 0;

  private bounds: CameraBounds | null = null;
  private followEnabled = true;

  /** Screen shake, decaying toward zero. */
  private shakeIntensity = 0;
  private shakeDuration = 0;
  private shakeElapsed = 0;
  private shakeScale = 1;

  /** Current camera angle in degrees; Camera only exposes setters, not a getter. */
  private currentAngle = 0;

  private zoomTween: Tweened;
  private rotationTween: Tweened;
  private panXTween: Tweened;
  private panYTween: Tweened;

  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    this.camera = camera;
    this.camera.setZoom(CAMERA.DEFAULT_ZOOM);
    this.zoomTween = idleTween(CAMERA.DEFAULT_ZOOM);
    this.rotationTween = idleTween(0);
    this.panXTween = idleTween(0);
    this.panYTween = idleTween(0);
  }

  /** Scales screen shake; 0 disables it, for the accessibility setting. */
  setShakeScale(scale: number): void {
    this.shakeScale = clamp(scale, 0, 2);
  }

  setBounds(bounds: CameraBounds | null): void {
    this.bounds = bounds;
  }

  setFollowEnabled(enabled: boolean): void {
    this.followEnabled = enabled;
  }

  /** Places the camera immediately, with no smoothing. Used on respawn. */
  snapTo(x: number, y: number): void {
    this.targetX = x - VIEW.WIDTH * CAMERA.FOLLOW_X;
    this.targetY = y - VIEW.HEIGHT / 2;
    this.applyBounds();
    this.camera.setScroll(this.targetX, this.targetY);
  }

  /**
   * Advances the camera for one frame.
   *
   * Horizontal follow is nearly rigid because the player's x is entirely
   * predictable — they always run right at a known speed — so any lag there
   * just costs the player reaction time. Vertical follow is loose and has a dead
   * zone, because the player's y changes constantly and a tight follow would
   * make every jump shake the screen.
   */
  update(dt: number, playerX: number, playerY: number): void {
    this.advanceTweens(dt);

    if (this.followEnabled) {
      this.targetX = playerX - VIEW.WIDTH * CAMERA.FOLLOW_X;

      const centreY = this.camera.scrollY + VIEW.HEIGHT / 2;
      const deltaY = playerY - centreY;
      const halfZone = CAMERA.DEADZONE_HEIGHT / 2;

      // Only chase the player once they leave the dead zone, and then only far
      // enough to put them back at its edge.
      if (Math.abs(deltaY) > halfZone) {
        const excess = deltaY > 0 ? deltaY - halfZone : deltaY + halfZone;
        this.targetY = this.camera.scrollY + excess;
      }
    }

    this.applyBounds();

    const nextX = damp(this.camera.scrollX, this.targetX + this.offsetX, CAMERA.LERP_X, dt);
    const nextY = damp(this.camera.scrollY, this.targetY + this.offsetY, CAMERA.LERP_Y, dt);
    this.camera.setScroll(nextX, nextY);

    this.updateShake(dt);
  }

  private applyBounds(): void {
    if (!this.bounds) return;
    const viewWidth = VIEW.WIDTH / this.camera.zoom;
    const viewHeight = VIEW.HEIGHT / this.camera.zoom;

    this.targetX = clamp(
      this.targetX,
      this.bounds.minX,
      Math.max(this.bounds.minX, this.bounds.maxX - viewWidth),
    );
    this.targetY = clamp(
      this.targetY,
      this.bounds.minY,
      Math.max(this.bounds.minY, this.bounds.maxY - viewHeight),
    );
  }

  private advanceTweens(dt: number): void {
    if (this.zoomTween.active) {
      this.camera.setZoom(CameraController.step(this.zoomTween, dt));
    }
    if (this.rotationTween.active) {
      this.currentAngle = CameraController.step(this.rotationTween, dt);
      this.camera.setAngle(this.currentAngle);
    }
    if (this.panXTween.active) {
      this.offsetX = CameraController.step(this.panXTween, dt);
    }
    if (this.panYTween.active) {
      this.offsetY = CameraController.step(this.panYTween, dt);
    }
  }

  /** Advances one tween and returns its current value. */
  private static step(tween: Tweened, dt: number): number {
    tween.elapsed += dt;
    const raw = tween.duration <= 0 ? 1 : Math.min(1, tween.elapsed / tween.duration);
    const t = getEasing(tween.easing)(raw);
    if (raw >= 1) tween.active = false;
    return tween.from + (tween.to - tween.from) * t;
  }

  private updateShake(dt: number): void {
    if (this.shakeIntensity <= 0) return;

    this.shakeElapsed += dt;
    if (this.shakeElapsed >= this.shakeDuration) {
      this.shakeIntensity = 0;
      // Clearing the offset matters: leaving the last random nudge in place
      // would permanently bias the camera by a few pixels every shake.
      this.camera.setScroll(this.camera.scrollX, this.camera.scrollY);
      return;
    }

    // Decay so the shake tapers rather than stopping abruptly.
    const remaining = 1 - this.shakeElapsed / this.shakeDuration;
    const amount = this.shakeIntensity * remaining * remaining * this.shakeScale;

    this.camera.setScroll(
      this.camera.scrollX + (Math.random() * 2 - 1) * amount,
      this.camera.scrollY + (Math.random() * 2 - 1) * amount,
    );
  }

  // ---------- Trigger-facing API ----------

  shake(intensity: number, duration: number): void {
    if (this.shakeScale <= 0) return;
    // A stronger shake replaces a weaker one rather than adding to it, so a
    // burst of small shakes cannot stack into something unplayable.
    if (intensity >= this.shakeIntensity) {
      this.shakeIntensity = intensity;
      this.shakeDuration = Math.max(0.05, duration);
      this.shakeElapsed = 0;
    }
  }

  zoomTo(zoom: number, duration: number, easing: EasingName = 'easeInOut'): void {
    this.zoomTween = {
      active: true,
      from: this.camera.zoom,
      to: clamp(zoom, CAMERA.MIN_ZOOM, CAMERA.MAX_ZOOM),
      elapsed: 0,
      duration,
      easing,
    };
  }

  rotateTo(degrees: number, duration: number, easing: EasingName = 'easeInOut'): void {
    this.rotationTween = {
      active: true,
      from: this.currentAngle,
      to: degrees,
      elapsed: 0,
      duration,
      easing,
    };
  }

  /** Offsets the camera from its follow target, in world units. */
  panTo(x: number, y: number, duration: number, easing: EasingName = 'easeInOut'): void {
    this.panXTween = { active: true, from: this.offsetX, to: x, elapsed: 0, duration, easing };
    this.panYTween = { active: true, from: this.offsetY, to: y, elapsed: 0, duration, easing };
  }

  /** Cancels every override and returns to plain following. */
  resetOverrides(): void {
    this.offsetX = 0;
    this.offsetY = 0;
    this.shakeIntensity = 0;
    this.camera.setZoom(CAMERA.DEFAULT_ZOOM);
    this.currentAngle = 0;
    this.camera.setAngle(0);
    this.zoomTween = idleTween(CAMERA.DEFAULT_ZOOM);
    this.rotationTween = idleTween(0);
    this.panXTween = idleTween(0);
    this.panYTween = idleTween(0);
    this.followEnabled = true;
  }

  get zoom(): number {
    return this.camera.zoom;
  }

  get scrollX(): number {
    return this.camera.scrollX;
  }

  get scrollY(): number {
    return this.camera.scrollY;
  }
}
