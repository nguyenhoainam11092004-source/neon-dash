import { DIFFICULTIES, SPEED } from '@/config/constants';
import {
  EASINGS,
  GAME_MODES,
  OBJECT_TYPES,
  TRIGGER_TYPES,
  type LevelData,
  type ValidationIssue,
  type ValidationResult,
} from '@/types/LevelTypes';
import { isFiniteNumber, isNonEmptyString, isObject, isOneOf } from '@/utils/ValidationUtils';

/**
 * Checks a level document before it is played, saved or published.
 *
 * The validator reports rather than throws, and grades each finding, because
 * the editor needs to show a creator everything that is wrong at once. An ERROR
 * means the level cannot be loaded; a WARNING means it will load but is
 * probably not what the author intended.
 */

/** Coordinates outside this range are almost certainly a mistake or an attack. */
const COORDINATE_LIMIT = 5_000_000;
const MAX_OBJECTS = 50_000;
const MAX_TRIGGERS = 20_000;
const MIN_BPM = 20;
const MAX_BPM = 400;

export class LevelValidator {
  /** Validates a parsed document that has not yet been trusted as a LevelData. */
  validate(raw: unknown): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!isObject(raw)) {
      return {
        status: 'ERROR',
        issues: [{ severity: 'error', path: '', message: 'Level must be a JSON object' }],
      };
    }

    this.checkMetadata(raw, issues);
    const objectIds = this.checkObjects(raw, issues);
    this.checkTriggers(raw, issues, objectIds);
    this.checkPlayability(raw, issues);

    return { status: LevelValidator.grade(issues), issues };
  }

  /** The worst severity present decides the overall status. */
  private static grade(issues: ValidationIssue[]): ValidationResult['status'] {
    if (issues.some((issue) => issue.severity === 'error')) return 'ERROR';
    if (issues.some((issue) => issue.severity === 'warning')) return 'WARNING';
    return 'PASS';
  }

  private checkMetadata(raw: Record<string, unknown>, issues: ValidationIssue[]): void {
    if (!isNonEmptyString(raw.id)) {
      issues.push({ severity: 'error', path: 'id', message: 'Level id is required' });
    }
    if (!isNonEmptyString(raw.name)) {
      issues.push({ severity: 'error', path: 'name', message: 'Level name is required' });
    }
    if (!isNonEmptyString(raw.creator)) {
      issues.push({ severity: 'warning', path: 'creator', message: 'Creator name is missing' });
    }

    if (!isOneOf(raw.difficulty, DIFFICULTIES)) {
      issues.push({
        severity: 'warning',
        path: 'difficulty',
        message: `Difficulty should be one of: ${DIFFICULTIES.join(', ')}`,
      });
    }

    if (!isFiniteNumber(raw.bpm)) {
      issues.push({ severity: 'error', path: 'bpm', message: 'BPM must be a number' });
    } else if (raw.bpm < MIN_BPM || raw.bpm > MAX_BPM) {
      issues.push({
        severity: 'error',
        path: 'bpm',
        message: `BPM ${raw.bpm} is outside the supported range ${MIN_BPM}-${MAX_BPM}`,
      });
    }

    if (!isNonEmptyString(raw.song)) {
      issues.push({
        severity: 'warning',
        path: 'song',
        message: 'No song specified; the level will play in silence',
      });
    }

    if (!isFiniteNumber(raw.duration) || raw.duration <= 0) {
      issues.push({
        severity: 'error',
        path: 'duration',
        message: 'Duration must be a positive number of seconds',
      });
    }

    if (raw.startMode !== undefined && !isOneOf(raw.startMode, GAME_MODES)) {
      issues.push({
        severity: 'error',
        path: 'startMode',
        message: `Unknown start mode "${String(raw.startMode)}"`,
      });
    }

    const speedTiers = Object.keys(SPEED.MULTIPLIERS);
    if (raw.startSpeed !== undefined && !speedTiers.includes(String(raw.startSpeed))) {
      issues.push({
        severity: 'error',
        path: 'startSpeed',
        message: `Unknown start speed "${String(raw.startSpeed)}"`,
      });
    }

    for (const key of ['startX', 'startY', 'groundY', 'ceilingY'] as const) {
      const value = raw[key];
      if (value !== undefined && !isFiniteNumber(value)) {
        issues.push({ severity: 'error', path: key, message: `${key} must be a number` });
      }
    }

    if (
      isFiniteNumber(raw.groundY) &&
      isFiniteNumber(raw.ceilingY) &&
      raw.ceilingY >= raw.groundY
    ) {
      issues.push({
        severity: 'error',
        path: 'ceilingY',
        message: 'Ceiling must be above the ground (a smaller y value)',
      });
    }
  }

  /** Validates the object list and returns the set of ids it defines. */
  private checkObjects(raw: Record<string, unknown>, issues: ValidationIssue[]): Set<string> {
    const ids = new Set<string>();

    if (!Array.isArray(raw.objects)) {
      issues.push({ severity: 'error', path: 'objects', message: 'objects must be an array' });
      return ids;
    }

    if (raw.objects.length > MAX_OBJECTS) {
      issues.push({
        severity: 'error',
        path: 'objects',
        message: `Level has ${raw.objects.length} objects; the limit is ${MAX_OBJECTS}`,
      });
      return ids;
    }

    raw.objects.forEach((entry, index) => {
      const path = `objects[${index}]`;

      if (!isObject(entry)) {
        issues.push({ severity: 'error', path, message: 'Object must be a JSON object' });
        return;
      }

      if (!isNonEmptyString(entry.id)) {
        issues.push({ severity: 'error', path: `${path}.id`, message: 'Object id is required' });
      } else if (ids.has(entry.id)) {
        // Duplicate ids break trigger targeting silently, so this is fatal.
        issues.push({
          severity: 'error',
          path: `${path}.id`,
          message: `Duplicate object id "${entry.id}"`,
        });
      } else {
        ids.add(entry.id);
      }

      if (!isOneOf(entry.type, OBJECT_TYPES)) {
        issues.push({
          severity: 'error',
          path: `${path}.type`,
          message: `Unknown object type "${String(entry.type)}"`,
        });
      }

      for (const axis of ['x', 'y'] as const) {
        const value = entry[axis];
        if (!isFiniteNumber(value)) {
          issues.push({
            severity: 'error',
            path: `${path}.${axis}`,
            message: `${axis} must be a finite number`,
          });
        } else if (Math.abs(value) > COORDINATE_LIMIT) {
          issues.push({
            severity: 'error',
            path: `${path}.${axis}`,
            message: `${axis} of ${value} is out of range`,
          });
        }
      }

      if (entry.scale !== undefined) {
        if (!isFiniteNumber(entry.scale) || entry.scale <= 0) {
          issues.push({
            severity: 'error',
            path: `${path}.scale`,
            message: 'scale must be a positive number',
          });
        } else if (entry.scale > 20) {
          issues.push({
            severity: 'warning',
            path: `${path}.scale`,
            message: `scale of ${entry.scale} is unusually large`,
          });
        }
      }

      if (entry.rotation !== undefined && !isFiniteNumber(entry.rotation)) {
        issues.push({
          severity: 'error',
          path: `${path}.rotation`,
          message: 'rotation must be a number',
        });
      }
    });

    return ids;
  }

  private checkTriggers(
    raw: Record<string, unknown>,
    issues: ValidationIssue[],
    objectIds: Set<string>,
  ): void {
    if (raw.triggers === undefined) return;

    if (!Array.isArray(raw.triggers)) {
      issues.push({ severity: 'error', path: 'triggers', message: 'triggers must be an array' });
      return;
    }

    if (raw.triggers.length > MAX_TRIGGERS) {
      issues.push({
        severity: 'error',
        path: 'triggers',
        message: `Level has ${raw.triggers.length} triggers; the limit is ${MAX_TRIGGERS}`,
      });
      return;
    }

    const triggerIds = new Set<string>();

    raw.triggers.forEach((entry, index) => {
      const path = `triggers[${index}]`;

      if (!isObject(entry)) {
        issues.push({ severity: 'error', path, message: 'Trigger must be a JSON object' });
        return;
      }

      if (isNonEmptyString(entry.id)) {
        if (triggerIds.has(entry.id)) {
          issues.push({
            severity: 'warning',
            path: `${path}.id`,
            message: `Duplicate trigger id "${entry.id}"`,
          });
        }
        triggerIds.add(entry.id);
      }

      if (!isOneOf(entry.type, TRIGGER_TYPES)) {
        issues.push({
          severity: 'error',
          path: `${path}.type`,
          message: `Unknown trigger type "${String(entry.type)}"`,
        });
      }

      const targetsObject = isNonEmptyString(entry.target);
      const targetsGroup = isFiniteNumber(entry.group);
      // Camera and shake act on the scene, so they legitimately have no target.
      const needsTarget =
        entry.type !== 'camera' && entry.type !== 'shake' && entry.type !== 'zoom';

      if (needsTarget && !targetsObject && !targetsGroup) {
        issues.push({
          severity: 'error',
          path: `${path}.target`,
          message: `A "${String(entry.type)}" trigger needs a target object or group`,
        });
      }

      if (targetsObject && !objectIds.has(entry.target as string)) {
        issues.push({
          severity: 'error',
          path: `${path}.target`,
          message: `Trigger targets "${String(entry.target)}", which no object defines`,
        });
      }

      for (const key of ['delay', 'duration'] as const) {
        const value = entry[key];
        if (value !== undefined && (!isFiniteNumber(value) || value < 0)) {
          issues.push({
            severity: 'error',
            path: `${path}.${key}`,
            message: `${key} must be zero or a positive number of seconds`,
          });
        }
      }

      if (entry.easing !== undefined && !isOneOf(entry.easing, EASINGS)) {
        issues.push({
          severity: 'warning',
          path: `${path}.easing`,
          message: `Unknown easing "${String(entry.easing)}"; linear will be used`,
        });
      }

      if (entry.value !== undefined && !isObject(entry.value)) {
        issues.push({
          severity: 'error',
          path: `${path}.value`,
          message: 'value must be an object',
        });
      }
    });
  }

  /** Checks that the level is actually finishable, as far as data can tell. */
  private checkPlayability(raw: Record<string, unknown>, issues: ValidationIssue[]): void {
    if (!Array.isArray(raw.objects)) return;

    const hasFinish = raw.objects.some((entry) => isObject(entry) && entry.type === 'finish');

    if (!hasFinish) {
      issues.push({
        severity: 'warning',
        path: 'objects',
        message: 'No finish object; the level ends when the song does',
      });
    }

    const solidCount = raw.objects.filter(
      (entry) => isObject(entry) && (entry.type === 'block' || entry.type === 'platform'),
    ).length;

    if (solidCount === 0) {
      issues.push({
        severity: 'info',
        path: 'objects',
        message: 'Level has no solid geometry; the player will run along the ground',
      });
    }
  }

  /** Convenience: true when the document is safe to load. */
  isLoadable(raw: unknown): raw is LevelData {
    return this.validate(raw).status !== 'ERROR';
  }
}

export const levelValidator = new LevelValidator();
