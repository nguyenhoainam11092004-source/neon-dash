import type { Obstacle } from '@/obstacles/Obstacle';
import type { LevelTrigger } from '@/types/LevelTypes';
import type { PlayerState } from '@/types/PlayerTypes';
import { logger } from '@/utils/Logger';
import { advanceTrigger, type RunningTrigger, type SceneEffects } from './Trigger';

/**
 * Arms and advances a level's triggers.
 *
 * Two collections do the work: a list of not-yet-fired triggers sorted by the
 * position or time that arms them, and a list of currently animating ones. The
 * sorted list means checking for newly armed triggers is a walk from a moving
 * cursor rather than a scan of the whole level, so a level with ten thousand
 * triggers costs the same per frame as one with ten.
 */
export class TriggerRuntime {
  /** Triggers armed by the player's x position, sorted ascending. */
  private byPosition: LevelTrigger[] = [];
  private positionCursor = 0;

  /** Triggers armed by song time, sorted ascending. */
  private byTime: LevelTrigger[] = [];
  private timeCursor = 0;

  /** Triggers armed by beat index, sorted ascending. */
  private byBeat: LevelTrigger[] = [];
  private beatCursor = 0;

  /** Triggers armed by touching them; tested against collision results. */
  private readonly byCollision = new Map<string, LevelTrigger[]>();

  private readonly running: RunningTrigger[] = [];

  /** Object lookup, so a trigger resolves its target once rather than per tick. */
  private readonly objectsById = new Map<string, Obstacle>();
  private readonly objectsByGroup = new Map<number, Obstacle[]>();

  /** Triggers that have fired and are not repeatable. */
  private readonly spent = new Set<string>();

  private effects: SceneEffects;

  constructor(effects: SceneEffects) {
    this.effects = effects;
  }

  /** Indexes a level's triggers and objects. Call once per level load. */
  load(triggers: readonly LevelTrigger[], obstacles: readonly Obstacle[]): void {
    this.clear();

    for (const obstacle of obstacles) {
      this.objectsById.set(obstacle.id, obstacle);
      for (const group of obstacle.groups) {
        let list = this.objectsByGroup.get(group);
        if (!list) {
          list = [];
          this.objectsByGroup.set(group, list);
        }
        list.push(obstacle);
      }
    }

    for (const trigger of triggers) {
      switch (trigger.activation) {
        case 'touchX':
          this.byPosition.push(trigger);
          break;
        case 'time':
          this.byTime.push(trigger);
          break;
        case 'beat':
          this.byBeat.push(trigger);
          break;
        case 'collide': {
          const key = trigger.target ?? '';
          if (!key) {
            logger.warn('TriggerRuntime', `Collide trigger "${trigger.id}" has no target`);
            break;
          }
          const list = this.byCollision.get(key) ?? [];
          list.push(trigger);
          this.byCollision.set(key, list);
          break;
        }
      }
    }

    this.byPosition.sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
    this.byTime.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
    this.byBeat.sort((a, b) => (a.beat ?? 0) - (b.beat ?? 0));
  }

  /**
   * Advances the runtime by one tick.
   *
   * Arming happens before animating, so a trigger with zero delay and zero
   * duration applies on the same tick it arms rather than one tick later.
   */
  update(dt: number, player: PlayerState, songTime: number, beat: number): void {
    this.armByPosition(player.position.x);
    this.armByTime(songTime);
    this.armByBeat(beat);

    for (let i = this.running.length - 1; i >= 0; i -= 1) {
      const running = this.running[i];
      if (!running) continue;
      if (advanceTrigger(running, dt, this.effects)) {
        this.running.splice(i, 1);
      }
    }
  }

  private armByPosition(x: number): void {
    while (this.positionCursor < this.byPosition.length) {
      const trigger = this.byPosition[this.positionCursor];
      if (!trigger || (trigger.x ?? 0) > x) break;
      this.positionCursor += 1;
      this.arm(trigger);
    }
  }

  private armByTime(songTime: number): void {
    while (this.timeCursor < this.byTime.length) {
      const trigger = this.byTime[this.timeCursor];
      if (!trigger || (trigger.time ?? 0) > songTime) break;
      this.timeCursor += 1;
      this.arm(trigger);
    }
  }

  private armByBeat(beat: number): void {
    while (this.beatCursor < this.byBeat.length) {
      const trigger = this.byBeat[this.beatCursor];
      if (!trigger || (trigger.beat ?? 0) > beat) break;
      this.beatCursor += 1;
      this.arm(trigger);
    }
  }

  /** Called by the collision system when the player touches an object. */
  onCollide(objectId: string): void {
    const triggers = this.byCollision.get(objectId);
    if (!triggers) return;
    for (const trigger of triggers) this.arm(trigger);
  }

  private arm(trigger: LevelTrigger): void {
    if (!trigger.repeatable && this.spent.has(trigger.id)) return;
    this.spent.add(trigger.id);

    const targets = this.resolveTargets(trigger);

    this.running.push({
      definition: trigger,
      targets,
      baselines: [],
      elapsed: 0,
      started: false,
      done: false,
    });
  }

  /**
   * Resolves a trigger's target list.
   *
   * A group reference expands to every member; an id reference to one object.
   * Scene-level triggers legitimately resolve to nothing.
   */
  private resolveTargets(trigger: LevelTrigger): Obstacle[] {
    if (trigger.group !== undefined) {
      return this.objectsByGroup.get(trigger.group) ?? [];
    }
    if (trigger.target) {
      const target = this.objectsById.get(trigger.target);
      if (!target) {
        logger.warn(
          'TriggerRuntime',
          `Trigger "${trigger.id}" targets missing object "${trigger.target}"`,
        );
        return [];
      }
      return [target];
    }
    return [];
  }

  /** Rewinds to the start of the level, or to a practice checkpoint. */
  reset(fromX = 0, fromTime = 0, fromBeat = 0): void {
    this.running.length = 0;
    this.spent.clear();

    // Fast-forward the cursors so triggers behind a checkpoint are treated as
    // already spent rather than all firing at once on respawn.
    this.positionCursor = this.byPosition.findIndex((trigger) => (trigger.x ?? 0) > fromX);
    if (this.positionCursor < 0) this.positionCursor = this.byPosition.length;

    this.timeCursor = this.byTime.findIndex((trigger) => (trigger.time ?? 0) > fromTime);
    if (this.timeCursor < 0) this.timeCursor = this.byTime.length;

    this.beatCursor = this.byBeat.findIndex((trigger) => (trigger.beat ?? 0) > fromBeat);
    if (this.beatCursor < 0) this.beatCursor = this.byBeat.length;
  }

  clear(): void {
    this.byPosition = [];
    this.byTime = [];
    this.byBeat = [];
    this.byCollision.clear();
    this.running.length = 0;
    this.objectsById.clear();
    this.objectsByGroup.clear();
    this.spent.clear();
    this.positionCursor = 0;
    this.timeCursor = 0;
    this.beatCursor = 0;
  }

  setEffects(effects: SceneEffects): void {
    this.effects = effects;
  }

  get activeCount(): number {
    return this.running.length;
  }
}
