import type { LevelObject } from '@/types/LevelTypes';
import { Obstacle, propCells, type ContactKind } from './Obstacle';

/**
 * A solid strip that a trigger can move.
 *
 * Mechanically identical to a Block; it exists as its own type so the editor can
 * offer a wide, thin default and so level authors can see at a glance which
 * surfaces are meant to be animated.
 */
export class Platform extends Obstacle {
  private readonly width: number;
  private readonly height: number;

  constructor(data: LevelObject) {
    super(data);
    this.width = propCells(data, 'width', 4);
    this.height = propCells(data, 'height', 0.5);
  }

  override get contactKind(): ContactKind {
    return 'solid';
  }

  override get baseSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
}
