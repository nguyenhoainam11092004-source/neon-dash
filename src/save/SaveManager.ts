import { SAVE } from '@/config/constants';
import { EventBus } from '@/utils/EventBus';
import { logger } from '@/utils/Logger';
import { deepClone, safeJsonParse, safeJsonStringify } from '@/utils/ValidationUtils';
import {
  createDefaultSaveData,
  createEmptyLevelProgress,
  type LevelProgress,
  type SaveData,
  type SettingsData,
} from './SaveData';
import { migrate, repair } from './SaveMigration';

/** Where the save actually lives. Swappable so tests need no browser. */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Used when localStorage is unavailable (private mode, disabled storage). */
export class MemoryStorageAdapter implements StorageAdapter {
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/**
 * Returns localStorage when it is genuinely usable.
 *
 * Merely existing is not enough: Safari's private mode throws on write, so the
 * only reliable test is to perform one.
 */
export function detectStorage(): StorageAdapter {
  try {
    if (typeof localStorage === 'undefined') return new MemoryStorageAdapter();
    const probe = '__nd_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    logger.warn('SaveManager', 'localStorage unavailable; progress will not persist');
    return new MemoryStorageAdapter();
  }
}

export interface SaveEvents extends Record<string, unknown> {
  'save:loaded': { data: SaveData; migrated: boolean };
  'save:written': { data: SaveData };
  'save:error': { message: string };
  'settings:changed': { settings: SettingsData };
  'progress:changed': { levelId: string; progress: LevelProgress };
}

/**
 * Owns the single in-memory copy of the player's save and writes it back to
 * storage.
 *
 * Writes are coalesced: gameplay updates progress many times a second, and
 * serialising on every change would stall frames. Callers mark the save dirty
 * and a flush happens on a timer, on scene shutdown, and when the page hides.
 */
export class SaveManager {
  readonly events = new EventBus<SaveEvents>();

  private readonly storage: StorageAdapter;
  private readonly key: string;
  private data: SaveData;
  private dirty = false;
  private timeSinceFlush = 0;

  constructor(storage: StorageAdapter = detectStorage(), key: string = SAVE.STORAGE_KEY) {
    this.storage = storage;
    this.key = key;
    this.data = createDefaultSaveData();
  }

