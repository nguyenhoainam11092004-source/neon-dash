import { SIM } from '@/config/constants';

/**
 * Drives a fixed-timestep simulation from a variable-rate render loop.
 *
 * Rendering happens whenever the browser can; gameplay advances in constant
 * slices so physics results do not change with the refresh rate. Leftover time
 * is carried into the next frame and exposed as `alpha` for interpolation.
 */
export class FixedStepAccumulator {
  private accumulator = 0;
  private readonly fixedDt: number;
  private readonly maxTicks: number;

  constructor(fixedDt: number = SIM.FIXED_DT, maxTicks: number = SIM.MAX_TICKS_PER_FRAME) {
    this.fixedDt = fixedDt;
    this.maxTicks = maxTicks;
  }

  /** Seconds per simulation tick. */
  get step(): number {
    return this.fixedDt;
  }

  /**
   * Feeds a frame delta in and returns how many simulation ticks to run.
   *
   * A delta longer than MAX_FRAME_DELTA (tab backgrounded, GC pause) is clamped
   * rather than replayed, so the game never tries to catch up on a lost second.
   */
  advance(frameDelta: number): number {
    const delta = Math.min(Math.max(frameDelta, 0), SIM.MAX_FRAME_DELTA);
    this.accumulator += delta;

    let ticks = 0;
    while (this.accumulator >= this.fixedDt && ticks < this.maxTicks) {
      this.accumulator -= this.fixedDt;
      ticks += 1;
    }

    // Ran out of budget: drop the backlog instead of accumulating a debt that
    // would make every subsequent frame worse.
    if (ticks >= this.maxTicks) {
      this.accumulator = 0;
    }

    return ticks;
  }

  /** Fraction of a tick already elapsed, 0..1. Use to interpolate rendering. */
  get alpha(): number {
    return this.accumulator / this.fixedDt;
  }

  reset(): void {
    this.accumulator = 0;
  }
}

/**
 * A monotonic stopwatch that can be paused without losing its reading.
 *
 * Used for attempt timing and practice-mode bookkeeping, where wall-clock time
 * matters but pausing must not inflate the result.
 */
export class Stopwatch {
  private elapsedSeconds = 0;
  private running = false;

  start(): void {
    this.running = true;
  }

  pause(): void {
    this.running = false;
  }

  reset(): void {
    this.elapsedSeconds = 0;
    this.running = false;
  }

  /** Advances the watch. Call once per frame with the frame delta in seconds. */
  update(dt: number): void {
    if (this.running) this.elapsedSeconds += dt;
  }

  get elapsed(): number {
    return this.elapsedSeconds;
  }

  get isRunning(): boolean {
    return this.running;
  }
}

/** Formats seconds as "m:ss", used for song position and attempt duration. */
export function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Formats seconds as "m:ss.cc" for editor timelines that need sub-second detail. */
export function formatTimePrecise(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const cents = Math.floor((safe % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${cents.toString().padStart(2, '0')}`;
}

/** Formats a 0..1 progress value as a whole-number percentage string. */
export function formatPercent(progress: number): string {
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  return `${Math.floor(pct)}%`;
}

/** Seconds per beat at the given tempo. */
export function beatDuration(bpm: number): number {
  return bpm > 0 ? 60 / bpm : 0;
}

/** Converts a song position in seconds to a fractional beat index. */
export function timeToBeat(seconds: number, bpm: number, offset = 0): number {
  const spb = beatDuration(bpm);
  return spb > 0 ? (seconds - offset) / spb : 0;
}

/** Converts a beat index back to a song position in seconds. */
export function beatToTime(beat: number, bpm: number, offset = 0): number {
  return beat * beatDuration(bpm) + offset;
}
