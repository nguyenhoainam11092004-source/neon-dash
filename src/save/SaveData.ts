import { AUDIO, SAVE } from '@/config/constants';
import type { LevelData } from '@/types/LevelTypes';
import type { PlayerCustomization } from '@/types/PlayerTypes';

/**
 * The shape of everything NEON DASH persists.
 *
 * This file describes data only. Reading, writing and repairing it is
 * SaveManager's job, and changing the shape here means adding a migration in
 * SaveMigration and bumping SAVE.SAVE_VERSION.
 */

export interface SettingsData {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  /** Screen shake scale, 0 disables it entirely (accessibility). */
  screenShake: number;
  /** Lowers particle counts and disables bloom on weaker hardware. */
  quality: 'low' | 'medium' | 'high';
  showFps: boolean;
  /** Draws the player and obstacle hit boxes. */
  showHitboxes: boolean;
  /** Shifts input handling earlier or later, in milliseconds, to fit a display. */
  inputOffsetMs: number;
  /** Nudges the music clock to compensate for output latency, in milliseconds. */
  audioOffsetMs: number;
  fullscreen: boolean;
  /** Reduces flashing and pulsing for photosensitivity. */
  reducedMotion: boolean;
}

/** Per-level progress. Absent from the map until the level is first attempted. */
export interface LevelProgress {
  levelId: string;
  /** Best normal-mode progress, 0..1. */
  bestProgress: number;
  /** Best practice-mode progress, 0..1. */
  bestPracticeProgress: number;
  completed: boolean;
  attempts: number;
  /** Ids of collectibles picked up across all attempts. */
  coinsCollected: string[];
  /** Total time spent on this level in seconds. */
  timePlayed: number;
  /** ISO-8601 of the most recent attempt. */
  lastPlayedAt?: string;
}

export interface AchievementProgress {
  id: string;
  /** Raw counter the achievement's condition compares against. */
  progress: number;
  unlocked: boolean;
  unlockedAt?: string;
}

/** Lifetime counters used by achievements and the profile screen. */
export interface PlayerStats {
  totalAttempts: number;
  totalDeaths: number;
  totalJumps: number;
  levelsCompleted: number;
  coinsCollected: number;
  levelsCreated: number;
  levelsPublished: number;
  /** Total seconds spent in gameplay, practice included. */
  timePlayed: number;
}

export interface InventoryData {
  /** Ids of every cosmetic the player owns. */
  unlocked: string[];
  /** Currently equipped loadout. */
  equipped: PlayerCustomization;
  /** Soft currency earned from collectibles. */
  currency: number;
}

export interface SaveData {
  /** Schema version; SaveMigration upgrades anything older. */
  version: number;
  /** ISO-8601, set on every successful write. */
  updatedAt: string;
  /** Display name, used by created levels and the leaderboard. */
  playerName: string;
  settings: SettingsData;
  /** Keyed by level id. */
  progress: Record<string, LevelProgress>;
  achievements: Record<string, AchievementProgress>;
  stats: PlayerStats;
  inventory: InventoryData;
  /** Levels authored in the in-game editor, stored verbatim. */
  createdLevels: LevelData[];
}

export function createDefaultSettings(): SettingsData {
  return {
    masterVolume: AUDIO.DEFAULT_MASTER_VOLUME,
    musicVolume: AUDIO.DEFAULT_MUSIC_VOLUME,
    sfxVolume: AUDIO.DEFAULT_SFX_VOLUME,
    screenShake: 1,
    quality: 'high',
    showFps: false,
    showHitboxes: false,
    inputOffsetMs: 0,
    audioOffsetMs: 0,
    fullscreen: false,
    reducedMotion: false,
  };
}

export function createDefaultStats(): PlayerStats {
  return {
    totalAttempts: 0,
    totalDeaths: 0,
    totalJumps: 0,
    levelsCompleted: 0,
    coinsCollected: 0,
    levelsCreated: 0,
    levelsPublished: 0,
    timePlayed: 0,
  };
}

export function createDefaultCustomization(): PlayerCustomization {
  return {
    skin: 'classic',
    primaryColor: '#2ff3f0',
    secondaryColor: '#ff2fa8',
    trail: 'none',
    deathEffect: 'shatter',
  };
}

export function createDefaultInventory(): InventoryData {
  return {
    // The starter loadout is owned from the first launch so the customisation
    // screen is never empty.
    unlocked: ['skin:classic', 'trail:none', 'death:shatter'],
    equipped: createDefaultCustomization(),
    currency: 0,
  };
}

export function createEmptyLevelProgress(levelId: string): LevelProgress {
  return {
    levelId,
    bestProgress: 0,
    bestPracticeProgress: 0,
    completed: false,
    attempts: 0,
    coinsCollected: [],
    timePlayed: 0,
  };
}

export function createDefaultSaveData(): SaveData {
  return {
    version: SAVE.SAVE_VERSION,
    updatedAt: new Date().toISOString(),
    playerName: 'Player',
    settings: createDefaultSettings(),
    progress: {},
    achievements: {},
    stats: createDefaultStats(),
    inventory: createDefaultInventory(),
    createdLevels: [],
  };
}
