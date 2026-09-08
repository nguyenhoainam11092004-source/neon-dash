import { GRID } from '@/config/constants';
import { distancePointToRect } from '@/utils/MathUtils';
import type { LevelObject } from '@/types/LevelTypes';
import { Obstacle, type ContactKind, type Rect } from './Obstacle';

/**
 * A spinning lethal disc.
 *
 * Collision is a circle, which is both correct for the shape and cheaper than a
 * rotated box. The visible teeth are excluded from the radius for the same
 * reason spikes are inset: the player should die when they hit the blade, not
 * when they graze the space a tooth is passing through.
 */
export class Saw extends Obstacle {
  /** Collision radius as a fraction of the drawn disc. */
  private static readonly RADIUS_SCALE = 0.78;

  private readonly spinSpeed: number;

  constructor(data: LevelObject) {
    super(data);
    const configured = data.props?.spinSpeed;
    this.spinSpeed =
      typeof configured === 'number' && Number.isFinite(configured) ? configured : 1.4;
  }

  override get contactKind(): ContactKind {
    return 'lethal';
  }

  override get baseSize(): { width: number; height: number } {
    return { width: GRID.SIZE * 1.5, height: GRID.SIZE * 1.5 };
  }

  /** Collision radius in world units. */
  get radius(): number {
    return (GRID.SIZE * 1.5 * this.scale * Saw.RADIUS_SCALE) / 2;
  }

  override overlaps(player: Rect): boolean {
    // Closest-point distance handles every case, including the player fully
    // inside the blade, with one square root.
    return (
      distancePointToRect(this.x, this.y, player.x, player.y, player.width, player.height) <=
      this.radius
    );
  }

  override update(dt: number): void {
    // Rotation is cosmetic: a circle's collision does not depend on its angle,
    // so the spin can be skipped entirely in a headless simulation.
    this.rotation += this.spinSpeed * 360 * dt;
    if (this.rotation > 360) this.rotation -= 360;
    else if (this.rotation < -360) this.rotation += 360;
  }
}
