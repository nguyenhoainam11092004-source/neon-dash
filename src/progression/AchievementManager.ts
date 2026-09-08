import type { SaveManager } from '@/save/SaveManager';
import type { PlayerStats } from '@/save/SaveData';
import { EventBus } from '@/utils/EventBus';
import { logger } from '@/utils/Logger';

/**
 * One achievement's definition.
 *
 * The condition reads only from the save, never from live gameplay: that keeps
 * achievements checkable at any moment (on load, after a level, on demand)
 * rather than depending on catching an event at exactly the right time.
 */
export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  /** Reward paid into the player's currency on unlock. */
  reward: number;
  /** Hidden achievements are not listed until unlocked. */
  secret?: boolean;
  /** Current progress toward the goal, in the same units as `goal`. */
  measure: (save: SaveManager) => number;
  /** The value `measure` must reach. */
  goal: number;
}

export interface AchievementEvents extends Record<string, unknown> {
  unlocked: { definition: AchievementDefinition };
}

const stat =
  (key: keyof PlayerStats) =>
  (save: SaveManager): number =>
    save.current.stats[key];

/**
 * The achievement catalogue.
 *
 * Data, not code: adding one is a new entry here and nothing else. The set
 * spans the game's whole surface — playing, dying, collecting, creating — so
 * there is always one in reach whatever the player is doing.
 */
export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    id: 'first_steps',
    name: 'First Steps',
    description: 'Complete your first level',
    reward: 10,
    measure: stat('levelsCompleted'),
    goal: 1,
  },
  {
    id: 'five_down',
    name: 'Five Down',
    description: 'Complete five levels',
    reward: 25,
    measure: stat('levelsCompleted'),
    goal: 5,
  },
  {
    id: 'full_set',
    name: 'Full Set',
    description: 'Complete all ten official levels',
    reward: 100,
    measure: stat('levelsCompleted'),
    goal: 10,
  },
  {
    id: 'persistent',
    name: 'Persistent',
    description: 'Die 100 times',
    reward: 15,
    measure: stat('totalDeaths'),
    goal: 100,
  },
  {
    id: 'relentless',
    name: 'Relentless',
    description: 'Die 1000 times',
    reward: 60,
    measure: stat('totalDeaths'),
    goal: 1000,
  },
  {
    id: 'collector',
    name: 'Collector',
    description: 'Collect 10 coins',
    reward: 20,
    measure: stat('coinsCollected'),
    goal: 10,
  },
  {
    id: 'hoarder',
    name: 'Hoarder',
    description: 'Collect 30 coins',
    reward: 50,
    measure: stat('coinsCollected'),
    goal: 30,
  },
  {
    id: 'airborne',
    name: 'Airborne',
    description: 'Jump 1000 times',
    reward: 20,
    measure: stat('totalJumps'),
    goal: 1000,
  },
  {
    id: 'hard_line',
    name: 'Hard Line',
    description: 'Complete a Hard level',
    reward: 40,
    measure: (save) =>
      Object.values(save.current.progress).some((entry) => entry.completed) ? 1 : 0,
    goal: 1,
  },
  {
    id: 'architect',
    name: 'Architect',
    description: 'Create your first level',
    reward: 30,
    measure: stat('levelsCreated'),
    goal: 1,
  },
  {
    id: 'prolific',
    name: 'Prolific',
    description: 'Create five levels',
    reward: 70,
    measure: stat('levelsCreated'),
    goal: 5,
  },
  {
    id: 'published',
    name: 'Published',
    description: 'Publish a level online',
    reward: 80,
    measure: stat('levelsPublished'),
    goal: 1,
  },
  {
    id: 'marathon',
    name: 'Marathon',
    description: 'Play for one hour in total',
    reward: 35,
    measure: (save) => save.current.stats.timePlayed,
    goal: 3600,
  },
  {
    id: 'thousand_tries',
    name: 'Thousand Tries',
    description: 'Make 1000 attempts',
    reward: 45,
    measure: stat('totalAttempts'),
    goal: 1000,
  },
  {
    id: 'no_mistakes',
    name: 'Clean Run',
    description: 'Complete a level without using practice mode',
    reward: 55,
    secret: true,
    measure: (save) =>
      Object.values(save.current.progress).filter(
        (entry) => entry.completed && entry.bestProgress >= 1,
      ).length,
    goal: 1,
  },
];

/**
 * Tracks achievement progress and announces unlocks.
 *
 * Checking is a pull, not a push: `evaluate` walks the catalogue and compares
 * each condition against the save. That is O(catalogue) and runs at most a few
 * times a second, which is far cheaper than the bookkeeping that push-based
 * tracking would need across a dozen event sources.
 */
export class AchievementManager {
  readonly events = new EventBus<AchievementEvents>();

  private readonly save: SaveManager;
  private readonly definitions: Map<string, AchievementDefinition>;

  constructor(save: SaveManager, definitions: readonly AchievementDefinition[] = ACHIEVEMENTS) {
    this.save = save;
    this.definitions = new Map(definitions.map((entry) => [entry.id, entry]));
  }

  /** Re-checks every achievement, unlocking any whose condition is now met. */
  evaluate(): AchievementDefinition[] {
    const unlocked: AchievementDefinition[] = [];
    const record = this.save.current.achievements;

    for (const definition of this.definitions.values()) {
      const existing = record[definition.id];
      if (existing?.unlocked) continue;

      const progress = definition.measure(this.save);

      record[definition.id] = {
        id: definition.id,
        progress,
        unlocked: progress >= definition.goal,
        unlockedAt: progress >= definition.goal ? new Date().toISOString() : undefined,
      };

      if (progress >= definition.goal) {
        this.save.current.inventory.currency += definition.reward;
        unlocked.push(definition);
        this.events.emit('unlocked', { definition });
        logger.info('AchievementManager', `Unlocked "${definition.name}"`);
      }
    }

    if (unlocked.length > 0) this.save.flush();
    else this.save.markDirty();

    return unlocked;
  }

  /** Progress toward one achievement, as a 0..1 fraction. */
  fraction(id: string): number {
    const definition = this.definitions.get(id);
    if (!definition) return 0;
    if (definition.goal <= 0) return 1;
    return Math.min(1, definition.measure(this.save) / definition.goal);
  }

  isUnlocked(id: string): boolean {
    return this.save.current.achievements[id]?.unlocked ?? false;
  }

  /** Achievements to show, hiding unearned secrets. */
  visible(): AchievementDefinition[] {
    return [...this.definitions.values()].filter(
      (definition) => !definition.secret || this.isUnlocked(definition.id),
    );
  }

  get all(): readonly AchievementDefinition[] {
    return [...this.definitions.values()];
  }

  get unlockedCount(): number {
    return [...this.definitions.keys()].filter((id) => this.isUnlocked(id)).length;
  }
}
