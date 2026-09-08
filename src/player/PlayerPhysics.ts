import { PHYSICS, SPEED } from '@/config/constants';
import type { GameModeContext } from '@/gameModes/GameMode';
import { Obstacle, type Rect } from '@/obstacles/Obstacle';
import { Portal } from '@/portals/Portal';
import type { PlayerState } from '@/types/PlayerTypes';
import type { CollisionWorld } from './CollisionWorld';
import { playerBounds, playerHalfSize } from './PlayerState';

/**
 * What one physics step produced, for the scene to react to.
 *
 * The physics step never kills the player, plays a sound or changes a scene: it
 * reports what happened and lets the caller decide. That is what makes the same
 * step reusable by the headless level validator.
 */
export interface StepResult {
  /** The player hit something lethal, or the side of a solid. */
  died: boolean;
  /** The obstacle responsible, when the player died. */
  killer: Obstacle | null;
  /** True on the tick the player touched down after being airborne. */
  landed: boolean;
  /** Interactive objects overlapped this tick, in the order encountered. */
  interactions: Obstacle[];
  /** Portals entered this tick. */
  portals: Portal[];
}

/**
 * Integrates the player and resolves collision against the level.
 *
 * The order within a step is fixed and matters: integrate, then resolve solids,
 * then test hazards, then collect interactions. Resolving solids before testing
 * hazards means a player who lands exactly on the lip of a block is placed on
 * top of it before the spike behind it is considered, which is the difference
 * between a level feeling fair and feeling arbitrary.
 */
export class PlayerPhysics {
  private readonly world: CollisionWorld;

  /** Reused between steps so a 240 Hz simulation allocates nothing. */
  private readonly result: StepResult = {
    died: false,
    killer: null,
    landed: false,
    interactions: [],
    portals: [],
  };

  constructor(world: CollisionWorld) {
    this.world = world;
  }

  /** Horizontal run speed for the player's current tier. */
  static runSpeed(state: PlayerState): number {
    return SPEED.BASE * SPEED.MULTIPLIERS[state.speed];
  }

  /**
   * Advances the player by one fixed step.
   *
   * `context` carries the level's floor and ceiling and the emit callback; the
   * game mode has already written this tick's velocity by the time this runs.
   */
  step(state: PlayerState, context: GameModeContext): StepResult {
    const result = this.result;
    result.died = false;
    result.killer = null;
    result.landed = false;
    result.interactions.length = 0;
    result.portals.length = 0;

    const dt = context.dt;
    const wasGrounded = state.grounded;

    state.velocity.x = context.runSpeed;
    state.position.x += state.velocity.x * dt;
    state.position.y += state.velocity.y * dt;

    state.grounded = false;

    this.resolveWorldBounds(state, context, result);
    if (!result.died) this.resolveObstacles(state, context, result);

    // Timers advance after resolution so a landing this tick resets the coyote
    // window to zero rather than to one step.
    state.timeSinceGrounded = state.grounded ? 0 : state.timeSinceGrounded + dt;
    state.timeSincePressed += dt;

    if (state.grounded && !wasGrounded) result.landed = true;

    return result;
  }

  /**
   * Keeps the player inside the level's floor and ceiling.
   *
   * Flying modes are stopped by both; grounded modes stand on the floor and are
   * killed by the ceiling only if they are inverted, because a normal cube
   * cannot reach it.
   */
  private resolveWorldBounds(
    state: PlayerState,
    context: GameModeContext,
    result: StepResult,
  ): void {
    const half = playerHalfSize(state);
    const floor = context.groundY - half;
    const ceiling = context.ceilingY + half;

    if (state.position.y >= floor) {
      state.position.y = floor;
      if (state.gravity === 'down') {
        if (state.velocity.y > 0) state.velocity.y = 0;
        state.grounded = true;
      } else {
        // Inverted and falling onto the floor: this is the player's "ceiling".
        if (state.velocity.y > 0) state.velocity.y = 0;
        state.grounded = true;
      }
    }

    if (state.position.y <= ceiling) {
      state.position.y = ceiling;
      if (state.velocity.y < 0) state.velocity.y = 0;
      if (state.gravity === 'up') state.grounded = true;
      else {
        // A non-inverted player pressed into the ceiling by a ship's thrust is
        // simply stopped, not killed; ceilings are level geometry, not hazards.
        void result;
      }
    }
  }

