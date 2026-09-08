import type { EasingName, LevelTrigger, TriggerValue } from './LevelTypes';

/** Anything a trigger can drive. Objects and the camera both implement this. */
export interface TriggerTarget {
  readonly id: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  alpha: number;
  /** Packed 0xRRGGBB. */
  tint: number;
  visible: boolean;
  /** Groups this target belongs to, for group-addressed triggers. */
  readonly groups: readonly number[];
}

/**
 * A trigger instance that has been armed and is now animating.
 *
 * The runtime keeps these in a flat array and advances them all each tick,
 * rather than each trigger owning a timer, so ordering is deterministic and
 * nothing allocates mid-frame.
 */
export interface ActiveTrigger {
  readonly definition: LevelTrigger;
  readonly targets: TriggerTarget[];
  /** Seconds since activation, including the delay. */
  elapsed: number;
  /** Snapshot of each target when the tween started, for relative tweens. */
  startValues: TriggerValue[];
  /** False until the delay has elapsed and startValues have been captured. */
  started: boolean;
  done: boolean;
}

export type EasingFunction = (t: number) => number;

/** Registry shape implemented by MathUtils. */
export type EasingTable = Readonly<Record<EasingName, EasingFunction>>;

/** Effects a trigger can request from the scene rather than from an object. */
export interface SceneTriggerEffects {
  shake(intensity: number, duration: number): void;
  flash(color: number, duration: number): void;
  zoomTo(zoom: number, duration: number, easing: EasingName): void;
  panTo(x: number, y: number, duration: number, easing: EasingName): void;
  rotateCamera(degrees: number, duration: number, easing: EasingName): void;
}
