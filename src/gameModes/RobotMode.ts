import { MODE_TUNING, PHYSICS } from '@/config/constants';
import { clamp01, lerp } from '@/utils/MathUtils';
import type { GameModeId } from '@/types/LevelTypes';
import type { InputState, PlayerState } from '@/types/PlayerTypes';
import { applyGravity, jumpVelocity, type GameMode, type GameModeContext } from './GameMode';

/**
 * A grounded form with a variable-height jump.
 *
 * The jump fires on release, or when the charge window fills, so the player
 * chooses their height by how long they hold. Charging is only possible on the
 * ground, which keeps the robot's timing readable.
 */
export class RobotMode implements GameMode {
  readonly id: GameModeId = 'robot';
  readonly displayName = 'Robot';
  readonly isFlying = false;
  readonly usesHold = true;

  private readonly tuning = MODE_TUNING.robot;

  enter(state: PlayerState): void {
    state.modeData = { charge: 0, charging: 0 };
    state.rotation = 0;
  }

  exit(state: PlayerState): void {
    state.modeData = {};
  }

  update(state: PlayerState, input: InputState, context: GameModeContext): void {
    applyGravity(state, context, this.tuning.gravityScale, PHYSICS.MAX_FALL_SPEED);

    const charging = (state.modeData.charging ?? 0) > 0;
    const charge = state.modeData.charge ?? 0;
    const canStart = state.grounded || state.timeSinceGrounded <= PHYSICS.COYOTE_TIME;

    if (!charging && input.pressed && canStart) {
      state.modeData.charging = 1;
      state.modeData.charge = 0;
      context.emit('charge');
      return;
    }

    if (!charging) return;

    const nextCharge = charge + context.dt;
    state.modeData.charge = nextCharge;

    // Fire on release, or automatically once the window is full so a held input
    // does not silently forfeit the jump.
    const full = nextCharge >= this.tuning.maxChargeTime;
    if (input.released || !input.held || full) {
      this.launch(state, context, nextCharge);
    }
  }

  private launch(state: PlayerState, context: GameModeContext, charge: number): void {
    const t = clamp01(charge / this.tuning.maxChargeTime);
    const magnitude = lerp(this.tuning.minJumpVelocity, this.tuning.maxJumpVelocity, t);

    state.velocity.y = jumpVelocity(state, magnitude);
    state.grounded = false;
    state.timeSinceGrounded = Number.POSITIVE_INFINITY;
    state.modeData.charging = 0;
    state.modeData.charge = 0;
    context.emit('jump', { power: t });
  }

  updateRotation(state: PlayerState, context: GameModeContext): void {
    // The robot stays upright; it crouches instead, which the visual reads from
    // modeData.charge rather than from the rotation.
    state.rotation += (0 - state.rotation) * Math.min(1, context.dt * 16);
  }

  onLand(state: PlayerState, context: GameModeContext): boolean {
    state.modeData.charging = 0;
    state.modeData.charge = 0;
    context.emit('land');
    return false;
  }

  onBoost(state: PlayerState, power: number, context: GameModeContext): void {
    state.velocity.y = jumpVelocity(state, this.tuning.maxJumpVelocity * power);
    state.grounded = false;
    context.emit('bounce');
  }
}
