import { DIFFICULTIES, GRID, SPEED, VIEW, type SpeedTier } from '@/config/constants';
import {
  EASINGS,
  GAME_MODES,
  OBJECT_TYPES,
  TRIGGER_TYPES,
  type LevelData,
  type LevelObject,
  type LevelTheme,
  type LevelTrigger,
} from '@/types/LevelTypes';
import {
  generateId,
  isObject,
  safeJsonParse,
  safeJsonStringify,
  sanitizeText,
  toArray,
  toClampedNumber,
  toEnum,
  toNumber,
  toStringValue,
} from '@/utils/ValidationUtils';

/**
 * Converts between the level JSON on disk and the LevelData the game uses.
 *
 * Parsing is *normalising*, not merely casting: every optional field is filled
 * in with a sensible default here, so no other code has to ask whether a
 * rotation is present. That is what lets a hand-written level file omit almost
 * everything and still load.
 *
 * The editor and the gameplay scene share this one format, as required: there
 * is no separate "editor level" representation anywhere in the codebase.
 */

/** Current level schema version, written into every exported document. */
export const LEVEL_SCHEMA_VERSION = 1;

const DEFAULT_GROUND_Y = 600;
const DEFAULT_CEILING_Y = -1200;

function defaultTheme(): LevelTheme {
  return {
    background: '#1d1040',
    ground: '#2a1650',
    glow: '#9b5cff',
    pattern: 'grid',
  };
}

export class LevelSerializer {
  /**
   * Normalises an untrusted document into a LevelData.
   *
   * Assumes the validator has already accepted the document: anything it
   * reported as an ERROR would still be coerced to a default here, which would
   * hide the problem rather than fix it.
   */
  parse(raw: unknown): LevelData {
    if (!isObject(raw)) throw new Error('Level document must be an object');

    const speedTiers = Object.keys(SPEED.MULTIPLIERS) as SpeedTier[];

    return {
      id: toStringValue(raw.id, generateId('level')),
      name: sanitizeText(raw.name, 64) || 'Untitled',
      creator: sanitizeText(raw.creator, 32) || 'Unknown',
      difficulty: toEnum(raw.difficulty, DIFFICULTIES, 'Normal'),
      bpm: toClampedNumber(raw.bpm, 20, 400, 128),
      song: toStringValue(raw.song, 'song_default'),
      duration: toClampedNumber(raw.duration, 1, 3600, 60),
      description: sanitizeText(raw.description, 240) || undefined,
      createdAt: toStringValue(raw.createdAt, new Date().toISOString()),
      updatedAt: toStringValue(raw.updatedAt, new Date().toISOString()),
      version: toNumber(raw.version, LEVEL_SCHEMA_VERSION),

      startMode: toEnum(raw.startMode, GAME_MODES, 'cube'),
      startSpeed: speedTiers.includes(raw.startSpeed as SpeedTier)
        ? (raw.startSpeed as SpeedTier)
        : 'normal',
      startGravity: raw.startGravity === 'up' ? 'up' : 'down',
      startX: toNumber(raw.startX, 200),
      startY: toNumber(raw.startY, DEFAULT_GROUND_Y - GRID.SIZE),
      groundY: toNumber(raw.groundY, DEFAULT_GROUND_Y),
      ceilingY: toNumber(raw.ceilingY, DEFAULT_CEILING_Y),

      theme: this.parseTheme(raw.theme),
      objects: toArray<unknown>(raw.objects).map((entry, index) => this.parseObject(entry, index)),
      triggers: toArray<unknown>(raw.triggers).map((entry, index) =>
        this.parseTrigger(entry, index),
      ),
    };
  }

  private parseTheme(raw: unknown): LevelTheme {
    const fallback = defaultTheme();
    if (!isObject(raw)) return fallback;

    return {
      background: toStringValue(raw.background, fallback.background),
      ground: toStringValue(raw.ground, fallback.ground),
      glow: toStringValue(raw.glow, fallback.glow),
      pattern: toEnum(raw.pattern, ['grid', 'stars', 'waves', 'rings', 'none'] as const, 'grid'),
    };
  }

