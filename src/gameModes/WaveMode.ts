import { MODE_TUNING } from '@/config/constants';
import type { GameModeId } from '@/types/LevelTypes';
import type { InputState, PlayerState } from '@/types/PlayerTypes';
import type { GameMode, GameModeContext } from './GameMode';

/**
 * A dart that ignores gravity and moves on a fixed diagonal.
 *
 * Holding sends it up, releasing sends it down, always at the same slope. There
 * is no acceleration at all, which is what makes the wave the most precise mode
 * in the game: position is a direct integral of the input history.
 */
export class WaveMode implements GameMode {
  readonly id: GameModeId = 'wave';
  readonly displayName = 'Wave';
  readonly isFlying = true;
  readonly usesHold = true;

  private readonly tuning = MODE_TUNING.wave;

  enter(state: PlayerState): void {
    state.modeData = {};
    // Any inherited vertical speed would break the fixed-slope contract.
    state.velocity.y = 0;
  }

  exit(state: PlayerState): void {
    state.modeData = {};
    state.rotation = 0;
  }

  update(state: PlayerState, input: InputState, context: GameModeContext): void {
    const direction = state.gravity === 'down' ? 1 : -1;
    const vertical = context.runSpeed * this.tuning.slope;
    // Velocity is set outright, never accumulated: the wave has no inertia.
    state.velocity.y = input.held ? -vertical * direction : vertical * direction;
    if (input.held) context.emit('trail');
  }

  updateRotation(state: PlayerState): void {
    // The dart points exactly along its travel direction, so the angle is fixed
    // at +/- 45 degrees for a slope of 1.
    const slopeAngle = Math.atan2(state.velocity.y, Math.abs(state.velocity.x) || 1);
    state.rotation = (slopeAngle * 180) / Math.PI;
  }

  onLand(state: PlayerState, context: GameModeContext): boolean {
    // The wave dies on contact rather than landing; the collision system decides
    // that. Returning true stops the shared handler zeroing velocity first.
    void state;
    void context;
    return true;
  }
}
