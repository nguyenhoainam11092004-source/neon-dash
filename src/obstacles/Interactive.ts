import { GRID } from '@/config/constants';
import type { LevelObject } from '@/types/LevelTypes';
import type { PlayerState } from '@/types/PlayerTypes';
import { Obstacle, type ContactKind, type InteractionResult, type Rect } from './Obstacle';
import { distancePointToRect } from '@/utils/MathUtils';

/**
 * Objects the player passes through rather than lands on or dies to.
 *
 * They share a file because they share a shape of behaviour: overlap the player,
 * return an InteractionResult, and let the collision system apply it. None of
 * them modify the player directly, which keeps every change to the player's
 * velocity in one place.
 */

/** A pad on the floor: bounces the player automatically on contact. */
export class JumpPad extends Obstacle {
  private readonly power: number;

  constructor(data: LevelObject) {
    super(data);
    const configured = data.props?.power;
    this.power = typeof configured === 'number' && configured > 0 ? configured : 1.35;
  }

  override get contactKind(): ContactKind {
    return 'interactive';
  }

  override get baseSize(): { width: number; height: number } {
    // Deliberately shallow: a pad should not block a jump that clears it.
    return { width: GRID.SIZE, height: GRID.SIZE * 0.32 };
  }

  override interact(): InteractionResult {
    return { boost: this.power };
  }
}

/** A ring in the air: bounces the player only while the input is held. */
export class JumpRing extends Obstacle {
  private readonly power: number;

  constructor(data: LevelObject) {
    super(data);
    const configured = data.props?.power;
    this.power = typeof configured === 'number' && configured > 0 ? configured : 1.1;
  }

  override get contactKind(): ContactKind {
    return 'interactive';
  }

  override get baseSize(): { width: number; height: number } {
    return { width: GRID.SIZE, height: GRID.SIZE };
  }

  override overlaps(player: Rect): boolean {
    const radius = (GRID.SIZE * this.scale) / 2;
    return (
      distancePointToRect(this.x, this.y, player.x, player.y, player.width, player.height) <= radius
    );
  }

  override interact(): InteractionResult {
    // requiresInput is what distinguishes a ring from a pad: the player has to
    // ask for the bounce, which is the whole timing challenge.
    return { boost: this.power, requiresInput: true };
  }
}

/** A pickup. Collected once per attempt; progress records which ones. */
export class Collectible extends Obstacle {
  /** Set once collected so it cannot fire twice in the same attempt. */
  private collected = false;

  override get contactKind(): ContactKind {
    return this.collected ? 'none' : 'interactive';
  }

  override get baseSize(): { width: number; height: number } {
    return { width: GRID.SIZE * 0.8, height: GRID.SIZE * 0.8 };
  }

  override interact(state: PlayerState): InteractionResult | null {
    if (this.collected) return null;
    void state;
    this.collected = true;
    return { collect: true };
  }

  get isCollected(): boolean {
    return this.collected;
  }

  override reset(): void {
    super.reset();
    this.collected = false;
  }
}

/** The end of the level. */
export class Finish extends Obstacle {
  override get contactKind(): ContactKind {
    return 'interactive';
  }

  override get baseSize(): { width: number; height: number } {
    // A tall column so the finish cannot be missed by flying over it.
    return { width: GRID.SIZE * 0.5, height: GRID.SIZE * 30 };
  }

  override interact(): InteractionResult {
    return { finish: true };
  }
}

/** A non-interacting visual element: background shapes, level dressing. */
export class Decor extends Obstacle {
  override get contactKind(): ContactKind {
    return 'none';
  }

  override get baseSize(): { width: number; height: number } {
    return { width: GRID.SIZE, height: GRID.SIZE };
  }
}
