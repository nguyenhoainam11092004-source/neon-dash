import type { LevelObject } from '@/types/LevelTypes';
import { Obstacle, propCells, type ContactKind } from './Obstacle';

/**
 * A solid rectangle. The floor of most levels is made of these.
 *
 * Landing on the top is safe; running into the side is fatal, but that rule
 * lives in the collision resolver rather than here, because it depends on the
 * player's approach direction rather than on the block.
 */
export class Block extends Obstacle {
  private readonly width: number;
  private readonly height: number;

  constructor(data: LevelObject) {
    super(data);
    this.width = propCells(data, 'width', 1);
    this.height = propCells(data, 'height', 1);
  }

  override get contactKind(): ContactKind {
    return 'solid';
  }

  override get baseSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
}
