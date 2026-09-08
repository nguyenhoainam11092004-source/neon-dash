import { MODE_TUNING } from '@/config/constants';
import type { GameModeId } from '@/types/LevelTypes';
import type { InputState, PlayerState } from '@/types/PlayerTypes';
import { applyGravity, type GameMode, type GameModeContext } from './GameMode';

/**
 * A flying form that inverts gravity on every tap, mid-air included.
 *
 * Where the ball may only flip while touching a surface, the swing flips
 * whenever it likes and then coasts, so its levels are about spacing between
 * two hazards rather than about ground contact.
 */
export class SwingMode implements GameMode {
  readonly id: GameModeId = 'swing';
  readonly displayName = 'Swing';
  readonly isFlying = true;
  readonly usesHold = false;

  private readonly tuning = MODE_TUNING.swing;

  enter(state: PlayerState): void {
    state.modeData = { flipCooldown: 0 };
    state.velocity.y *= 0.6;
  }

  exit(state: PlayerState): void {
    state.modeData = {};
    state.rotation = 0;
  }

  update(state: PlayerState, input: InputState, context: GameModeContext): void {
    const cooldown = Math.max(0, (state.modeData.flipCooldown ?? 0) - context.dt);
    state.modeData.flipCooldown = cooldown;

    applyGravity(state, context, this.tuning.gravityScale, this.tuning.maxFallSpeed);

    if (input.pressed && cooldown <= 0) {
      state.gravity = state.gravity === 'down' ? 'up' : 'down';
      state.modeData.flipCooldown = this.tuning.flipCooldown;
      // Shed some speed on the flip so the arc reverses promptly instead of
      // drifting on for another half second.
      state.velocity.y *= 0.35;
      context.emit('flip');
    }
  }

  updateRotation(state: PlayerState, context: GameModeContext): void {
    const target = state.gravity === 'down' ? 0 : 180;
    let diff = target - state.rotation;
    // Take the short way round so a flip never spins the wrong direction.
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    state.rotation += diff * Math.min(1, context.dt * 14);
  }

  onLand(state: PlayerState, context: GameModeContext): boolean {
    context.emit('land');
    void state;
    return false;
  }

  onBoost(state: PlayerState, power: number, context: GameModeContext): void {
    const direction = state.gravity === 'down' ? -1 : 1;
    state.velocity.y = 900 * power * direction;
    context.emit('bounce');
  }
}
