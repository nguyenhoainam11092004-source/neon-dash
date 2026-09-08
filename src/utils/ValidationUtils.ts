/**
 * Small type guards and coercions used wherever untrusted data enters the game:
 * saved games, imported level JSON, and API responses.
 *
 * Everything here is defensive on purpose. A malformed level must produce a
 * clear validation message, never a runtime crash halfway through a scene.
 */

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/** Narrows `value` to one of `allowed`, which must be a tuple of literals. */
export function isOneOf<T extends readonly string[]>(
  value: unknown,
  allowed: T,
): value is T[number] {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

/** Returns `value` when it is a finite number, otherwise `fallback`. */
export function toNumber(value: unknown, fallback: number): number {
  return isFiniteNumber(value) ? value : fallback;
}

/** Returns `value` clamped into [min, max], or `fallback` when not a number. */
export function toClampedNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!isFiniteNumber(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

export function toStringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

export function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Returns `value` when it is one of `allowed`, otherwise `fallback`. */
export function toEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  return isOneOf(value, allowed) ? value : fallback;
}

/** Returns `value` when it is an array, otherwise an empty array. */
export function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Parses JSON without throwing.
 *
 * Callers get a discriminated result so they can surface a real error message
 * instead of letting a SyntaxError escape into a scene's create().
 */
export function safeJsonParse<T = unknown>(
  text: string,
): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown JSON parse error',
    };
  }
}

/** Serialises without throwing on cycles or BigInt. */
export function safeJsonStringify(
  value: unknown,
  space?: number,
): { ok: true; value: string } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.stringify(value, null, space) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown JSON stringify error',
    };
  }
}

/**
 * Removes combining accent marks left behind by NFD normalisation.
 *
 * Written as a code-point scan rather than a regex so the source file stays
 * free of literal control and combining characters.
 */
function stripCombiningMarks(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x0300 && code <= 0x036f) continue;
    out += ch;
  }
  return out;
}

/**
 * Strips characters that would break a filename or a URL slug.
 * Applied to level names before they are used as download filenames.
 */
export function slugify(input: string): string {
  return stripCombiningMarks(input.toLowerCase().normalize('NFD'))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/**
 * Trims user-supplied display text to a hard length and drops C0/C1 control
 * characters. Level names and creator names both pass through this before
 * being rendered or sent to an API.
 */
export function sanitizeText(input: unknown, maxLength = 64): string {
  if (typeof input !== 'string') return '';
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    const isC0 = code < 0x20;
    const isC1 = code >= 0x7f && code <= 0x9f;
    if (isC0 || isC1) continue;
    out += ch;
  }
  return out.trim().slice(0, maxLength);
}

/** Generates a short, collision-resistant id for objects and triggers. */
export function generateId(prefix = 'obj'): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${time}${rand}`;
}

/** Structured deep clone that works for the plain-data shapes used in levels. */
export function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
