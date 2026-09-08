import { GRID } from '@/config/constants';
import { Obstacle, type ContactKind } from '@/obstacles/Obstacle';
import type { LevelObject } from '@/types/LevelTypes';
import type { PlayerState } from '@/types/PlayerTypes';

/**
 * What a portal does to the player when entered.
 *
 * Portals return a description of the change rather than applying it, for the
 * same reason obstacles do: every mutation of the player's state goes through
 * one code path, so a mode switch and a gravity flip cannot get out of order.
 */
export interface PortalEffect {
  mode?: PlayerState['mode'];
  gravity?: PlayerState['gravity'];
  speed?: PlayerState['speed'];
  /** Absolute world position to move the player to. */
  teleport?: { x: number; y: number };
  /** Switches the player to the half-size collider. */
  mini?: boolean;
}

/**
 * Base class for every portal.
 *
 * Portals are obstacles with a contact kind of 'interactive' that never block
 * movement, so they inherit the broad-phase indexing and the reset behaviour
 * without needing their own.
 */
export abstract class Portal extends Obstacle {
  /** True once entered in this attempt; portals fire at most once. */
  protected triggered = false;

  constructor(data: LevelObject) {
    super(data);
  }

  override get contactKind(): ContactKind {
    return this.triggered ? 'none' : 'interactive';
  }

  override get baseSize(): { width: number; height: number } {
    // Portals are tall so they cannot be jumped over by accident; that would
    // leave the player in a mode the level was not designed around.
    return { width: GRID.SIZE * 0.75, height: GRID.SIZE * 3 };
  }

  /** The change to apply, or null when the portal declines to fire. */
  abstract effect(state: PlayerState): PortalEffect | null;

  /** Called by the collision system after the effect has been applied. */
  markTriggered(): void {
    this.triggered = true;
  }

  get hasTriggered(): boolean {
    return this.triggered;
  }

  override reset(): void {
    super.reset();
    this.triggered = false;
  }
}
