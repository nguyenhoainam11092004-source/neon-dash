import type { Difficulty } from '@/config/constants';
import type { LevelData } from '@/types/LevelTypes';
import { logger } from '@/utils/Logger';
import type { SaveManager } from '@/save/SaveManager';
import { levelLoader } from './LevelLoader';

/** One entry in the shipped level manifest. */
export interface LevelManifestEntry {
  id: string;
  name: string;
  difficulty: Difficulty;
  /** Path relative to the site root. */
  file: string;
  song: string;
  bpm: number;
  duration: number;
  /** Ordering in the level select screen. */
  order: number;
}

export interface LevelManifest {
  version: number;
  levels: LevelManifestEntry[];
}

/** Where a level came from, which decides whether it can be edited or deleted. */
export type LevelSource = 'official' | 'created' | 'imported' | 'online';

export interface LevelListing {
  id: string;
  name: string;
  creator: string;
  difficulty: Difficulty;
  duration: number;
  source: LevelSource;
  /** Present for official levels; loaded lazily from this path. */
  file?: string;
  /** Present for created and imported levels, which are held in memory. */
  data?: LevelData;
}

/**
 * The catalogue of every level the player can reach.
 *
 * Official levels are listed from a manifest and their bodies fetched only when
 * played, so opening the level select does not download the whole game's worth
 * of level data. Created and imported levels come from the save and are already
 * in memory.
 */
export class LevelManager {
  private readonly listings = new Map<string, LevelListing>();
  /** Level bodies already fetched, so replaying a level costs nothing. */
  private readonly cache = new Map<string, LevelData>();
  private manifestLoaded = false;

  /** Reads the manifest that PreloadScene fetched into the Phaser cache. */
  loadManifest(raw: unknown): boolean {
    if (!raw || typeof raw !== 'object') {
      logger.warn('LevelManager', 'No level manifest available');
      return false;
    }

    const manifest = raw as Partial<LevelManifest>;
    if (!Array.isArray(manifest.levels)) {
      logger.warn('LevelManager', 'Level manifest has no levels array');
      return false;
    }

    const sorted = [...manifest.levels].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (const entry of sorted) {
      if (!entry?.id || !entry.file) continue;
      this.listings.set(entry.id, {
        id: entry.id,
        name: entry.name ?? entry.id,
        creator: 'NEON DASH',
        difficulty: entry.difficulty ?? 'Normal',
        duration: entry.duration ?? 60,
        source: 'official',
        file: entry.file,
      });
    }

    this.manifestLoaded = this.listings.size > 0;
    logger.info('LevelManager', `Manifest listed ${this.listings.size} official levels`);
    return this.manifestLoaded;
  }

  /** Adds the player's own levels from the save. */
  loadCreated(save: SaveManager): void {
    for (const level of save.current.createdLevels) {
      this.listings.set(level.id, {
        id: level.id,
        name: level.name,
        creator: level.creator,
        difficulty: level.difficulty,
        duration: level.duration,
        source: 'created',
        data: level,
      });
      this.cache.set(level.id, level);
    }
  }

  /** Registers a level the player imported from a file. */
  addImported(level: LevelData): void {
    this.listings.set(level.id, {
      id: level.id,
      name: level.name,
      creator: level.creator,
      difficulty: level.difficulty,
      duration: level.duration,
      source: 'imported',
      data: level,
    });
    this.cache.set(level.id, level);
  }

  remove(levelId: string): void {
    this.listings.delete(levelId);
    this.cache.delete(levelId);
  }

  /** Every listing, official levels first and then the player's own. */
  list(source?: LevelSource): LevelListing[] {
    const all = [...this.listings.values()];
    const filtered = source ? all.filter((entry) => entry.source === source) : all;
    return filtered.sort((a, b) => {
      if (a.source !== b.source) return a.source === 'official' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  get(levelId: string): LevelListing | undefined {
    return this.listings.get(levelId);
  }

  /**
   * Returns a playable level, fetching it if necessary.
   *
   * Resolves to null rather than rejecting when the level cannot be loaded; the
   * caller shows a message and stays on the level select.
   */
  async load(levelId: string): Promise<LevelData | null> {
    const cached = this.cache.get(levelId);
    if (cached) return cached;

    const listing = this.listings.get(levelId);
    if (!listing) {
      logger.warn('LevelManager', `No such level "${levelId}"`);
      return null;
    }

    if (listing.data) {
      this.cache.set(levelId, listing.data);
      return listing.data;
    }

    if (!listing.file) {
      logger.warn('LevelManager', `Level "${levelId}" has neither data nor a file`);
      return null;
    }

    const result = await levelLoader.fromUrl(listing.file);
    if (!result.ok) {
      logger.error('LevelManager', `Could not load "${levelId}": ${result.error}`);
      return null;
    }

    this.cache.set(levelId, result.level);
    // The manifest's metadata is a summary; the file is authoritative.
    listing.name = result.level.name;
    listing.difficulty = result.level.difficulty;
    listing.duration = result.level.duration;
    return result.level;
  }

  /** Drops cached bodies but keeps the listings, to release memory. */
  clearCache(): void {
    this.cache.clear();
  }

  get hasManifest(): boolean {
    return this.manifestLoaded;
  }

  get count(): number {
    return this.listings.size;
  }
}

export const levelManager = new LevelManager();
