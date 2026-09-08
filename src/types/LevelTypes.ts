import type { Difficulty, SpeedTier } from '@/config/constants';

/** Every object type the game and the editor both understand. */
export const OBJECT_TYPES = [
  'block',
  'spike',
  'saw',
  'platform',
  'jumpPad',
  'jumpRing',
  'collectible',
  'gravityPortal',
  'speedPortal',
  'modePortal',
  'teleportPortal',
  'finish',
  'decor',
] as const;

export type LevelObjectType = (typeof OBJECT_TYPES)[number];

/** Player forms. A mode portal switches between these. */
export const GAME_MODES = ['cube', 'ship', 'ball', 'ufo', 'wave', 'robot', 'swing'] as const;

export type GameModeId = (typeof GAME_MODES)[number];

export type GravityDirection = 'down' | 'up';

/**
 * Free-form per-type configuration. Kept as an open record so adding an object
 * type never forces a change to the level schema; the factory for each type
 * validates the keys it cares about.
 */
export interface LevelObjectProps {
  /** modePortal */
  mode?: GameModeId;
  /** gravityPortal */
  gravity?: GravityDirection;
  /** speedPortal */
  speed?: SpeedTier;
  /** teleportPortal: destination in world coordinates. */
  targetX?: number;
  targetY?: number;
  /** jumpPad / jumpRing strength multiplier. */
  power?: number;
  /** platform / block: size in grid cells. */
  width?: number;
  height?: number;
  /** saw: revolutions per second, negative reverses. */
  spinSpeed?: number;
  /** collectible: how much it is worth. */
  value?: number;
  /** Visual tint override, as a hex string like "#2ff3f0". */
  color?: string;
  /** Whether the object kills on contact. Defaults come from the type. */
  lethal?: boolean;
  /** Whether the player can stand on it. Defaults come from the type. */
  solid?: boolean;
  [key: string]: unknown;
}

/** One placed object in a level. Coordinates are world pixels. */
export interface LevelObject {
  id: string;
  type: LevelObjectType;
  x: number;
  y: number;
  /** Degrees, clockwise. */
  rotation: number;
  scale: number;
  /** Render/edit layer; higher draws later. */
  layer?: number;
  /** Groups let one trigger address many objects at once. */
  groups?: number[];
  props?: LevelObjectProps;
}

export const TRIGGER_TYPES = [
  'move',
  'rotate',
  'scale',
  'color',
  'alpha',
  'pulse',
  'camera',
  'shake',
  'zoom',
  'spawn',
  'toggle',
  'speed',
  'gravity',
] as const;

export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const EASINGS = [
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut',
  'easeOutBack',
  'easeOutElastic',
  'easeOutBounce',
] as const;

export type EasingName = (typeof EASINGS)[number];

/** What causes a trigger to fire. */
export type TriggerActivation =
  /** The player's x position crosses the trigger's x. */
  | 'touchX'
  /** The player physically overlaps the trigger. */
  | 'collide'
  /** A fixed song time, in seconds. */
  | 'time'
  /** A beat index in the song. */
  | 'beat';

export interface TriggerValue {
  x?: number;
  y?: number;
  rotation?: number;
  scale?: number;
  alpha?: number;
  color?: string;
  zoom?: number;
  intensity?: number;
  speed?: SpeedTier;
  gravity?: GravityDirection;
  enabled?: boolean;
  [key: string]: unknown;
}

export interface LevelTrigger {
  id: string;
  type: TriggerType;
  /** Object id this trigger acts on. Ignored when `group` is set. */
  target?: string;
  /** Group id this trigger acts on; addresses every object in the group. */
  group?: number;
  /** World x at which a `touchX` trigger arms. */
  x?: number;
  y?: number;
  /** Song time in seconds for a `time` trigger. */
  time?: number;
  /** Beat index for a `beat` trigger. */
  beat?: number;
  activation: TriggerActivation;
  /** Seconds to wait after activation before the tween starts. */
  delay: number;
  /** Tween length in seconds. 0 applies the value instantly. */
  duration: number;
  easing: EasingName;
  /** Values are deltas for move/rotate/scale, absolute for the rest. */
  value: TriggerValue;
  /** When false the trigger fires once and disarms. Defaults to false. */
  repeatable?: boolean;
}

/** Background and colour theming for a level. */
export interface LevelTheme {
  /** Hex strings. */
  background: string;
  ground: string;
  glow: string;
  /** Named background pattern the renderer knows how to draw. */
  pattern?: 'grid' | 'stars' | 'waves' | 'rings' | 'none';
}

export interface LevelMetadata {
  id: string;
  name: string;
  creator: string;
  difficulty: Difficulty;
  /** Beats per minute of the level's song; drives every beat-synced effect. */
  bpm: number;
  /** Key of the song in the audio registry. */
  song: string;
  /** Level length in seconds. */
  duration: number;
  description?: string;
  /** ISO-8601. Present on user-created and downloaded levels. */
  createdAt?: string;
  updatedAt?: string;
  /** Schema version of this level document. */
  version?: number;
}

export interface LevelData extends LevelMetadata {
  /** Starting player form. */
  startMode: GameModeId;
  startSpeed: SpeedTier;
  startGravity: GravityDirection;
  /** Where the player spawns, in world pixels. */
  startX: number;
  startY: number;
  /** World y of the floor. Objects below this are unreachable. */
  groundY: number;
  /** World y of the ceiling for flight modes. */
  ceilingY: number;
  theme: LevelTheme;
  objects: LevelObject[];
  triggers: LevelTrigger[];
}

/** Result of running a level through the validator. */
export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: ValidationSeverity;
  /** Dotted path into the level document, e.g. "objects[3].x". */
  path: string;
  message: string;
}

export interface ValidationResult {
  status: 'PASS' | 'WARNING' | 'ERROR';
  issues: ValidationIssue[];
}
