import type { LevelObject } from '@/types/LevelTypes';
import type { PlayerState } from '@/types/PlayerTypes';
import { Portal, type PortalEffect } from './Portal';

/**
 * Flips which way "down" is.
 *
 * A portal configured with an explicit direction sets it absolutely, which is
 * what a level author almost always wants: passing through the same portal
 * twice should give the same result, not toggle.
 */
export class GravityPortal extends Portal {
  private readonly direction: PlayerState['gravity'] | 'toggle';

  constructor(data: LevelObject) {
    super(data);
    const configured = data.props?.gravity;
    this.direction = configured === 'up' || configured === 'down' ? configured : 'toggle';
  }

  effect(state: PlayerState): PortalEffect | null {
    const next =
      this.direction === 'toggle' ? (state.gravity === 'down' ? 'up' : 'down') : this.direction;

    // Entering a portal that matches the current state should not restart the
    // player's fall, so decline rather than reapply.
    if (next === state.gravity) return null;
    return { gravity: next };
  }
}