  private parseObject(raw: unknown, index: number): LevelObject {
    if (!isObject(raw)) {
      // Never throw mid-list: a placeholder decor object keeps the indices of
      // every later object stable, which matters because triggers refer to ids.
      return {
        id: generateId(`obj${index}`),
        type: 'decor',
        x: 0,
        y: 0,
        rotation: 0,
        scale: 1,
      };
    }

    return {
      id: toStringValue(raw.id, generateId('obj')),
      type: toEnum(raw.type, OBJECT_TYPES, 'block'),
      x: toNumber(raw.x, 0),
      y: toNumber(raw.y, 0),
      rotation: toNumber(raw.rotation, 0),
      scale: toClampedNumber(raw.scale, 0.05, 40, 1),
      layer: raw.layer === undefined ? undefined : toNumber(raw.layer, 0),
      groups: toArray<unknown>(raw.groups)
        .map((value) => toNumber(value, Number.NaN))
        .filter((value) => Number.isFinite(value)),
      props: isObject(raw.props) ? { ...raw.props } : undefined,
    };
  }

  private parseTrigger(raw: unknown, index: number): LevelTrigger {
    if (!isObject(raw)) {
      return {
        id: generateId(`trg${index}`),
        type: 'toggle',
        activation: 'touchX',
        delay: 0,
        duration: 0,
        easing: 'linear',
        value: {},
      };
    }

    return {
      id: toStringValue(raw.id, generateId('trg')),
      type: toEnum(raw.type, TRIGGER_TYPES, 'move'),
      target: typeof raw.target === 'string' ? raw.target : undefined,
      group: raw.group === undefined ? undefined : toNumber(raw.group, 0),
      x: raw.x === undefined ? undefined : toNumber(raw.x, 0),
      y: raw.y === undefined ? undefined : toNumber(raw.y, 0),
      time: raw.time === undefined ? undefined : toNumber(raw.time, 0),
      beat: raw.beat === undefined ? undefined : toNumber(raw.beat, 0),
      activation: toEnum(raw.activation, ['touchX', 'collide', 'time', 'beat'] as const, 'touchX'),
      delay: toClampedNumber(raw.delay, 0, 600, 0),
      duration: toClampedNumber(raw.duration, 0, 600, 0),
      easing: toEnum(raw.easing, EASINGS, 'linear'),
      value: isObject(raw.value) ? { ...raw.value } : {},
      repeatable: raw.repeatable === true,
    };
  }

  /** Produces the JSON written to a file or sent to the API. */
  serialize(level: LevelData, pretty = true): string {
    const document = {
      ...level,
      version: LEVEL_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
    };

    const result = safeJsonStringify(document, pretty ? 2 : undefined);
    if (!result.ok) throw new Error(`Could not serialise level: ${result.error}`);
    return result.value;
  }

  /** Parses a JSON string, reporting a readable error rather than throwing raw. */
  deserialize(json: string): LevelData {
    const parsed = safeJsonParse<unknown>(json);
    if (!parsed.ok) throw new Error(`Level file is not valid JSON: ${parsed.error}`);
    return this.parse(parsed.value);
  }

  /** An empty level, used by the editor's "new level" command. */
  createBlank(name = 'New Level', creator = 'Player'): LevelData {
    const groundY = VIEW.HEIGHT - 120;
    return {
      id: generateId('level'),
      name,
      creator,
      difficulty: 'Normal',
      bpm: 128,
      song: 'song_pulse',
      duration: 60,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: LEVEL_SCHEMA_VERSION,
      startMode: 'cube',
      startSpeed: 'normal',
      startGravity: 'down',
      startX: 200,
      startY: groundY - GRID.SIZE,
      groundY,
      ceilingY: groundY - GRID.SIZE * 24,
      theme: defaultTheme(),
      objects: [],
      triggers: [],
    };
  }
}

export const levelSerializer = new LevelSerializer();
