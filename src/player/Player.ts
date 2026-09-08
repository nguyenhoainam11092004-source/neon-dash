import { PHYSICS } from '@/config/constants';
import type { GameModeContext, GameModeEffect } from '@/gameModes/GameMode';
import type { Obstacle } from '@/obstacles/Obstacle';
import type { Portal, PortalEffect } from '@/portals/Portal';
import type { GameModeId } from '@/types/LevelTypes';
import type { InputState, PlayerState } from '@/types/PlayerTypes';
import { EventBus } from '@/utils/EventBus';
import type { CollisionWorld } from './CollisionWorld';
import { GameModeManager } from './GameModeManager';
import { PlayerPhysics, type StepResult } from './PlayerPhysics';
import {
  clonePlayerState,
  copyPlayerState,
  createPlayerState,
  type SpawnOptions,
} from './PlayerState';

export interface PlayerEvents extends Record<string, unknown> {
  'player:jump': { power: number };
  'player:land': Record<string, never>;
  'player:flip': { gravity: PlayerState['gravity'] };
  'player:died': { killer: Obstacle | null; position: { x: number; y: number } };
  'player:finished': Record<string, never>;
  'player:collected': { obstacle: Obstacle };
  'player:boosted': { power: number };
  'player:mode-changed': { mode: GameModeId; previous: GameModeId };
  'player:speed-changed': { speed: PlayerState['speed'] };
  'player:effect': { effect: GameModeEffect; payload?: Record<string, number> };
}

export interface PlayerConfig {
  spawn: SpawnOptions;
  groundY: number;
  ceilingY: number;
  world: CollisionWorld;
}

/**
 * The player as the rest of the game sees it.
 *
 * This is a facade over four collaborators that each do one job: the mode
 * manager decides how input becomes velocity, physics integrates and resolves
 * collision, the state object holds the numbers, and the event bus tells the
 * scene what happened. Nothing outside this class touches those pieces
 * directly, so the rules about *order* — mode, then integrate, then collide,
 * then portals — are stated in exactly one place.
 */
export class Player {
  readonly events = new EventBus<PlayerEvents>();
  readonly modes: GameModeManager;

  private readonly physics: PlayerPhysics;
  private readonly config: PlayerConfig;
  private readonly context: GameModeContext;

  private playerState: PlayerState;
  /** The state at the last checkpoint, or at the level's start. */
  private spawnState: PlayerState;

  /** Interactions the scene has not consumed yet, cleared each tick. */
  private readonly pendingCollectibles: Obstacle[] = [];

  constructor(config: PlayerConfig) {
    this.config = config;
    this.playerState = createPlayerState(config.spawn);
    this.spawnState = clonePlayerState(this.playerState);
    this.modes = new GameModeManager(config.spawn.mode ?? 'cube');
    this.physics = new PlayerPhysics(config.world);

    // The context is built once and mutated in place: rebuilding it 240 times a
    // second would be the single largest source of garbage in the game.
    this.context = {
      dt: 0,
      runSpeed: 0,
      gravity: PHYSICS.GRAVITY,
      groundY: config.groundY,
      ceilingY: config.ceilingY,
      emit: (effect, payload) => this.events.emit('player:effect', { effect, payload }),
    } as GameModeContext;
  }

  get state(): PlayerState {
    return this.playerState;
  }

  get isAlive(): boolean {
    return this.playerState.lifecycle === 'running' || this.playerState.lifecycle === 'idle';
  }

  /** Begins a run from the current spawn state. */
  start(): void {
    this.playerState.lifecycle = 'running';
  }

  /**
   * Advances one fixed simulation tick.
   *
   * `dt` must be the fixed step, not the frame delta: passing a variable value
   * here is what makes a rhythm platformer play differently on different
   * monitors.
   */
  tick(dt: number, input: InputState): StepResult | null {
    const state = this.playerState;
    if (state.lifecycle !== 'running') return null;

    if (input.pressed) state.timeSincePressed = 0;
    state.holdTime = input.held ? state.holdTime + dt : 0;

    const ctx = this.context as { dt: number; runSpeed: number };
    ctx.dt = dt;
    ctx.runSpeed = PlayerPhysics.runSpeed(state);

    this.modes.update(state, input, this.context);

    const result = this.physics.step(state, this.context);

    this.modes.updateRotation(state, this.context);

    if (result.landed && !this.modes.onLand(state, this.context)) {
      this.events.emit('player:land', {});
    }

    for (const portal of result.portals) {
      this.applyPortal(portal);
    }

    for (const obstacle of result.interactions) {
      this.applyInteraction(obstacle, input);
    }

    if (result.died) {
      this.kill(result.killer);
    }

    return result;
  }

