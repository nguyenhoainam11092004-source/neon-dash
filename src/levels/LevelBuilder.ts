import { GRID, type Difficulty, type SpeedTier } from '@/config/constants';
import type {
  EasingName,
  GameModeId,
  GravityDirection,
  LevelData,
  LevelObject,
  LevelObjectProps,
  LevelObjectType,
  LevelTheme,
  LevelTrigger,
  TriggerActivation,
  TriggerType,
  TriggerValue,
} from '@/types/LevelTypes';

/**
 * A fluent builder for level documents.
 *
 * Authoring a level as raw JSON means counting pixels; this lets a level be
 * written in grid cells and beats, which is how a designer actually thinks
 * about a rhythm platformer. The output is an ordinary LevelData — there is no
 * separate authored format, so the editor loads builder-made levels and the
 * game loads editor-made ones.
 */
export class LevelBuilder {
  private readonly objects: LevelObject[] = [];
  private readonly triggers: LevelTrigger[] = [];
  private objectSeq = 0;
  private triggerSeq = 0;

  private meta: {
    id: string;
    name: string;
    creator: string;
    difficulty: Difficulty;
    bpm: number;
    song: string;
    duration: number;
    description?: string;
  };

  private start = {
    mode: 'cube' as GameModeId,
    speed: 'normal' as SpeedTier,
    gravity: 'down' as GravityDirection,
    x: 200,
    y: 0,
  };

  private groundY = 620;
  private ceilingY = -340;

  private theme: LevelTheme = {
    background: '#1d1040',
    ground: '#2a1650',
    glow: '#9b5cff',
    pattern: 'grid',
  };

  constructor(id: string, name: string) {
    this.meta = {
      id,
      name,
      creator: 'NEON DASH',
      difficulty: 'Normal',
      bpm: 128,
      song: 'song_pulse',
      duration: 60,
    };
    this.start.y = this.groundY - GRID.SIZE / 2;
  }

  // ---------- Metadata ----------

  difficulty(value: Difficulty): this {
    this.meta.difficulty = value;
    return this;
  }

  song(key: string, bpm: number): this {
    this.meta.song = key;
    this.meta.bpm = bpm;
    return this;
  }

  duration(seconds: number): this {
    this.meta.duration = seconds;
    return this;
  }

  describe(text: string): this {
    this.meta.description = text;
    return this;
  }

  colors(background: string, ground: string, glow: string): this {
    this.theme = { ...this.theme, background, ground, glow };
    return this;
  }

  pattern(value: LevelTheme['pattern']): this {
    this.theme = { ...this.theme, pattern: value };
    return this;
  }

  startsAs(mode: GameModeId, speed: SpeedTier = 'normal'): this {
    this.start.mode = mode;
    this.start.speed = speed;
    return this;
  }

  floor(y: number): this {
    this.groundY = y;
    this.start.y = y - GRID.SIZE / 2;
    return this;
  }

  ceiling(y: number): this {
    this.ceilingY = y;
    return this;
  }

  // ---------- Coordinate helpers ----------

  /**
   * Converts a beat number to a world x.
   *
   * This is the whole point of the builder: obstacles are placed at beats, so a
   * level is in time with its music by construction rather than by being nudged
   * into place afterwards. The conversion uses the level's own tempo and the
   * base run speed, and the speed tier the player will be travelling at.
   */
  beatX(beat: number, speedTier: SpeedTier = this.start.speed): number {
    const secondsPerBeat = 60 / this.meta.bpm;
    const speed = 480 * SPEED_MULTIPLIERS[speedTier];
    return this.start.x + beat * secondsPerBeat * speed;
  }

  /** World y for a height in grid cells above the floor. */
  cellY(cellsAboveFloor: number): number {
    return this.groundY - cellsAboveFloor * GRID.SIZE - GRID.SIZE / 2;
  }

  // ---------- Objects ----------

  private nextObjectId(): string {
    this.objectSeq += 1;
    return `${this.meta.id}_o${this.objectSeq.toString().padStart(4, '0')}`;
  }

  /** Places one object and returns its generated id, for trigger targeting. */
  add(
    type: LevelObjectType,
    x: number,
    y: number,
    options: {
      rotation?: number;
      scale?: number;
      groups?: number[];
      props?: LevelObjectProps;
    } = {},
  ): string {
    const id = this.nextObjectId();
    this.objects.push({
      id,
      type,
      x,
      y,
      rotation: options.rotation ?? 0,
      scale: options.scale ?? 1,
      groups: options.groups,
      props: options.props,
    });
    return id;
  }

  /** A run of spikes on the floor at consecutive beats. */
  spikeRun(startBeat: number, count: number, step = 1, cellsUp = 0): this {
    for (let i = 0; i < count; i += 1) {
      this.add('spike', this.beatX(startBeat + i * step), this.cellY(cellsUp));
    }
    return this;
  }

  /** A block platform `cells` wide at a given height. */
  block(beat: number, cellsUp: number, cellsWide = 1, cellsTall = 1): string {
    return this.add(
      'block',
      this.beatX(beat) + ((cellsWide - 1) * GRID.SIZE) / 2,
      this.cellY(cellsUp) - ((cellsTall - 1) * GRID.SIZE) / 2,
      { props: { width: cellsWide, height: cellsTall } },
    );
  }

  /** A staircase of blocks the player runs up. */
  stairs(startBeat: number, steps: number, beatStep = 0.5): this {
    for (let i = 0; i < steps; i += 1) {
      this.block(startBeat + i * beatStep, i, 1, i + 1);
    }
    return this;
  }

