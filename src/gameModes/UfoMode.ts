import { MODE_TUNING, PHYSICS } from '@/config/constants';
import type { GameModeId } from '@/types/LevelTypes';
import type { InputState, PlayerState } from '@/types/PlayerTypes';
import { applyGravity, jumpVelocity, type GameMode, type GameModeContext } from './GameMode';

/**
 * A flying form that jumps on every tap, in the air as well as on the ground.
 *
 * The UFO is the mirror image of the ship: the ship rewards holding, the UFO
 * rewards rhythm. A short cooldown stops a fast mouse from turning it into
 * continuous thrust, which would collapse the two modes into one.
 */
export class UfoMode implements GameMode {
  readonly id: GameModeId = 'ufo';
  readonly displayName = 'UFO';
  readonly isFlying = true;
  readonly usesHold = false;

  private readonly tuning = MODE_TUNING.ufo;

  enter(state: PlayerState): void {
    state.modeData = { tapCooldown: 0 };
    state.velocity.y *= 0.5;
  }

  exit(state: PlayerState): void {
    state.modeData = {};
    state.rotation = 0;
  }

  update(state: PlayerState, input: InputState, context: GameModeContext): void {
    const cooldown = Math.max(0, (state.modeData.tapCooldown ?? 0) - context.dt);
    state.modeData.tapCooldown = cooldown;

    applyGravity(state, context, this.tuning.gravityScale, PHYSICS.MAX_FALL_SPEED);

    if (input.pressed && cooldown <= 0) {
      state.velocity.y = jumpVelocity(state, this.tuning.jumpVelocity);
      state.grounded = false;
      state.modeData.tapCooldown = this.tuning.tapCooldown;
      context.emit('jump');
    }
  }

  updateRotation(state: PlayerState, context: GameModeContext): void {
    // A gentle bank in the direction of travel; the UFO never tumbles.
    const target = state.velocity.y * 0.012 * (state.gravity === 'down' ? 1 : -1);
    state.rotation += (target - state.rotation) * Math.min(1, context.dt * 10);
  }

  onLand(state: PlayerState, context: GameModeContext): boolean {
    context.emit('land');
    void state;
    return false;
  }

  onBoost(state: PlayerState, power: number, context: GameModeContext): void {
    state.velocity.y = jumpVelocity(state, this.tuning.jumpVelocity * power * 1.4);
    state.grounded = false;
    context.emit('bounce');
  }
}
