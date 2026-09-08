import { SAVE } from '@/config/constants';
import { logger } from '@/utils/Logger';
import { isObject, toArray, toNumber, toStringValue } from '@/utils/ValidationUtils';
import {
  createDefaultInventory,
  createDefaultSettings,
  createDefaultStats,
  type SaveData,
} from './SaveData';

/**
 * Upgrades saved games written by older builds.
 *
 * Each migration takes the document one version forward and nothing else; the
 * runner applies them in order. A player who skipped ten releases therefore
 * follows the same path as one who upgraded each time, which is the only way to
 * keep this testable as the number of versions grows.
 */

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * Keyed by the version being migrated *from*. Entry `n` produces version n + 1.
 *
 * Version 1 is the first released schema, so the table is empty. When the shape
 * changes, bump SAVE.SAVE_VERSION and add the matching entry here.
 */
const MIGRATIONS: Record<number, Migration> = {};

/** True when `data` looks like a save document at all. */
export function looksLikeSaveData(data: unknown): data is Record<string, unknown> {
  return isObject(data) && typeof data.version === 'number';
}

/**
 * Brings a parsed document up to the current version.
 *
 * Unknown-but-newer saves are left alone rather than downgraded: a player who
 * opens an old build should not have their newer progress rewritten. The caller
 * decides whether to accept the result.
 */
export function migrate(raw: unknown): { data: Record<string, unknown>; migrated: boolean } {
  if (!looksLikeSaveData(raw)) {
    throw new Error('Save data is not an object with a version field');
  }

  let data = raw;
  let version = toNumber(data.version, 0);
  let migrated = false;

  if (version > SAVE.SAVE_VERSION) {
    logger.warn(
      'SaveMigration',
      `Save is from a newer build (v${version} > v${SAVE.SAVE_VERSION}); loading as-is`,
    );
    return { data, migrated: false };
  }

  while (version < SAVE.SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      logger.warn('SaveMigration', `No migration from v${version}; stamping current version`);
      break;
    }
    data = step(data);
    version += 1;
    data.version = version;
    migrated = true;
    logger.info('SaveMigration', `Migrated save to v${version}`);
  }

  data.version = SAVE.SAVE_VERSION;
  return { data, migrated };
}

/**
 * Fills in anything missing or wrongly typed after migration.
 *
 * Migrations handle known shape changes; this handles corruption, hand-edited
 * localStorage, and fields added without a version bump during development. The
 * result is always a structurally valid SaveData.
 */
export function repair(data: Record<string, unknown>, defaults: SaveData): SaveData {
  const settingsRaw = isObject(data.settings) ? data.settings : {};
  const defaultSettings = createDefaultSettings();

  const clamp01 = (value: unknown, fallback: number): number => {
    const n = toNumber(value, fallback);
    return Math.min(Math.max(n, 0), 1);
  };

  return {
    version: SAVE.SAVE_VERSION,
    updatedAt: toStringValue(data.updatedAt, defaults.updatedAt),
    playerName: toStringValue(data.playerName, defaults.playerName),
    settings: {
      masterVolume: clamp01(settingsRaw.masterVolume, defaultSettings.masterVolume),
      musicVolume: clamp01(settingsRaw.musicVolume, defaultSettings.musicVolume),
      sfxVolume: clamp01(settingsRaw.sfxVolume, defaultSettings.sfxVolume),
      screenShake: clamp01(settingsRaw.screenShake, defaultSettings.screenShake),
      quality:
        settingsRaw.quality === 'low' || settingsRaw.quality === 'medium'
          ? settingsRaw.quality
          : 'high',
      showFps: settingsRaw.showFps === true,
      showHitboxes: settingsRaw.showHitboxes === true,
      inputOffsetMs: toNumber(settingsRaw.inputOffsetMs, 0),
      audioOffsetMs: toNumber(settingsRaw.audioOffsetMs, 0),
      fullscreen: settingsRaw.fullscreen === true,
      reducedMotion: settingsRaw.reducedMotion === true,
    },
    progress: isObject(data.progress) ? (data.progress as SaveData['progress']) : {},
    achievements: isObject(data.achievements)
      ? (data.achievements as SaveData['achievements'])
      : {},
    stats: isObject(data.stats)
      ? { ...createDefaultStats(), ...(data.stats as Partial<SaveData['stats']>) }
      : createDefaultStats(),
    inventory: isObject(data.inventory)
      ? { ...createDefaultInventory(), ...(data.inventory as Partial<SaveData['inventory']>) }
      : createDefaultInventory(),
    createdLevels: toArray<SaveData['createdLevels'][number]>(data.createdLevels),
  };
}
