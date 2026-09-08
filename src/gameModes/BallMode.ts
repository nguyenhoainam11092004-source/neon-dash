import { MODE_TUNING, PHYSICS } from '@/config/constants';
import type { GameModeId } from '@/types/LevelTypes';
import type { InputState, PlayerState } from '@/types/PlayerTypes';
import { applyGravity, type GameMode, type GameModeContext } from './GameMode';

/**
 * A rolling form that inverts gravity on each tap instead of jumping.
 *
 * The tap only registers while grounded, so the ball cannot flip mid-air; that
 * restriction is what makes its levels about reading the floor and ceiling
 * ahead rather than about airtime.
 */
export class BallMode implements GameMode {
  readonly id: GameModeId = 'ball';
  readonly displayName = 'Ball';
  readonly isFlying = false;
  readonly usesHold = false;

  private readonly tuning = MODE_TUNING.ball;

  enter(state: PlayerState): void {
    state.modeData = { flipCooldown: 0 };
  }

  exit(state: PlayerState): void {
    state.modeData = {};
  }

  update(state: PlayerState, input: InputState, context: GameModeContext): void {
    const cooldown = Math.max(0, (state.modeData.flipCooldown ?? 0) - context.dt);
    state.modeData.flipCooldown = cooldown;

    applyGravity(state, context, this.tuning.gravityScale, PHYSICS.MAX_FALL_SPEED);

    const canFlip =
      (state.grounded || state.timeSinceGrounded <= PHYSICS.COYOTE_TIME) && cooldown <= 0;
    const wantsFlip = input.pressed || state.timeSincePressed <= PHYSICS.JUMP_BUFFER;

    if (canFlip && wantsFlip && input.held) {
      state.gravity = state.gravity === 'down' ? 'up' : 'down';
      // A small push off the surface stops the ball sticking to the floor it
      // just left when the flip happens on a tight ceiling.
      state.velocity.y = state.gravity === 'down' ? 60 : -60;
      state.grounded = false;
      state.timeSinceGrounded = Number.POSITIVE_INFINITY;
      state.timeSincePressed = Number.POSITIVE_INFINITY;
      state.modeData.flipCooldown = this.tuning.flipCooldown;
      context.emit('flip');
    }
  }

  updateRotation(state: PlayerState, context: GameModeContext): void {
    // The ball rolls in the direction of travel, and travel is always forward.
    state.rotation += this.tuning.rollRotationSpeed * context.dt;
  }

  onLand(state: PlayerState, context: GameModeContext): boolean {
    context.emit('land');
    void state;
    return false;
  }

  onBoost(state: PlayerState, power: number, context: GameModeContext): void {
    const direction = state.gravity === 'down' ? -1 : 1;
    state.velocity.y = 820 * power * direction;
    state.grounded = false;
    context.emit('bounce');
  }
}