  private resolveObstacles(state: PlayerState, context: GameModeContext, result: StepResult): void {
    const half = playerHalfSize(state);
    // Query a window a little wider than the player so a fast tier cannot step
    // past a thin object between two ticks.
    const reach = half + Math.abs(state.velocity.x) * context.dt + 4;
    const candidates = this.world.query(state.position.x - reach, state.position.x + reach);

    // Copy: resolving a solid moves the player, and the next query would return
    // a different, shorter-lived array.
    const nearby = candidates.slice();

    for (const obstacle of nearby) {
      if (!obstacle.active) continue;
      const kind = obstacle.contactKind;
      if (kind === 'none') continue;

      const bounds = playerBounds(state);
      if (!obstacle.overlaps(bounds)) continue;

      if (kind === 'lethal') {
        result.died = true;
        result.killer = obstacle;
        return;
      }

      if (kind === 'solid') {
        if (!this.resolveSolid(state, obstacle, bounds, context)) {
          result.died = true;
          result.killer = obstacle;
          return;
        }
        continue;
      }

      if (obstacle instanceof Portal) result.portals.push(obstacle);
      else result.interactions.push(obstacle);
    }
  }

  /**
   * Places the player on top of a solid, or reports that they ran into its side.
   *
   * Returns false when the contact was fatal. The rule is the genre's: a surface
   * approached from above (relative to the player's own gravity) is a floor;
   * approached from the side, it is a wall and a wall is death.
   */
  private resolveSolid(
    state: PlayerState,
    obstacle: Obstacle,
    bounds: Rect,
    context: GameModeContext,
  ): boolean {
    const box = obstacle.bounds;
    const half = playerHalfSize(state);

    const overlapX =
      Math.min(bounds.x + bounds.width, box.x + box.width) - Math.max(bounds.x, box.x);
    const overlapY =
      Math.min(bounds.y + bounds.height, box.y + box.height) - Math.max(bounds.y, box.y);

    // Whichever axis is less deeply penetrated is the one the player came from.
    // A near-tie is treated as a vertical landing, because at run speed the
    // horizontal overlap grows much faster and would otherwise win a fair hit.
    const fromSide = overlapX < overlapY - PHYSICS.LANDING_TOLERANCE;

    if (fromSide) {
      // Only a contact on the *leading* edge kills; being nudged from behind by
      // a moving platform should not.
      const playerCentre = state.position.x;
      const boxCentre = box.x + box.width / 2;
      if (playerCentre < boxCentre) return false;

      state.position.x = box.x + box.width + half;
      return true;
    }

    const movingDown = state.velocity.y > 0;
    const playerAbove = state.position.y < box.y + box.height / 2;

    if (movingDown && playerAbove) {
      state.position.y = box.y - half;
      state.velocity.y = 0;
      if (state.gravity === 'down') state.grounded = true;
      return true;
    }

    if (!movingDown && !playerAbove) {
      state.position.y = box.y + box.height + half;
      state.velocity.y = 0;
      if (state.gravity === 'up') state.grounded = true;
      return true;
    }

    // Moving into the face the player is already past: push them clear rather
    // than letting them sink through.
    if (playerAbove) {
      state.position.y = box.y - half;
      if (state.velocity.y > 0) state.velocity.y = 0;
      if (state.gravity === 'down') state.grounded = true;
    } else {
      state.position.y = box.y + box.height + half;
      if (state.velocity.y < 0) state.velocity.y = 0;
      if (state.gravity === 'up') state.grounded = true;
    }

    void context;
    return true;
  }
}
