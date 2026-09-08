import type { GameModeId } from '@/types/LevelTypes';
import type { InputState, PlayerState } from '@/types/PlayerTypes';

/**
 * Context handed to a game mode on every simulation tick.
 *
 * A mode never reaches into the scene, the level or the renderer: everything it
 * is allowed to know arrives through this object. That is what makes modes
 * swappable mid-level and testable without a running game.
 */
export interface GameModeContext {
  /** Fixed simulation step, in seconds. Always the same value. */
  readonly dt: number;
  /** Horizontal run speed in pixels per second, after the speed multiplier. */
  readonly runSpeed: number;
  /** Base gravity magnitude before the mode's own scaling. */
  readonly gravity: number;
  /** World y of the floor. */
  readonly groundY: number;
  /** World y of the ceiling. */
  readonly ceilingY: number;
  /** Requests a one-shot effect, e.g. a jump puff. The scene decides what to draw. */
  emit(effect: GameModeEffect, payload?: Record<string, number>): void;
}

/** Effects a mode may ask the presentation layer for. */
export type GameModeEffect = 'jump' | 'land' | 'flip' | 'thrust' | 'charge' | 'trail' | 'bounce';

/**
 * One form the player can take.
 *
 * Implementations own movement and rotation only. Collision resolution, death
 * and portals are shared and live outside the mode, so adding a mode cannot
 * introduce a new way to die or a new collision bug.
 */
export interface GameMode {
  readonly id: GameModeId;

  /** Human-readable name, shown by portals and the customisation screen. */
  readonly displayName: string;

  /** True when the mode flies rather than walking on the floor. */
  readonly isFlying: boolean;

  /**
   * True when holding the input does something different from tapping it.
   * The controller uses this to decide whether to buffer taps.
   */
  readonly usesHold: boolean;

  /** Called when a portal switches the player into this mode. */
  enter(state: PlayerState, context: GameModeContext): void;

  /** Called when the player leaves this mode. Clears any mode-specific state. */
  exit(state: PlayerState, context: GameModeContext): void;

  /**
   * Applies input and gravity for one tick, writing to `state.velocity`.
   *
   * Modes must not integrate position: PlayerPhysics does that after every mode
   * has had its say, so movement and collision stay in a fixed, known order.
   */
  update(state: PlayerState, input: InputState, context: GameModeContext): void;

  /**
   * Updates `state.rotation` for the current tick.
   *
   * Rotation is purely cosmetic and is kept separate so it can be skipped
   * entirely when simulating ahead (level validation, replay verification).
   */
  updateRotation(state: PlayerState, context: GameModeContext): void;

  /**
   * Called when the player lands on a solid surface.
   * Returns true when the mode consumed the landing (the ball's roll snap, for
   * instance); false lets the shared handler zero the vertical velocity.
   */
  onLand?(state: PlayerState, context: GameModeContext): boolean;

  /** Called when a jump pad or ring is used, before the impulse is applied. */
  onBoost?(state: PlayerState, power: number, context: GameModeContext): void;
}

/**
 * Shared helper: applies gravity for one tick and clamps the fall speed.
 *
 * Every grounded mode needs exactly this, and duplicating it is how sign errors
 * around inverted gravity get introduced.
 */
export function applyGravity(
  state: PlayerState,
  context: GameModeContext,
  scale: number,
  maxFallSpeed: number,
): void {
  const direction = state.gravity === 'down' ? 1 : -1;
  state.velocity.y += context.gravity * scale * direction * context.dt;

  // "Down" is +y, so an inverted player's terminal velocity is a lower bound.
  if (direction > 0) {
    if (state.velocity.y > maxFallSpeed) state.velocity.y = maxFallSpeed;
  } else if (state.velocity.y < -maxFallSpeed) {
    state.velocity.y = -maxFallSpeed;
  }
}

/** Signed jump velocity for the player's current gravity direction. */
export function jumpVelocity(state: PlayerState, magnitude: number): number {
  // `magnitude` is authored as a negative (upward) number; flip it when inverted.
  return state.gravity === 'down' ? magnitude : -magnitude;
}
