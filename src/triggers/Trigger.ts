import type { Obstacle } from '@/obstacles/Obstacle';
import type { EasingName, LevelTrigger } from '@/types/LevelTypes';
import { getEasing, mixColor, parseHexColor } from '@/utils/MathUtils';

/**
 * A trigger the runtime has armed and is now animating.
 *
 * Triggers are data, not classes: a `move` trigger and a `rotate` trigger differ
 * only in which fields of `value` they read. Making them subclasses would mean
 * thirteen files that each hold one line of arithmetic, so instead there is one
 * applier per property and a table that says which properties a type touches.
 */
export interface RunningTrigger {
  readonly definition: LevelTrigger;
  readonly targets: Obstacle[];
  /** Captured when the delay ends, so relative tweens have a baseline. */
  readonly baselines: TriggerBaseline[];
  elapsed: number;
  started: boolean;
  done: boolean;
}

/** A target's property values at the moment its tween began. */
export interface TriggerBaseline {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  alpha: number;
  tint: number;
}

/** Extra state a trigger can request from the scene rather than an object. */
export interface SceneEffects {
  shake(intensity: number, duration: number): void;
  flash(color: number, duration: number): void;
  zoom(zoom: number, duration: number, easing: EasingName): void;
  pan(x: number, y: number, duration: number, easing: EasingName): void;
  rotate(degrees: number, duration: number, easing: EasingName): void;
  /** Sets an object's visual alpha and tint; the simulation object has neither. */
  setVisual(id: string, alpha?: number, tint?: number): void;
  /** Toggles an object's participation in collision and rendering. */
  setEnabled(id: string, enabled: boolean): void;
  /** Emits a burst of particles at a position. */
  spawnParticles(x: number, y: number, color: number, count: number): void;
}

/**
 * Which value fields each trigger type reads.
 *
 * Kept as data so the editor's property panel can be generated from it rather
 * than hand-written per type, which is how the two stay in agreement.
 */
export const TRIGGER_FIELDS = {
  move: ['x', 'y'],
  rotate: ['rotation'],
  scale: ['scale'],
  color: ['color'],
  alpha: ['alpha'],
  pulse: ['scale', 'intensity'],
  camera: ['x', 'y'],
  shake: ['intensity'],
  zoom: ['zoom'],
  spawn: ['x', 'y', 'color', 'intensity'],
  toggle: ['enabled'],
  speed: ['speed'],
  gravity: ['gravity'],
} as const satisfies Record<string, readonly string[]>;

/** Snapshots an obstacle's animatable properties. */
export function captureBaseline(target: Obstacle, alpha = 1, tint = 0xffffff): TriggerBaseline {
  return {
    x: target.x,
    y: target.y,
    rotation: target.rotation,
    scale: target.scale,
    alpha,
    tint,
  };
}

/**
 * Advances one running trigger.
 *
 * Returns true when the trigger has finished and can be removed. Movement,
 * rotation and scale are *relative* to the baseline — a move trigger with
 * `{x: 100}` shifts the target 100 pixels — while colour, alpha and toggles are
 * absolute, because that is what each one means to a level author.
 */
export function advanceTrigger(
  running: RunningTrigger,
  dt: number,
  effects: SceneEffects,
): boolean {
  const definition = running.definition;
  running.elapsed += dt;

  if (running.elapsed < definition.delay) return false;

  if (!running.started) {
    running.started = true;
    running.baselines.length = 0;
    for (const target of running.targets) {
      running.baselines.push(captureBaseline(target));
    }
    fireSceneEffects(running, effects);
  }

  const active = running.elapsed - definition.delay;
  const duration = definition.duration;
  const raw = duration <= 0 ? 1 : Math.min(1, active / duration);
  const t = getEasing(definition.easing)(raw);

  applyToTargets(running, t, effects);

  if (raw >= 1) {
    running.done = true;
    return true;
  }
  return false;
}

/** Scene-level effects fire once, when the trigger starts. */
function fireSceneEffects(running: RunningTrigger, effects: SceneEffects): void {
  const { definition } = running;
  const value = definition.value;

  switch (definition.type) {
    case 'shake':
      effects.shake(numberOr(value.intensity, 8), definition.duration || 0.4);
      break;
    case 'zoom':
      effects.zoom(numberOr(value.zoom, 1), definition.duration, definition.easing);
      break;
    case 'camera':
      effects.pan(
        numberOr(value.x, 0),
        numberOr(value.y, 0),
        definition.duration,
        definition.easing,
      );
      if (value.rotation !== undefined) {
        effects.rotate(numberOr(value.rotation, 0), definition.duration, definition.easing);
      }
      break;
    case 'spawn':
      effects.spawnParticles(
        numberOr(value.x, 0),
        numberOr(value.y, 0),
        parseHexColor(String(value.color ?? '')) ?? 0xffffff,
        Math.round(numberOr(value.intensity, 12)),
      );
      break;
    default:
      break;
  }
}

function applyToTargets(running: RunningTrigger, t: number, effects: SceneEffects): void {
  const { definition, targets, baselines } = running;
  const value = definition.value;

  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    const base = baselines[i];
    if (!target || !base) continue;

    switch (definition.type) {
      case 'move':
        target.x = base.x + numberOr(value.x, 0) * t;
        target.y = base.y + numberOr(value.y, 0) * t;
        break;

      case 'rotate':
        target.rotation = base.rotation + numberOr(value.rotation, 0) * t;
        break;

      case 'scale':
        target.scale = base.scale + (numberOr(value.scale, 1) - base.scale) * t;
        break;

      case 'alpha':
        effects.setVisual(target.id, base.alpha + (numberOr(value.alpha, 1) - base.alpha) * t);
        break;

      case 'color': {
        const to = parseHexColor(String(value.color ?? '')) ?? base.tint;
        effects.setVisual(target.id, undefined, mixColor(base.tint, to, t));
        break;
      }

      case 'pulse': {
        // One full out-and-back over the duration, so a pulse returns the
        // object to where it started without needing a second trigger.
        const swell = Math.sin(t * Math.PI);
        const amount = numberOr(value.scale, 0.3);
        target.scale = base.scale * (1 + swell * amount);
        break;
      }

      case 'toggle':
        // Applies at the end of the delay rather than tweening; a half-enabled
        // object is not a meaningful state.
        target.active = value.enabled !== false;
        effects.setEnabled(target.id, target.active);
        break;

      default:
        break;
    }
  }
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