  /** Reads and repairs the stored save, falling back to defaults on any fault. */
  load(): SaveData {
    const defaults = createDefaultSaveData();
    let raw: string | null = null;

    try {
      raw = this.storage.getItem(this.key);
    } catch (error) {
      logger.error('SaveManager', 'Could not read from storage', error);
    }

    if (!raw) {
      this.data = defaults;
      this.events.emit('save:loaded', { data: this.data, migrated: false });
      return this.data;
    }

    const parsed = safeJsonParse<unknown>(raw);
    if (!parsed.ok) {
      logger.error('SaveManager', `Save is not valid JSON: ${parsed.error}. Starting fresh.`);
      this.events.emit('save:error', { message: `Corrupt save discarded: ${parsed.error}` });
      this.data = defaults;
      return this.data;
    }

    try {
      const { data, migrated } = migrate(parsed.value);
      this.data = repair(data, defaults);
      if (migrated) this.markDirty();
      this.events.emit('save:loaded', { data: this.data, migrated });
      logger.info('SaveManager', `Save loaded (v${this.data.version})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown migration failure';
      logger.error('SaveManager', `Migration failed: ${message}. Starting fresh.`);
      this.events.emit('save:error', { message });
      this.data = defaults;
    }

    return this.data;
  }

  /** The live save document. Mutate through the helpers below, not directly. */
  get current(): Readonly<SaveData> {
    return this.data;
  }

  /** Queues a write. Cheap enough to call from gameplay code every frame. */
  markDirty(): void {
    this.dirty = true;
  }

  /** Advances the autosave timer. Call once per frame with the frame delta. */
  update(dt: number): void {
    if (!this.dirty) return;
    this.timeSinceFlush += dt;
    if (this.timeSinceFlush >= SAVE.AUTOSAVE_INTERVAL) this.flush();
  }

  /** Writes immediately when dirty. Returns whether anything was written. */
  flush(): boolean {
    if (!this.dirty) return false;

    this.data.updatedAt = new Date().toISOString();
    const serialized = safeJsonStringify(this.data);
    if (!serialized.ok) {
      logger.error('SaveManager', `Could not serialise save: ${serialized.error}`);
      this.events.emit('save:error', { message: serialized.error });
      return false;
    }

    try {
      this.storage.setItem(this.key, serialized.value);
      this.dirty = false;
      this.timeSinceFlush = 0;
      this.events.emit('save:written', { data: this.data });
      return true;
    } catch (error) {
      // Almost always a quota error, which a player can do nothing about mid-run;
      // log it and keep the in-memory state so the session is not lost.
      const message = error instanceof Error ? error.message : 'Unknown storage failure';
      logger.error('SaveManager', `Could not write save: ${message}`);
      this.events.emit('save:error', { message });
      return false;
    }
  }

  // ---------- Settings ----------

  get settings(): Readonly<SettingsData> {
    return this.data.settings;
  }

  updateSettings(patch: Partial<SettingsData>): SettingsData {
    this.data.settings = { ...this.data.settings, ...patch };
    this.markDirty();
    this.events.emit('settings:changed', { settings: this.data.settings });
    return this.data.settings;
  }

  // ---------- Level progress ----------

  /** Progress for `levelId`, creating an empty record the first time. */
  getProgress(levelId: string): LevelProgress {
    let entry = this.data.progress[levelId];
    if (!entry) {
      entry = createEmptyLevelProgress(levelId);
      this.data.progress[levelId] = entry;
    }
    return entry;
  }

  /**
   * Merges `patch` into a level's progress.
   *
   * Best-progress fields only ever move up, so a bad attempt cannot erase a
   * good one; the caller does not have to remember that rule.
   */
  updateProgress(levelId: string, patch: Partial<LevelProgress>): LevelProgress {
    const entry = this.getProgress(levelId);

    if (patch.bestProgress !== undefined) {
      entry.bestProgress = Math.max(entry.bestProgress, patch.bestProgress);
    }
    if (patch.bestPracticeProgress !== undefined) {
      entry.bestPracticeProgress = Math.max(entry.bestPracticeProgress, patch.bestPracticeProgress);
    }
    if (patch.attempts !== undefined) entry.attempts = patch.attempts;
    if (patch.completed !== undefined) entry.completed = entry.completed || patch.completed;
    if (patch.timePlayed !== undefined) entry.timePlayed = patch.timePlayed;
    if (patch.coinsCollected) {
      entry.coinsCollected = [...new Set([...entry.coinsCollected, ...patch.coinsCollected])];
    }
    entry.lastPlayedAt = new Date().toISOString();

    this.markDirty();
    this.events.emit('progress:changed', { levelId, progress: entry });
    return entry;
  }

  // ---------- Stats ----------

  /** Adds `amount` to a lifetime counter. */
  addStat(stat: keyof SaveData['stats'], amount: number): void {
    this.data.stats[stat] += amount;
    this.markDirty();
  }

  // ---------- Created levels ----------

  /** Inserts or replaces a level authored in the editor, matched by id. */
  saveCreatedLevel(level: SaveData['createdLevels'][number]): void {
    const index = this.data.createdLevels.findIndex((entry) => entry.id === level.id);
    if (index >= 0) this.data.createdLevels[index] = level;
    else {
      this.data.createdLevels.push(level);
      this.data.stats.levelsCreated += 1;
    }
    this.markDirty();
  }

  deleteCreatedLevel(levelId: string): boolean {
    const index = this.data.createdLevels.findIndex((entry) => entry.id === levelId);
    if (index < 0) return false;
    this.data.createdLevels.splice(index, 1);
    this.markDirty();
    return true;
  }

  // ---------- Whole-document operations ----------

  /** A detached copy, for the export-save feature. */
  export(): SaveData {
    return deepClone(this.data);
  }

  /** Replaces everything with an imported document, after repair. */
  import(raw: unknown): boolean {
    try {
      const { data } = migrate(raw);
      this.data = repair(data, createDefaultSaveData());
      this.markDirty();
      this.flush();
      this.events.emit('save:loaded', { data: this.data, migrated: true });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown import failure';
      logger.error('SaveManager', `Import rejected: ${message}`);
      this.events.emit('save:error', { message });
      return false;
    }
  }

  /** Wipes progress and settings. Used by the "reset game" option. */
  reset(): void {
    this.data = createDefaultSaveData();
    this.markDirty();
    this.flush();
    this.events.emit('save:loaded', { data: this.data, migrated: false });
  }
}

/**
 * The process-wide save.
 *
 * A single instance is genuinely correct here — there is one player and one
 * localStorage key — but scenes receive it through the registry rather than
 * importing it, so tests can substitute one backed by MemoryStorageAdapter.
 */
export const saveManager = new SaveManager();
