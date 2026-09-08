import { PHYSICS } from '@/config/constants';
import type { GameModeId, GravityDirection } from '@/types/LevelTypes';
import type { PlayerState } from '@/types/PlayerTypes';
import type { SpeedTier } from '@/config/constants';

/**
 * Construction, copying and inspection of the player's simulation state.
 *
 * PlayerState is plain data (see types/PlayerTypes). These helpers are the only
 * place that knows how to build a valid one, so a checkpoint restore and a fresh
 * spawn cannot drift apart.
 */

export interface SpawnOptions {
  x: number;
  y: number;
  mode?: GameModeId;
  speed?: SpeedTier;
  gravity?: GravityDirection;
}

export function createPlayerState(options: SpawnOptions): PlayerState {
  return {
    position: { x: options.x, y: options.y },
    velocity: { x: 0, y: 0 },
    rotation: 0,
    gravity: options.gravity ?? 'down',
    speed: options.speed ?? 'normal',
    mode: options.mode ?? 'cube',
    lifecycle: 'idle',
    grounded: false,
    // Starting "long since grounded" prevents a free coyote-time jump on frame one.
    timeSinceGrounded: Number.POSITIVE_INFINITY,
    holdTime: 0,
    timeSincePressed: Number.POSITIVE_INFINITY,
    modeData: {},
    mini: false,
  };
}

/**
 * A detached copy. Used for checkpoints and for the editor's preview simulation,
 * both of which must not alias the live state.
 */
export function clonePlayerState(state: PlayerState): PlayerState {
  return {
    position: { x: state.position.x, y: state.position.y },
    velocity: { x: state.velocity.x, y: state.velocity.y },
    rotation: state.rotation,
    gravity: state.gravity,
    speed: state.speed,
    mode: state.mode,
    lifecycle: state.lifecycle,
    grounded: state.grounded,
    timeSinceGrounded: state.timeSinceGrounded,
    holdTime: state.holdTime,
    timeSincePressed: state.timeSincePressed,
    modeData: { ...state.modeData },
    mini: state.mini,
  };
}

/** Overwrites `target` in place from `source`, reusing the existing objects. */
export function copyPlayerState(target: PlayerState, source: PlayerState): void {
  target.position.x = source.position.x;
  target.position.y = source.position.y;
  target.velocity.x = source.velocity.x;
  target.velocity.y = source.velocity.y;
  target.rotation = source.rotation;
  target.gravity = source.gravity;
  target.speed = source.speed;
  target.mode = source.mode;
  target.lifecycle = source.lifecycle;
  target.grounded = source.grounded;
  target.timeSinceGrounded = source.timeSinceGrounded;
  target.holdTime = source.holdTime;
  target.timeSincePressed = source.timeSincePressed;
  target.mini = source.mini;

  // Replace rather than merge: leftover keys from another mode would be read as
  // live cooldowns by whichever mode owns that key name.
  for (const key of Object.keys(target.modeData)) delete target.modeData[key];
  Object.assign(target.modeData, source.modeData);
}

/** Half-extent of the player's square collider, accounting for mini mode. */
export function playerHalfSize(state: PlayerState): number {
  return (state.mini ? PHYSICS.PLAYER_SIZE * 0.6 : PHYSICS.PLAYER_SIZE) / 2;
}

/** The player's axis-aligned bounding box as {x, y, width, height}. */
export function playerBounds(state: PlayerState): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const half = playerHalfSize(state);
  return {
    x: state.position.x - half,
    y: state.position.y - half,
    width: half * 2,
    height: half * 2,
  };
}

export function isAlive(state: PlayerState): boolean {
  return state.lifecycle === 'running' || state.lifecycle === 'idle';
}