  /** A saw blade at a beat and height. */
  saw(beat: number, cellsUp: number, scale = 1, spinSpeed = 1.4): string {
    return this.add('saw', this.beatX(beat), this.cellY(cellsUp), {
      scale,
      props: { spinSpeed },
    });
  }

  /** A jump pad on the floor. */
  pad(beat: number, cellsUp = 0, power = 1.35): string {
    return this.add('jumpPad', this.beatX(beat), this.cellY(cellsUp) + GRID.SIZE * 0.34, {
      props: { power },
    });
  }

  /** A jump ring in the air. */
  ring(beat: number, cellsUp: number, power = 1.1): string {
    return this.add('jumpRing', this.beatX(beat), this.cellY(cellsUp), { props: { power } });
  }

  /** A collectible. */
  coin(beat: number, cellsUp: number): string {
    return this.add('collectible', this.beatX(beat), this.cellY(cellsUp));
  }

  /** A corridor of blocks with a gap, for flying sections. */
  corridor(
    startBeat: number,
    endBeat: number,
    gapCentreCells: number,
    gapCells: number,
    step = 0.5,
  ): this {
    const halfGap = gapCells / 2;
    for (let beat = startBeat; beat <= endBeat; beat += step) {
      // Ceiling side.
      this.block(beat, gapCentreCells + halfGap + 1, 1, 6);
      // Floor side, only where the gap sits above the ground.
      const floorTop = gapCentreCells - halfGap;
      if (floorTop > 0.5) this.block(beat, floorTop - 1, 1, Math.max(1, Math.ceil(floorTop)));
    }
    return this;
  }

  // ---------- Portals ----------

  modePortal(beat: number, mode: GameModeId, cellsUp = 2): string {
    return this.add('modePortal', this.beatX(beat), this.cellY(cellsUp), { props: { mode } });
  }

  gravityPortal(beat: number, gravity: GravityDirection, cellsUp = 2): string {
    return this.add('gravityPortal', this.beatX(beat), this.cellY(cellsUp), {
      props: { gravity },
    });
  }

  speedPortal(beat: number, speed: SpeedTier, cellsUp = 2): string {
    return this.add('speedPortal', this.beatX(beat), this.cellY(cellsUp), { props: { speed } });
  }

  teleport(beat: number, cellsUp: number, targetCellsUp: number): string {
    return this.add('teleportPortal', this.beatX(beat), this.cellY(cellsUp), {
      props: { targetY: this.cellY(targetCellsUp) },
    });
  }

  /** The finish line. Also sets the level's duration to match. */
  finish(beat: number): string {
    const secondsPerBeat = 60 / this.meta.bpm;
    this.meta.duration = Math.ceil(beat * secondsPerBeat) + 2;
    return this.add('finish', this.beatX(beat), this.cellY(8));
  }

  // ---------- Triggers ----------

  private nextTriggerId(): string {
    this.triggerSeq += 1;
    return `${this.meta.id}_t${this.triggerSeq.toString().padStart(4, '0')}`;
  }

  trigger(
    type: TriggerType,
    options: {
      target?: string;
      group?: number;
      atBeat?: number;
      atTime?: number;
      onBeat?: number;
      activation?: TriggerActivation;
      delay?: number;
      duration?: number;
      easing?: EasingName;
      value?: TriggerValue;
      repeatable?: boolean;
    },
  ): string {
    const id = this.nextTriggerId();

    const activation: TriggerActivation =
      options.activation ??
      (options.onBeat !== undefined ? 'beat' : options.atTime !== undefined ? 'time' : 'touchX');

    this.triggers.push({
      id,
      type,
      target: options.target,
      group: options.group,
      x: options.atBeat !== undefined ? this.beatX(options.atBeat) : undefined,
      time: options.atTime,
      beat: options.onBeat,
      activation,
      delay: options.delay ?? 0,
      duration: options.duration ?? 0,
      easing: options.easing ?? 'easeInOut',
      value: options.value ?? {},
      repeatable: options.repeatable,
    });

    return id;
  }

  /** Shakes the camera when the player reaches a beat. */
  shakeAt(beat: number, intensity = 8, duration = 0.35): this {
    this.trigger('shake', { atBeat: beat, duration, value: { intensity } });
    return this;
  }

  /** Zooms the camera when the player reaches a beat. */
  zoomAt(beat: number, zoom: number, duration = 0.8): this {
    this.trigger('zoom', { atBeat: beat, duration, value: { zoom } });
    return this;
  }

  /** Moves an object when the player reaches a beat. */
  moveAt(
    beat: number,
    target: string,
    dx: number,
    dy: number,
    duration = 1,
    easing: EasingName = 'easeInOut',
  ): this {
    this.trigger('move', { atBeat: beat, target, duration, easing, value: { x: dx, y: dy } });
    return this;
  }

  // ---------- Output ----------

  build(): LevelData {
    const now = new Date().toISOString();
    return {
      ...this.meta,
      createdAt: now,
      updatedAt: now,
      version: 1,
      startMode: this.start.mode,
      startSpeed: this.start.speed,
      startGravity: this.start.gravity,
      startX: this.start.x,
      startY: this.start.y,
      groundY: this.groundY,
      ceilingY: this.ceilingY,
      theme: this.theme,
      objects: this.objects,
      triggers: this.triggers,
    };
  }
}

/** Mirrors SPEED.MULTIPLIERS; duplicated so the builder can run standalone. */
const SPEED_MULTIPLIERS: Record<SpeedTier, number> = {
  slow: 0.7,
  normal: 1.0,
  fast: 1.3,
  faster: 1.6,
  fastest: 1.9,
};