  private applyPortal(portal: Portal): void {
    const effect: PortalEffect | null = portal.effect(this.playerState);
    portal.markTriggered();
    if (!effect) return;

    const state = this.playerState;

    if (effect.gravity && effect.gravity !== state.gravity) {
      state.gravity = effect.gravity;
      state.grounded = false;
      this.events.emit('player:flip', { gravity: state.gravity });
    }

    if (effect.mini !== undefined) state.mini = effect.mini;

    if (effect.speed && effect.speed !== state.speed) {
      state.speed = effect.speed;
      this.events.emit('player:speed-changed', { speed: state.speed });
    }

    if (effect.mode && effect.mode !== state.mode) {
      const previous = state.mode;
      this.modes.switchTo(effect.mode, state, this.context);
      this.events.emit('player:mode-changed', { mode: state.mode, previous });
    }

    if (effect.teleport) {
      state.position.x = effect.teleport.x;
      state.position.y = effect.teleport.y;
      state.grounded = false;
    }
  }

  private applyInteraction(obstacle: Obstacle, input: InputState): void {
    const result = obstacle.interact(this.playerState);
    if (!result) return;

    // A ring only fires while the player is asking for it, which is what makes
    // it a timing challenge rather than a free bounce.
    if (result.requiresInput && !input.held) return;

    if (result.boost !== undefined) {
      this.modes.onBoost(this.playerState, result.boost, this.context);
      this.events.emit('player:boosted', { power: result.boost });
    }

    if (result.collect) {
      this.pendingCollectibles.push(obstacle);
      this.events.emit('player:collected', { obstacle });
    }

    if (result.finish) {
      this.playerState.lifecycle = 'finished';
      this.events.emit('player:finished', {});
    }
  }

  /** Ends the run. Idempotent, so a double hit reports one death. */
  kill(killer: Obstacle | null = null): void {
    if (this.playerState.lifecycle === 'dead') return;
    this.playerState.lifecycle = 'dead';
    this.events.emit('player:died', {
      killer,
      position: { x: this.playerState.position.x, y: this.playerState.position.y },
    });
  }

  /** Ids of collectibles picked up since the last call, then clears the list. */
  drainCollected(): string[] {
    const ids = this.pendingCollectibles.map((obstacle) => obstacle.id);
    this.pendingCollectibles.length = 0;
    return ids;
  }

  /** Records the current state as the point a respawn returns to. */
  setCheckpoint(state?: PlayerState): void {
    this.spawnState = clonePlayerState(state ?? this.playerState);
  }

  get checkpoint(): PlayerState {
    return this.spawnState;
  }

  /** Returns the player to the last checkpoint, ready to run again. */
  respawn(): void {
    copyPlayerState(this.playerState, this.spawnState);
    this.playerState.lifecycle = 'running';
    this.playerState.timeSinceGrounded = Number.POSITIVE_INFINITY;
    this.playerState.timeSincePressed = Number.POSITIVE_INFINITY;
    this.playerState.holdTime = 0;
    this.pendingCollectibles.length = 0;
    this.modes.reset(this.playerState.mode, this.playerState, this.context);
  }

  /** Resets to the level's opening state, discarding any checkpoint. */
  resetToStart(): void {
    this.spawnState = createPlayerState(this.config.spawn);
    this.respawn();
  }

  /** Updates the floor and ceiling, e.g. when the editor resizes the level. */
  setBounds(groundY: number, ceilingY: number): void {
    const ctx = this.context as { groundY: number; ceilingY: number };
    ctx.groundY = groundY;
    ctx.ceilingY = ceilingY;
  }

  get modeContext(): GameModeContext {
    return this.context;
  }

  destroy(): void {
    this.events.clear();
    this.pendingCollectibles.length = 0;
  }
}
