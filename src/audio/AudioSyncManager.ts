import { AUDIO } from '@/config/constants';
import { logger } from '@/utils/Logger';
import type { AudioManager } from './AudioManager';
import { BeatManager } from './BeatManager';
import { MusicManager } from './MusicManager';

/**
 * Keeps gameplay time and song time locked together.
 *
 * The problem this solves: gameplay runs on a fixed-step simulation clock,
 * music runs on the audio hardware clock, and the two drift — the sound card's
 * idea of a second is not exactly the CPU's. Left alone, a two-minute level
 * ends visibly out of time with its music.
 *
 * The fix is to treat the audio clock as authoritative and correct gameplay
 * time toward it gradually. Snapping would be accurate but would make obstacles
 * appear to jump; a slow correction is imperceptible and converges long before
 * the error becomes audible.
 */
export class AudioSyncManager {
  readonly music: MusicManager;
  readonly beats: BeatManager;

  /** Gameplay's own clock, in seconds since the level started. */
  private gameplayTime = 0;

  /** Song position at the last resync, used to detect a stalled music clock. */
  private lastSongPosition = 0;
  private timeSinceResync = 0;

  /** Current correction being applied, in seconds per second. */
  private drift = 0;

  private running = false;
  private levelDuration = 0;

  constructor(audio: AudioManager) {
    this.music = new MusicManager(audio);
    this.beats = new BeatManager();
  }

  /** Prepares a level's track. Call during level load, before `start`. */
  prepare(songKey: string, bpm: number, durationSeconds: number, offsetMs = 0): void {
    this.music.prepare(songKey);
    this.music.setOffsetMs(offsetMs);
    this.beats.configure(bpm);
    this.levelDuration = durationSeconds;
    this.reset();
  }

  /** Starts the song and the clock together from `fromSeconds`. */
  start(songKey: string, fromSeconds = 0): void {
    this.gameplayTime = fromSeconds;
    this.lastSongPosition = fromSeconds;
    this.timeSinceResync = 0;
    this.drift = 0;
    this.running = true;

    if (!this.music.play(songKey, fromSeconds, false)) {
      // No audio (context blocked, or Web Audio unavailable): the level still
      // has to be playable, so gameplay time simply runs free.
      logger.warn('AudioSyncManager', 'Music did not start; running on the gameplay clock alone');
    }
  }

  reset(): void {
    this.gameplayTime = 0;
    this.lastSongPosition = 0;
    this.timeSinceResync = 0;
    this.drift = 0;
    this.running = false;
    this.beats.reset();
  }

  pause(): void {
    this.running = false;
    this.music.pause();
  }

  resume(): void {
    this.running = true;
    this.music.resume();
    // The music restarts from where it paused; realign gameplay time to it
    // rather than the other way round.
    this.gameplayTime = this.music.linearPosition;
  }

  stop(): void {
    this.running = false;
    this.music.stop();
  }

  /** Moves both clocks to `seconds`. Used by practice checkpoints. */
  seek(seconds: number): void {
    this.gameplayTime = Math.max(0, seconds);
    this.music.seek(this.gameplayTime);
    this.beats.reset();
    this.lastSongPosition = this.gameplayTime;
    this.timeSinceResync = 0;
    this.drift = 0;
  }

  /**
   * Advances the shared clock by one frame.
   *
   * `dt` is the real frame delta. Gameplay time advances by `dt` plus the
   * current drift correction, so the correction is spread smoothly across
   * frames instead of arriving as a jump.
   */
  update(dt: number): void {
    if (!this.running) return;

    this.gameplayTime += dt + this.drift * dt;
    this.timeSinceResync += dt;

    if (this.timeSinceResync >= AUDIO.RESYNC_INTERVAL) {
      this.resync();
      this.timeSinceResync = 0;
    }

    this.beats.update(this.songTime, dt);
  }

  /**
   * Compares the two clocks and sets the correction rate.
   *
   * A large error means something discontinuous happened (the tab was
   * backgrounded, the player alt-tabbed): correcting that gradually would take
   * minutes, so it is applied at once. A small error is spread over the next
   * interval.
   */
  private resync(): void {
    if (!this.music.isPlaying) {
      this.drift = 0;
      return;
    }

    const songPosition = this.music.linearPosition;

    // The music clock not advancing means playback stalled; do not chase it.
    if (Math.abs(songPosition - this.lastSongPosition) < 0.001) {
      this.drift = 0;
      return;
    }
    this.lastSongPosition = songPosition;

    const error = songPosition - this.gameplayTime;

    if (Math.abs(error) > 0.25) {
      logger.debug('AudioSyncManager', `Hard resync, error ${error.toFixed(3)}s`);
      this.gameplayTime = songPosition;
      this.drift = 0;
      return;
    }

    // Spread the remaining error across the next interval, capped so the
    // correction never becomes fast enough to see.
    const rate = error / AUDIO.RESYNC_INTERVAL;
    this.drift = Math.max(-0.05, Math.min(0.05, rate));
  }

  /**
   * The authoritative time for everything beat-related.
   *
   * While music is playing this is the song's own position; without music it
   * falls back to the gameplay clock so triggers keyed to time still fire.
   */
  get songTime(): number {
    return this.music.isPlaying ? this.music.linearPosition : this.gameplayTime;
  }

  /** The clock gameplay integrates against, corrected toward the song. */
  get time(): number {
    return this.gameplayTime;
  }

  /** 0..1 through the level, by time. */
  get progress(): number {
    if (this.levelDuration <= 0) return 0;
    return Math.max(0, Math.min(1, this.songTime / this.levelDuration));
  }

  /** How far the two clocks are apart right now, for the debug overlay. */
  get syncError(): number {
    return this.music.isPlaying ? this.music.linearPosition - this.gameplayTime : 0;
  }

  destroy(): void {
    this.music.destroy();
    this.beats.events.clear();
  }
}
