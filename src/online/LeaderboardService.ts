import type { ApiClient, ApiResult } from './ApiClient';
import { apiClient } from './ApiClient';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  /** 0..1. */
  progress: number;
  completed: boolean;
  attempts: number;
  /** Seconds taken on the successful run, when completed. */
  time?: number;
  achievedAt: string;
}

export interface LeaderboardPage {
  entries: LeaderboardEntry[];
  total: number;
  /** The requesting player's own row, wherever it falls. */
  self?: LeaderboardEntry;
}

export type LeaderboardScope = 'global' | 'level' | 'friends' | 'creator';

/**
 * Score submission and ranking tables.
 *
 * The important design point here is what is *not* done: nothing in this file
 * decides a rank, and nothing treats a client-reported score as final. The
 * client submits what it observed; the server is expected to re-derive the run
 * from the submitted evidence and reject anything it cannot account for. A
 * leaderboard that trusts the client is a leaderboard of whoever edited their
 * JavaScript first.
 *
 * The submission payload therefore carries more than a number: the level
 * version it was played on, the attempt's duration, and a compact input record.
 * Together those let the server replay the attempt deterministically — which
 * the fixed-timestep simulation makes possible — and confirm the claimed
 * progress really follows from them.
 */
export interface ScoreSubmission {
  levelId: string;
  /** The level version played, so a re-published level invalidates old runs. */
  levelVersion: number;
  progress: number;
  completed: boolean;
  attempts: number;
  /** Attempt duration in seconds. */
  duration: number;
  /** Collectible ids picked up during the run. */
  coins: string[];
  /**
   * The run's inputs, as [tick, pressed] pairs.
   *
   * Small — a two-minute level holds a few hundred entries — and sufficient to
   * reproduce the run exactly, because the simulation is deterministic and
   * frame-rate independent.
   */
  inputs: [number, 0 | 1][];
  /** Practice runs are recorded but never ranked. */
  practice: boolean;
}

export class LeaderboardService {
  private readonly api: ApiClient;

  constructor(api: ApiClient = apiClient) {
    this.api = api;
  }

  /**
   * Submits a completed attempt.
   *
   * Practice runs are refused locally rather than sent and rejected: the rule
   * is not a secret, and a round trip to be told so is waste.
   */
  async submit(submission: ScoreSubmission): Promise<ApiResult<LeaderboardEntry>> {
    if (submission.practice) {
      return {
        ok: false,
        error: { status: 400, message: 'Practice runs are not ranked', transient: false },
      };
    }

    if (submission.progress < 0 || submission.progress > 1) {
      return {
        ok: false,
        error: { status: 400, message: 'Progress must be between 0 and 1', transient: false },
      };
    }

    return this.api.post<LeaderboardEntry>('/leaderboard/submit', submission);
  }

  /** A page of one leaderboard. */
  async fetch(
    scope: LeaderboardScope,
    options: { levelId?: string; creatorId?: string; page?: number; pageSize?: number } = {},
  ): Promise<ApiResult<LeaderboardPage>> {
    return this.api.get<LeaderboardPage>('/leaderboard', {
      scope,
      levelId: options.levelId ?? '',
      creatorId: options.creatorId ?? '',
      page: options.page ?? 1,
      pageSize: Math.min(100, options.pageSize ?? 25),
    });
  }

  /** The signed-in player's standing on one level. */
  async personalBest(levelId: string): Promise<ApiResult<LeaderboardEntry | null>> {
    return this.api.get<LeaderboardEntry | null>(
      `/leaderboard/personal/${encodeURIComponent(levelId)}`,
    );
  }
}

export const leaderboardService = new LeaderboardService();
