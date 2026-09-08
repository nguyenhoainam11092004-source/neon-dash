import { GRID } from '@/config/constants';
import { degToRad, pointInTriangle } from '@/utils/MathUtils';
import type { LevelObject } from '@/types/LevelTypes';
import { Obstacle, type ContactKind, type Rect } from './Obstacle';

/**
 * A lethal triangle.
 *
 * The exact test is a real triangle rather than the drawn shape's bounding box.
 * That matters: a box would kill the player while they are still visibly clear
 * of the point, which in a game this precise reads as a bug rather than as
 * difficulty.
 */
export class Spike extends Obstacle {
  /** Fraction of the full triangle used for collision, inset from the artwork. */
  private static readonly FORGIVENESS = 0.72;

  constructor(data: LevelObject) {
    super(data);
  }

  override get contactKind(): ContactKind {
    return 'lethal';
  }

  override get baseSize(): { width: number; height: number } {
    return { width: GRID.SIZE, height: GRID.SIZE };
  }

  /**
   * The three corners of the collision triangle in world space, rotated about
   * the spike's centre.
   */
  private corners(): [number, number][] {
    const size = GRID.SIZE * this.scale * Spike.FORGIVENESS;
    const half = size / 2;

    // Local space, apex up: the artwork points along -y before rotation.
    const local: [number, number][] = [
      [0, -half],
      [half, half],
      [-half, half],
    ];

    const angle = degToRad(this.rotation);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return local.map(([lx, ly]) => [
      this.x + lx * cos - ly * sin,
      this.y + lx * sin + ly * cos,
    ]) as [number, number][];
  }

  override overlaps(player: Rect): boolean {
    // Broad phase first: most spikes on screen are nowhere near the player.
    const b = this.bounds;
    if (
      player.x >= b.x + b.width ||
      player.x + player.width <= b.x ||
      player.y >= b.y + b.height ||
      player.y + player.height <= b.y
    ) {
      return false;
    }

    const [a, c, d] = this.corners();
    if (!a || !c || !d) return false;

    // Test the player's corners and centre against the triangle. A full
    // separating-axis test would be exact, but the player is a small square and
    // five samples is both cheaper and, at this size, indistinguishable.
    const px = player.x;
    const py = player.y;
    const pw = player.width;
    const ph = player.height;

    const samples: [number, number][] = [
      [px, py],
      [px + pw, py],
      [px, py + ph],
      [px + pw, py + ph],
      [px + pw / 2, py + ph / 2],
    ];

    for (const [sx, sy] of samples) {
      if (pointInTriangle(sx, sy, a[0], a[1], c[0], c[1], d[0], d[1])) return true;
    }

    // The reverse case: a small spike entirely inside the player's box.
    for (const [cx, cy] of [a, c, d]) {
      if (cx >= px && cx <= px + pw && cy >= py && cy <= py + ph) return true;
    }

    return false;
  }
}
