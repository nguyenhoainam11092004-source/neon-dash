import { SPEED, type SpeedTier } from '@/config/constants';
import type { LevelObject } from '@/types/LevelTypes';
import type { PlayerState } from '@/types/PlayerTypes';
import { Portal, type PortalEffect } from './Portal';

/**
 * Changes the auto-run speed.
 *
 * Speed is the level's main pacing control: it decides how much time the player
 * has between obstacles, so it is stored as a named tier rather than a raw
 * multiplier and every level uses the same five values.
 */
export class SpeedPortal extends Portal {
  private readonly tier: SpeedTier;

  constructor(data: LevelObject) {
    super(data);
    const configured = data.props?.speed;
    this.tier =
      typeof configured === 'string' && configured in SPEED.MULTIPLIERS
        ? (configured as SpeedTier)
        : 'normal';
  }

  effect(state: PlayerState): PortalEffect | null {
    if (state.speed === this.tier) return null;
    return { speed: this.tier };
  }

  get speedTier(): SpeedTier {
    return this.tier;
  }
}
