import type { LevelManager } from '@/levels/LevelManager';
import type { SaveManager } from '@/save/SaveManager';
import type { AttemptResult } from '@/types/PlayerTypes';
import { AchievementManager } from './AchievementManager';
import { InventoryManager } from './InventoryManager';

/** A rolled-up view of the player's standing, for the profile screen. */
export interface ProgressSummary {
  levelsCompleted: number;
  levelsAvailable: number;
  totalAttempts: number;
  totalDeaths: number;
  totalJumps: number;
  coinsCollected: number;
  coinsAvailable: number;
  timePlayed: number;
  achievementsUnlocked: number;
  achievementsTotal: number;
  cosmeticsOwned: number;
  cosmeticsTotal: number;
  currency: number;
  /** Overall completion, 0..1, weighting levels, coins and achievements. */
  completion: number;
}

/**
 * Records the outcome of an attempt and keeps the derived systems in step.
 *
 * Gameplay reports *what happened*; deciding what that means for progress,
 * currency and achievements happens here. Keeping that decision out of the
 * gameplay scene is what stops the rules being duplicated between normal play,
 * practice and the editor's test mode.
 */
export class ProgressManager {
  private readonly save: SaveManager;
  private readonly levels: LevelManager;
  readonly achievements: AchievementManager;
  readonly inventory: InventoryManager;

  constructor(save: SaveManager, levels: LevelManager) {
    this.save = save;
    this.levels = levels;
    this.achievements = new AchievementManager(save);
    this.inventory = new InventoryManager(save);
  }

  /**
   * Files an attempt.
   *
   * Practice attempts update the practice record and the lifetime counters but
   * never the real best-progress or completion flags, which is the entire point
   * of practice mode being separate.
   */
  recordAttempt(result: AttemptResult): void {
    const previous = this.save.getProgress(result.levelId);
    const newCoins = result.coinsCollected.filter((id) => !previous.coinsCollected.includes(id));

    this.save.updateProgress(result.levelId, {
      bestProgress: result.practice ? undefined : result.progress,
      bestPracticeProgress: result.practice ? result.progress : undefined,
      completed: result.practice ? undefined : result.completed,
      coinsCollected: result.coinsCollected,
      timePlayed: previous.timePlayed + result.duration,
    });

    this.save.addStat('timePlayed', result.duration);

    if (newCoins.length > 0) {
      this.save.addStat('coinsCollected', newCoins.length);
      // Coins are the game's only currency source, so the value is set here
      // rather than being a property of each collectible.
      this.inventory.addCurrency(newCoins.length * 5);
    }

    if (result.completed && !result.practice && !previous.completed) {
      this.save.addStat('levelsCompleted', 1);
    }

    this.achievements.evaluate();
    this.save.flush();
  }

  /** Best normal-mode progress for a level, 0..1. */
  bestProgress(levelId: string): number {
    return this.save.current.progress[levelId]?.bestProgress ?? 0;
  }

  isCompleted(levelId: string): boolean {
    return this.save.current.progress[levelId]?.completed ?? false;
  }

  /**
   * Rolls everything up for the profile screen.
   *
   * The single completion figure weights levels most heavily because that is
   * what the game is about; coins and achievements are the long tail.
   */
  summary(): ProgressSummary {
    const stats = this.save.current.stats;
    const listings = this.levels.list('official');
    const levelsAvailable = Math.max(1, listings.length);
    // Three collectibles per level is the authoring convention.
    const coinsAvailable = levelsAvailable * 3;

    const levelFraction = Math.min(1, stats.levelsCompleted / levelsAvailable);
    const coinFraction = Math.min(1, stats.coinsCollected / coinsAvailable);
    const achievementFraction =
      this.achievements.all.length > 0
        ? this.achievements.unlockedCount / this.achievements.all.length
        : 0;

    return {
      levelsCompleted: stats.levelsCompleted,
      levelsAvailable,
      totalAttempts: stats.totalAttempts,
      totalDeaths: stats.totalDeaths,
      totalJumps: stats.totalJumps,
      coinsCollected: stats.coinsCollected,
      coinsAvailable,
      timePlayed: stats.timePlayed,
      achievementsUnlocked: this.achievements.unlockedCount,
      achievementsTotal: this.achievements.all.length,
      cosmeticsOwned: this.inventory.ownedCount,
      cosmeticsTotal: this.inventory.totalCount,
      currency: this.inventory.currency,
      completion: levelFraction * 0.6 + coinFraction * 0.25 + achievementFraction * 0.15,
    };
  }
}
