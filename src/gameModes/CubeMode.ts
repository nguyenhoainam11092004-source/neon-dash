import { MODE_TUNING, PHYSICS } from '@/config/constants';
import type { GameModeId } from '@/types/LevelTypes';
import type { InputState, PlayerState } from '@/types/PlayerTypes';
import { applyGravity, jumpVelocity, type GameMode, type GameModeContext } from './GameMode';

/**
 * The default form: runs on the ground and jumps on a tap.
 *
 * Coyote time and input buffering are handled here rather than in the
 * controller because they are a property of *this* mode's feel; the ship, for
 * example, wants neither.
 */
export class CubeMode implements GameMode {
  readonly id: GameModeId = 'cube';
  readonly displayName = 'Cube';
  readonly isFlying = false;
  readonly usesHold = false;

  private readonly tuning = MODE_TUNING.cube;

  enter(state: PlayerState): void {
    state.modeData = {};
    // Snap the visual to an upright quarter turn so the mode change does not
    // start mid-tumble.
    state.rotation = Math.round(state.rotation / 90) * 90;
  }

  exit(state: PlayerState): void {
    state.modeData = {};
  }

  update(state: PlayerState, input: InputState, context: GameModeContext): void {
    applyGravity(state, context, this.tuning.gravityScale, PHYSICS.MAX_FALL_SPEED);

    // A jump counts when the player is on the ground, or left it very recently
    // (coyote time), and pressed within the buffer window. Both windows are what
    // stop a correctly timed input feeling like it was dropped.
    const canJump = state.grounded || state.timeSinceGrounded <= PHYSICS.COYOTE_TIME;
    const wantsJump = input.pressed || state.timeSincePressed <= PHYSICS.JUMP_BUFFER;

    if (canJump && wantsJump && input.held) {
      this.jump(state, context);
    }
  }

  private jump(state: PlayerState, context: GameModeContext): void {
    state.velocity.y = jumpVelocity(state, this.tuning.jumpVelocity);
    state.grounded = false;
    // Consume both windows so one press cannot produce two jumps.
    state.timeSinceGrounded = Number.POSITIVE_INFINITY;
    state.timeSincePressed = Number.POSITIVE_INFINITY;
    context.emit('jump');
  }

  updateRotation(state: PlayerState, context: GameModeContext): void {
    if (state.grounded) {
      // Settle onto the nearest quarter turn so the cube always lands flat.
      const target = Math.round(state.rotation / 90) * 90;
      const diff = target - state.rotation;
      state.rotation += diff * Math.min(1, context.dt * 22);
      if (Math.abs(diff) < 0.4) state.rotation = target;
      return;
    }

    const direction = state.gravity === 'down' ? 1 : -1;
    state.rotation += this.tuning.airRotationSpeed * direction * context.dt;
  }

  onLand(state: PlayerState, context: GameModeContext): boolean {
    context.emit('land');
    // Let the shared handler zero the velocity; the cube has nothing extra to do.
    void state;
    return false;
  }

  onBoost(state: PlayerState, power: number, context: GameModeContext): void {
    state.velocity.y = jumpVelocity(state, this.tuning.jumpVelocity * power);
    state.grounded = false;
    context.emit('bounce');
  }
}
