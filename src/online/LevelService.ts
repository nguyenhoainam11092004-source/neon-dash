import { levelLoader } from '@/levels/LevelLoader';
import { levelSerializer } from '@/levels/LevelSerializer';
import { levelValidator } from '@/levels/LevelValidator';
import type { Difficulty } from '@/config/constants';
import type { LevelData } from '@/types/LevelTypes';
import type { ApiClient, ApiResult } from './ApiClient';
import { apiClient } from './ApiClient';

/** A level's public record on the server. */
export interface OnlineLevelSummary {
  id: string;
  name: string;
  creator: string;
  creatorId: string;
  difficulty: Difficulty;
  version: number;
  rating: number;
  downloads: number;
  likes: number;
  plays: number;
  duration: number;
  createdAt: string;
  updatedAt: string;
}

export interface BrowseQuery {
  search?: string;
  difficulty?: Difficulty;
  creator?: string;
  sort?: 'recent' | 'popular' | 'rating' | 'downloads';
  page?: number;
  pageSize?: number;
}

export interface BrowseResult {
  levels: OnlineLevelSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Publishing and downloading community levels.
 *
 * Two rules shape this class. First, a level is validated before it is sent:
 * uploading something the game cannot load wastes a round trip and puts a
 * broken record in front of other players. Second, a downloaded level is
 * validated *again* on arrival — the server's copy is untrusted input no matter
 * who wrote it, and this is the layer where that assumption belongs.
 */
export class LevelService {
  private readonly api: ApiClient;

  constructor(api: ApiClient = apiClient) {
    this.api = api;
  }

  async browse(query: BrowseQuery = {}): Promise<ApiResult<BrowseResult>> {
    return this.api.get<BrowseResult>('/levels', {
      search: query.search ?? '',
      difficulty: query.difficulty ?? '',
      creator: query.creator ?? '',
      sort: query.sort ?? 'recent',
      page: query.page ?? 1,
      pageSize: Math.min(50, query.pageSize ?? 20),
    });
  }

  /** Fetches a level body and validates it before handing it to the game. */
  async download(levelId: string): Promise<ApiResult<LevelData>> {
    const result = await this.api.get<unknown>(`/levels/${encodeURIComponent(levelId)}`);
    if (!result.ok) return result;

    const loaded = levelLoader.fromObject(result.data);
    if (!loaded.ok) {
      return {
        ok: false,
        error: {
          status: 422,
          message: `Downloaded level is not playable: ${loaded.error}`,
          transient: false,
        },
      };
    }

    return { ok: true, data: loaded.level };
  }

  /** Validates locally, then uploads. */
  async publish(level: LevelData): Promise<ApiResult<OnlineLevelSummary>> {
    const validation = levelValidator.validate(level);
    if (validation.status === 'ERROR') {
      const first = validation.issues.find((issue) => issue.severity === 'error');
      return {
        ok: false,
        error: {
          status: 400,
          message: `Level failed validation: ${first?.message ?? 'unknown problem'}`,
          transient: false,
        },
      };
    }

    return this.api.post<OnlineLevelSummary>('/levels', {
      level: JSON.parse(levelSerializer.serialize(level, false)),
    });
  }

  async update(levelId: string, level: LevelData): Promise<ApiResult<OnlineLevelSummary>> {
    return this.api.put<OnlineLevelSummary>(`/levels/${encodeURIComponent(levelId)}`, {
      level: JSON.parse(levelSerializer.serialize(level, false)),
    });
  }

  async unpublish(levelId: string): Promise<ApiResult<void>> {
    return this.api.delete<void>(`/levels/${encodeURIComponent(levelId)}`);
  }

  async like(levelId: string): Promise<ApiResult<{ likes: number }>> {
    return this.api.post<{ likes: number }>(`/levels/${encodeURIComponent(levelId)}/like`, {});
  }

  /** Ratings are 1..5; anything else is refused before it reaches the network. */
  async rate(levelId: string, stars: number): Promise<ApiResult<{ rating: number }>> {
    const clamped = Math.round(Math.min(5, Math.max(1, stars)));
    return this.api.post<{ rating: number }>(`/levels/${encodeURIComponent(levelId)}/rate`, {
      stars: clamped,
    });
  }
}

export const levelService = new LevelService();
