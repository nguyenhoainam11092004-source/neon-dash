import { logger } from '@/utils/Logger';
import { clamp01 } from '@/utils/MathUtils';
import type { AudioManager } from './AudioManager';
import { getSong, renderSong, type SongDefinition } from './SongLibrary';

/**
 * Plays a level's track and reports where in it the playhead is.
 *
 * The class exists to answer one question accurately: "what second of the song
 * is the player hearing *right now*?" Everything else — starting, seeking,
 * pausing — is arranged so that answer stays correct, because the whole rhythm
 * layer is built on it.
 */
export class MusicManager {
  private readonly audio: AudioManager;

  /** Rendered buffers, keyed by song. Rendering is not cheap; caching is. */
  private readonly buffers = new Map<string, AudioBuffer>();

  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private song: SongDefinition | null = null;

  /** Audio-clock time at which song position 0 occurred. */
  private startedAt = 0;
  /** Song position the current source began from, in seconds. */
  private startOffset = 0;
  private playing = false;
  private pausedAt = 0;

  /** Player-configured latency compensation, in seconds. */
  private offset = 0;

  constructor(audio: AudioManager) {
    this.audio = audio;
  }

  /**
   * Renders a song into a buffer if it is not cached already.
   *
   * Rendering a two-minute stereo track takes a few tens of milliseconds, which
   * is why it happens during level load rather than on the first beat.
   */
  prepare(songKey: string): AudioBuffer | null {
    const context = this.audio.audioContext;
    if (!context) return null;

    const cached = this.buffers.get(songKey);
    if (cached) return cached;

    const definition = getSong(songKey);
    try {
      const started = performance.now();
      const buffer = renderSong(context, definition);
      this.buffers.set(songKey, buffer);
      logger.debug(
        'MusicManager',
        `Rendered "${definition.title}" in ${Math.round(performance.now() - started)} ms`,
      );
      return buffer;
    } catch (error) {
      logger.error('MusicManager', `Could not render song "${songKey}"`, error);
      return null;
    }
  }

  /** Sets latency compensation in milliseconds, from the settings screen. */
  setOffsetMs(milliseconds: number): void {
    this.offset = milliseconds / 1000;
  }

  /**
   * Starts a song from `fromSeconds`.
   *
   * A buffer source can only be started once, so seeking means creating a new
   * one; that is the normal Web Audio pattern and is cheap.
   */
  play(songKey: string, fromSeconds = 0, loop = true): boolean {
    const context = this.audio.audioContext;
    const bus = this.audio.bus('music');
    if (!context || !bus) return false;

    const buffer = this.prepare(songKey);
    if (!buffer) return false;

    this.stop();

    this.song = getSong(songKey);

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;

    const gain = context.createGain();
    // Fade in over a few milliseconds; starting a buffer at full gain mid-waveform
    // produces an audible click.
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.linearRampToValueAtTime(1, context.currentTime + 0.02);

    source.connect(gain);
    gain.connect(bus);

    const offset = Math.max(0, fromSeconds % buffer.duration);
    source.start(0, offset);

    this.source = source;
    this.gain = gain;
    this.startedAt = context.currentTime;
    this.startOffset = offset;
    this.playing = true;
    this.pausedAt = 0;

    return true;
  }

  /** Stops playback and releases the source. */
  stop(): void {
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        // Already stopped; a source that never started throws here.
      }
      this.source.disconnect();
      this.source = null;
    }
    this.gain?.disconnect();
    this.gain = null;
    this.playing = false;
  }

  /** Pauses, remembering the position so `resume` continues from it. */
  pause(): void {
    if (!this.playing) return;
    this.pausedAt = this.position;
    this.stop();
  }

  resume(): void {
    if (this.playing || !this.song) return;
    this.play(this.song.key, this.pausedAt);
  }

  /** Jumps to a position, used by practice checkpoints and the editor timeline. */
  seek(seconds: number): void {
    if (!this.song) return;
    const wasPlaying = this.playing;
    this.stop();
    if (wasPlaying) this.play(this.song.key, Math.max(0, seconds));
    else this.pausedAt = Math.max(0, seconds);
  }

  /**
   * The current song position in seconds, as the player hears it.
   *
   * Derived from the audio hardware clock, never from a frame counter or a
   * timer. `offset` shifts it to compensate for output latency the browser does
   * not report.
   */
  get position(): number {
    if (!this.playing) return this.pausedAt;

    const context = this.audio.audioContext;
    if (!context || !this.source?.buffer) return this.pausedAt;

    const elapsed = context.currentTime - this.startedAt;
    const raw = this.startOffset + elapsed + this.offset;

    if (!this.source.loop) return Math.max(0, raw);
    // Wrap so a looping track reports a position within the buffer, which is
    // what the beat manager expects.
    const duration = this.source.buffer.duration;
    return duration > 0 ? ((raw % duration) + duration) % duration : Math.max(0, raw);
  }

  /** Position without loop wrapping; used for level progress on long tracks. */
  get linearPosition(): number {
    if (!this.playing) return this.pausedAt;
    const context = this.audio.audioContext;
    if (!context) return this.pausedAt;
    return this.startOffset + (context.currentTime - this.startedAt) + this.offset;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get currentSong(): SongDefinition | null {
    return this.song;
  }

  get duration(): number {
    return this.source?.buffer?.duration ?? 0;
  }

  /** Fades the music out over `seconds`, e.g. on death. */
  fadeOut(seconds: number): void {
    const context = this.audio.audioContext;
    if (!context || !this.gain) {
      this.stop();
      return;
    }

    const now = context.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(Math.max(0.0001, this.gain.gain.value), now);
    this.gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.01, seconds));

    const source = this.source;
    window.setTimeout(
      () => {
        if (this.source === source) this.stop();
      },
      seconds * 1000 + 40,
    );
  }

  /** Temporarily changes playback rate; used for the death slow-down. */
  setPlaybackRate(rate: number): void {
    if (!this.source) return;
    this.source.playbackRate.value = Math.max(0.05, rate);
  }

  setVolume(value: number): void {
    this.audio.setVolume('music', clamp01(value));
  }

  destroy(): void {
    this.stop();
    this.buffers.clear();
    this.song = null;
  }
}
