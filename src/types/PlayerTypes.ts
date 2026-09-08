import type { GameModeId, GravityDirection } from './LevelTypes';
import type { SpeedTier } from '@/config/constants';

/** A 2D vector used throughout the simulation. Plain data, never a class. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Coarse lifecycle state of the player. */
export type PlayerLifecycle = 'idle' | 'running' | 'dead' | 'finished';

/**
 * The complete simulation state of the player for one tick.
 *
 * This is deliberately a plain object with no behaviour: physics, game modes
 * and the renderer all read and write it, and it is cheap to snapshot for
 * checkpoints and replays.
 */
export interface PlayerState {
  position: Vec2;
  velocity: Vec2;
  /** Visual rotation in degrees; never affects collision. */
  rotation: number;
  /** Which way "down" currently is. */
  gravity: GravityDirection;
  /** Current speed tier; multiplies the base run speed. */
  speed: SpeedTier;
  mode: GameModeId;
  lifecycle: PlayerLifecycle;
  /** True while standing on a solid surface in the current gravity direction. */
  grounded: boolean;
  /** Seconds since the player last touched a solid surface. */
  timeSinceGrounded: number;
  /** Seconds the jump input has been held; 0 when released. */
  holdTime: number;
  /** Seconds since the jump input was last pressed; used for input buffering. */
  timeSincePressed: number;
  /** Per-mode scratch space, e.g. cooldown timers. Reset on a mode change. */
  modeData: Record<string, number>;
  /** Whether the player's collider is at half size (small mini-mode portals). */
  mini: boolean;
}

/** One frame of player input, sampled by the controller. */
export interface InputState {
  /** True on the tick the jump input went down. */
  pressed: boolean;
  /** True for as long as the jump input is held. */
  held: boolean;
  /** True on the tick the jump input went up. */
  released: boolean;
}

/** A snapshot the practice mode restores from. */
export interface Checkpoint {
  id: string;
  /** Deep copy of the player state at the moment of capture. */
  player: PlayerState;
  /** Song time in seconds. */
  songTime: number;
  /** Level progress 0..1 at capture time. */
  progress: number;
  /** Whether the player placed this or the game did. */
  manual: boolean;
}

/** Cosmetic loadout applied to the player's visual. */
export interface PlayerCustomization {
  skin: string;
  primaryColor: string;
  secondaryColor: string;
  trail: string;
  deathEffect: string;
}

/** The outcome of one attempt at a level. */
export interface AttemptResult {
  levelId: string;
  /** 0..1. */
  progress: number;
  completed: boolean;
  coinsCollected: string[];
  /** Wall-clock duration of the attempt in seconds. */
  duration: number;
  practice: boolean;
}
