import { BallMode } from '@/gameModes/BallMode';
import { CubeMode } from '@/gameModes/CubeMode';
import { RobotMode } from '@/gameModes/RobotMode';
import { ShipMode } from '@/gameModes/ShipMode';
import { SwingMode } from '@/gameModes/SwingMode';
import { UfoMode } from '@/gameModes/UfoMode';
import { WaveMode } from '@/gameModes/WaveMode';
import type { GameMode, GameModeContext } from '@/gameModes/GameMode';
import type { GameModeId } from '@/types/LevelTypes';
import type { InputState, PlayerState } from '@/types/PlayerTypes';
import { logger } from '@/utils/Logger';

/**
 * Holds the seven game modes and routes the current tick to whichever one is
 * active.
 *
 * The point of this class is that no other file contains a branch on the mode
 * id. Adding an eighth form means writing one class and adding one line to the
 * registry below; nothing in physics, collision or rendering changes.
 */
export class GameModeManager {
  private readonly modes: Map<GameModeId, GameMode>;
  private active: GameMode;

  constructor(startMode: GameModeId = 'cube') {
    const registry: GameMode[] = [
      new CubeMode(),
      new ShipMode(),
      new BallMode(),
      new UfoMode(),
      new WaveMode(),
      new RobotMode(),
      new SwingMode(),
    ];

    this.modes = new Map(registry.map((mode) => [mode.id, mode]));

    const initial = this.modes.get(startMode);
    if (!initial) {
      // A level naming a mode that does not exist is a data error, not a crash:
      // fall back to the cube and say so.
      logger.warn('GameModeManager', `Unknown start mode "${startMode}"; using cube`);
    }
    this.active = initial ?? (this.modes.get('cube') as GameMode);
  }

  get current(): GameMode {
    return this.active;
  }

  get currentId(): GameModeId {
    return this.active.id;
  }

  /** Look up a mode without activating it, e.g. to show a portal's icon. */
  get(id: GameModeId): GameMode | undefined {
    return this.modes.get(id);
  }

  /**
   * Switches the active mode, running the old mode's exit and the new one's
   * enter. Switching to the mode already running is a no-op, so a portal the
   * player brushes twice does not reset their velocity.
   */
  switchTo(id: GameModeId, state: PlayerState, context: GameModeContext): boolean {
    if (id === this.active.id) return false;

    const next = this.modes.get(id);
    if (!next) {
      logger.warn('GameModeManager', `Cannot switch to unknown mode "${id}"`);
      return false;
    }

    this.active.exit(state, context);
    this.active = next;
    state.mode = id;
    next.enter(state, context);

    logger.debug('GameModeManager', `Switched to ${next.displayName}`);
    return true;
  }

  /** Re-runs the active mode's enter hook, used when respawning. */
  reset(id: GameModeId, state: PlayerState, context: GameModeContext): void {
    const next = this.modes.get(id) ?? this.modes.get('cube');
    if (!next) return;
    this.active = next;
    state.mode = next.id;
    next.enter(state, context);
  }

  update(state: PlayerState, input: InputState, context: GameModeContext): void {
    this.active.update(state, input, context);
  }

  updateRotation(state: PlayerState, context: GameModeContext): void {
    this.active.updateRotation(state, context);
  }

  /** Returns true when the mode handled the landing itself. */
  onLand(state: PlayerState, context: GameModeContext): boolean {
    return this.active.onLand?.(state, context) ?? false;
  }

  onBoost(state: PlayerState, power: number, context: GameModeContext): void {
    this.active.onBoost?.(state, power, context);
  }

  /** Every registered mode, for the customisation and editor screens. */
  get all(): readonly GameMode[] {
    return [...this.modes.values()];
  }
}
