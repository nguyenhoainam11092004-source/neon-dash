import type { LevelObject } from '@/types/LevelTypes';
import type { PlayerState } from '@/types/PlayerTypes';
import { Portal, type PortalEffect } from './Portal';

/**
 * Moves the player to another point in the level.
 *
 * Only the vertical position is taken from the destination by default: moving
 * the player backwards or forwards along x would desynchronise them from the
 * music, which is the one thing a rhythm level cannot survive.
 */
export class TeleportPortal extends Portal {
  private readonly targetX: number | undefined;
  private readonly targetY: number;

  constructor(data: LevelObject) {
    super(data);
    const px = data.props?.targetX;
    const py = data.props?.targetY;
    this.targetX = typeof px === 'number' && Number.isFinite(px) ? px : undefined;
    this.targetY = typeof py === 'number' && Number.isFinite(py) ? py : data.y;
  }

  effect(state: PlayerState): PortalEffect | null {
    return {
      teleport: {
        x: this.targetX ?? state.position.x,
        y: this.targetY,
      },
    };
  }
}
