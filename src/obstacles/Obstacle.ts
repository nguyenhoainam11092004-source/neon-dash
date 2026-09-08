import { GRID } from '@/config/constants';
import type { LevelObject, LevelObjectType } from '@/types/LevelTypes';
import type { PlayerState } from '@/types/PlayerTypes';

/** Axis-aligned rectangle in world space. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * What contact with an object means.
 *
 * The collision system reads this instead of asking what type an object is, so
 * a new obstacle type never requires a new branch in the resolver.
 */
export type ContactKind =
  /** Blocks movement and can be landed on. */
  | 'solid'
  /** Kills on contact. */
  | 'lethal'
  /** Fires an effect and is consumed or passed through. */
  | 'interactive'
  /** Purely decorative; never tested. */
  | 'none';

/** The outcome an interactive object requests when the player overlaps it. */
export interface InteractionResult {
  /** Bounce the player with this multiplier, applied through the game mode. */
  boost?: number;
  /** Collect this object; the id is recorded against the level's progress. */
  collect?: boolean;
  /** Finish the level. */
  finish?: boolean;
  /** Only fires while the jump input is held, e.g. a ring rather than a pad. */
  requiresInput?: boolean;
}

/**
 * A placed level object, in the form the simulation understands.
 *
 * Obstacles are deliberately free of Phaser types: the same instances are used
 * by the headless validator and by the editor's preview, neither of which has a
 * scene. Rendering is attached separately by the object factory.
 */
export abstract class Obstacle {
  readonly id: string;
  readonly type: LevelObjectType;
  readonly data: LevelObject;

  /** Groups this object belongs to, for group-addressed triggers. */
  readonly groups: readonly number[];

  /** World position of the object's centre. Triggers may move this. */
  x: number;
  y: number;
  rotation: number;
  scale: number;

  /** False while a toggle trigger has this object switched off. */
  active = true;

  constructor(data: LevelObject) {
    this.id = data.id;
    this.type = data.type;
    this.data = data;
    this.x = data.x;
    this.y = data.y;
    this.rotation = data.rotation;
    this.scale = data.scale;
    this.groups = data.groups ?? [];
  }

  abstract get contactKind(): ContactKind;

  /** Unrotated size in world pixels, before `scale`. */
  abstract get baseSize(): { width: number; height: number };

  /**
   * The broad-phase box: always axis-aligned and always large enough to contain
   * the object at its current rotation. Cheap, and only ever used to decide
   * whether the exact test below is worth running.
   */
  get bounds(): Rect {
    const size = this.baseSize;
    // A rotated rectangle's AABB grows; using the diagonal avoids recomputing
    // trigonometry for every object every frame.
    const inflate = this.rotation % 90 === 0 ? 1 : Math.SQRT2;
    const width = size.width * this.scale * inflate;
    const height = size.height * this.scale * inflate;
    return { x: this.x - width / 2, y: this.y - height / 2, width, height };
  }

  /**
   * Exact overlap test against the player's box.
   *
   * The default is the broad-phase box, which is correct for anything
   * rectangular and axis-aligned; spikes and saws override it.
   */
  overlaps(player: Rect): boolean {
    const b = this.bounds;
    return (
      player.x < b.x + b.width &&
      player.x + player.width > b.x &&
      player.y < b.y + b.height &&
      player.y + player.height > b.y
    );
  }

  /** Called when an interactive object is overlapped. */
  interact(_state: PlayerState): InteractionResult | null {
    return null;
  }

  /** Advances any self-animation, e.g. a saw's spin. */
  update(_dt: number, _songTime: number): void {
    /* most obstacles are static */
  }

  /** Restores the object to its authored state for a new attempt. */
  reset(): void {
    this.x = this.data.x;
    this.y = this.data.y;
    this.rotation = this.data.rotation;
    this.scale = this.data.scale;
    this.active = true;
  }
}

/** Reads a size in grid cells from an object's props, with a default. */
export function propCells(data: LevelObject, key: 'width' | 'height', fallback = 1): number {
  const value = data.props?.[key];
  const cells = typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
  return cells * GRID.SIZE;
}
