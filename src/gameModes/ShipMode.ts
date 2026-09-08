import { MODE_TUNING } from '@/config/constants';
import { clamp, mapRange } from '@/utils/MathUtils';
import type { GameModeId } from '@/types/LevelTypes';
import type { InputState, PlayerState } from '@/types/PlayerTypes';
import { applyGravity, type GameMode, type GameModeContext } from './GameMode';

/**
 * A flying form: holding the input applies continuous upward thrust.
 *
 * Unlike the cube there is no discrete jump, so the ship reads the *held* flag
 * every tick and ignores presses entirely. Its nose pitches with vertical
 * velocity, which is the main readability cue for how hard the player is
 * climbing.
 */
export class ShipMode implements GameMode {
  readonly id: GameModeId = 'ship';
  readonly displayName = 'Ship';
  readonly isFlying = true;
  readonly usesHold = true;

  private readonly tuning = MODE_TUNING.ship;

  enter(state: PlayerState): void {
    state.modeData = {};
    // Entering flight from a fall would otherwise carry a huge downward speed
    // into a mode with much weaker gravity, which feels like a dropped input.
    state.velocity.y *= 0.4;
  }

  exit(state: PlayerState): void {
    state.modeData = {};
    state.rotation = 0;
  }

  update(state: PlayerState, input: InputState, context: GameModeContext): void {
    applyGravity(state, context, this.tuning.gravityScale, this.tuning.maxFallSpeed);

    if (input.held) {
      const direction = state.gravity === 'down' ? 1 : -1;
      state.velocity.y += this.tuning.thrust * direction * context.dt;
      context.emit('thrust');
    }

    // Clamp both directions so the ship stays controllable regardless of how
    // long the input has been held.
    const rise = this.tuning.maxRiseSpeed;
    const fall = this.tuning.maxFallSpeed;
    state.velocity.y =
      state.gravity === 'down'
        ? clamp(state.velocity.y, rise, fall)
        : clamp(state.velocity.y, -fall, -rise);
  }

  updateRotation(state: PlayerState, context: GameModeContext): void {
    const range = this.tuning.maxFallSpeed;
    const pitch = mapRange(
      clamp(state.velocity.y, -range, range),
      -range,
      range,
      -this.tuning.maxPitch,
      this.tuning.maxPitch,
    );
    const target = state.gravity === 'down' ? pitch : -pitch;
    // Ease toward the target so the nose does not snap on a sudden collision.
    state.rotation += (target - state.rotation) * Math.min(1, context.dt * 12);
  }

  onLand(state: PlayerState, context: GameModeContext): boolean {
    context.emit('land');
    void state;
    return false;
  }

  onBoost(state: PlayerState, power: number, context: GameModeContext): void {
    const direction = state.gravity === 'down' ? 1 : -1;
    state.velocity.y = this.tuning.maxRiseSpeed * power * direction;
    context.emit('bounce');
  }
}
