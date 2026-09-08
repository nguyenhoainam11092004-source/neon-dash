import type { LevelData, ValidationResult } from '@/types/LevelTypes';
import { logger } from '@/utils/Logger';
import { safeJsonParse } from '@/utils/ValidationUtils';
import { levelSerializer } from './LevelSerializer';
import { levelValidator } from './LevelValidator';

/** What loading produced: a level, or a readable reason it could not be loaded. */
export type LoadResult =
  | { ok: true; level: LevelData; validation: ValidationResult }
  | { ok: false; error: string; validation?: ValidationResult };

/**
 * Turns a JSON document into a playable LevelData.
 *
 * Every path into the game goes through here — the bundled levels, a file the
 * player imported, a level downloaded from the API — so validation cannot be
 * skipped by accident on any of them. A level that fails is reported, never
 * thrown: a bad file in a level list must not stop the other levels loading.
 */
export class LevelLoader {
  /** Validates and normalises an already-parsed document. */
  fromObject(raw: unknown): LoadResult {
    const validation = levelValidator.validate(raw);

    if (validation.status === 'ERROR') {
      const first = validation.issues.find((issue) => issue.severity === 'error');
      return {
        ok: false,
        error: first ? `${first.path || 'level'}: ${first.message}` : 'Level failed validation',
        validation,
      };
    }

    try {
      const level = levelSerializer.parse(raw);

      if (validation.status === 'WARNING') {
        for (const issue of validation.issues) {
          if (issue.severity === 'warning') {
            logger.warn('LevelLoader', `${level.id} - ${issue.path}: ${issue.message}`);
          }
        }
      }

      return { ok: true, level, validation };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown parse failure',
        validation,
      };
    }
  }

  /** Validates and normalises a JSON string, e.g. from an imported file. */
  fromJson(json: string): LoadResult {
    const parsed = safeJsonParse<unknown>(json);
    if (!parsed.ok) {
      return { ok: false, error: `Not valid JSON: ${parsed.error}` };
    }
    return this.fromObject(parsed.value);
  }

  /**
   * Fetches a level file over the network.
   *
   * Errors are returned rather than thrown so a failed download shows a message
   * in the level list instead of an unhandled rejection in the console.
   */
  async fromUrl(url: string, signal?: AbortSignal): Promise<LoadResult> {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status} loading ${url}` };
      }
      const text = await response.text();
      return this.fromJson(text);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { ok: false, error: 'Load cancelled' };
      }
      return {
        ok: false,
        error: error instanceof Error ? error.message : `Could not fetch ${url}`,
      };
    }
  }
}

export const levelLoader = new LevelLoader();
