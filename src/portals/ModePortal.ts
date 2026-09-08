import { GAME_MODES, type GameModeId, type LevelObject } from '@/types/LevelTypes';
import type { PlayerState } from '@/types/PlayerTypes';
import { Portal, type PortalEffect } from './Portal';

/**
 * Switches the player between the seven forms.
 *
 * A mode portal may also set the mini flag, because the two are almost always
 * authored together and a level that changes both wants them applied on the
 * same tick rather than needing two overlapping portals.
 */
export class ModePortal extends Portal {
  private readonly mode: GameModeId;
  private readonly mini: boolean | undefined;

  constructor(data: LevelObject) {
    super(data);
    const configured = data.props?.mode;
    this.mode =
      typeof configured === 'string' && (GAME_MODES as readonly string[]).includes(configured)
        ? (configured as GameModeId)
        : 'cube';
    this.mini = typeof data.props?.mini === 'boolean' ? data.props.mini : undefined;
  }

  effect(state: PlayerState): PortalEffect | null {
    const modeChanged = state.mode !== this.mode;
    const miniChanged = this.mini !== undefined && state.mini !== this.mini;
    if (!modeChanged && !miniChanged) return null;

    const result: PortalEffect = {};
    if (modeChanged) result.mode = this.mode;
    if (miniChanged) result.mini = this.mini;
    return result;
  }

  get targetMode(): GameModeId {
    return this.mode;
  }
}
