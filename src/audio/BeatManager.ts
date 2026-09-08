import { EventBus } from '@/utils/EventBus';
import { beatDuration } from '@/utils/TimeUtils';

export interface BeatEvents extends Record<string, unknown> {
  /** Fires once per quarter note. */
  beat: { beat: number; bar: number; beatInBar: number; strength: number };
  /** Fires once per bar of four beats. */
  bar: { bar: number };
  /** Fires on every sixteenth note, for fine-grained effects. */
  subdivision: { subdivision: number; beat: number };
}

/**
 * Turns a song position into beat, bar and subdivision events.
 *
 * The manager is driven by the music clock, never by a timer: `update` is
 * handed the current song position and works out which beats have been crossed
 * since the last call. That means a frame drop delays the *visual* response by
 * one frame but never causes a beat to be skipped or double-counted, and the
 * beat number always matches what the player is hearing.
 */
export class BeatManager {
  readonly events = new EventBus<BeatEvents>();

  private bpm = 128;
  private offsetSeconds = 0;

  /** Highest beat index already emitted; -1 before the song starts. */
  private lastBeat = -1;
  private lastSubdivision = -1;
  private lastBar = -1;

  /** Song position at the previous update, for computing the interval crossed. */
  private lastPosition = 0;

  /** Seconds since the most recent beat; drives the pulse the visuals read. */
  private sinceBeat = 0;

  configure(bpm: number, offsetSeconds = 0): void {
    this.bpm = bpm > 0 ? bpm : 128;
    this.offsetSeconds = offsetSeconds;
    this.reset();
  }

  /** Clears the emitted-beat history, e.g. when restarting a level. */
  reset(): void {
    this.lastBeat = -1;
    this.lastSubdivision = -1;
    this.lastBar = -1;
    this.lastPosition = 0;
    this.sinceBeat = 0;
  }

  /**
   * Advances to `songPosition`, emitting every beat crossed since the last call.
   *
   * `dt` is only used for the decaying pulse value; the beat arithmetic uses the
   * song position alone, which is why it is immune to frame-rate variation.
   */
  update(songPosition: number, dt: number): void {
    const spb = beatDuration(this.bpm);
    if (spb <= 0) return;

    const position = songPosition - this.offsetSeconds;

    // A backwards jump means the track looped or the player seeked; start fresh
    // from the new position rather than replaying hundreds of beats.
    if (position < this.lastPosition - spb) {
      this.lastBeat = Math.floor(position / spb) - 1;
      this.lastSubdivision = Math.floor(position / (spb / 4)) - 1;
      this.lastBar = Math.floor(position / (spb * 4)) - 1;
    }
    this.lastPosition = position;
    this.sinceBeat += dt;

    const currentBeat = Math.floor(position / spb);
    const currentSubdivision = Math.floor(position / (spb / 4));

    // Emit every crossed subdivision in order. Capped so a long stall (a tab
    // in the background) cannot flood the event bus on the frame it resumes.
    const maxCatchUp = 16;
    let subdivision = Math.max(this.lastSubdivision + 1, currentSubdivision - maxCatchUp);
    for (; subdivision <= currentSubdivision; subdivision += 1) {
      if (subdivision < 0) continue;
      this.events.emit('subdivision', {
        subdivision,
        beat: Math.floor(subdivision / 4),
      });
    }
    this.lastSubdivision = currentSubdivision;

    let beat = Math.max(this.lastBeat + 1, currentBeat - maxCatchUp);
    for (; beat <= currentBeat; beat += 1) {
      if (beat < 0) continue;

      const bar = Math.floor(beat / 4);
      const beatInBar = beat % 4;
      // The downbeat is emphasised; visuals scale their response by this.
      const strength = beatInBar === 0 ? 1 : beatInBar === 2 ? 0.7 : 0.45;

      this.sinceBeat = 0;
      this.events.emit('beat', { beat, bar, beatInBar, strength });

      if (bar !== this.lastBar) {
        this.lastBar = bar;
        this.events.emit('bar', { bar });
      }
    }
    this.lastBeat = currentBeat;
  }

  /**
   * How far through the current beat the song is, 0 at the beat and 1 just
   * before the next. Visuals use this to pulse continuously rather than
   * stepping.
   */
  get beatPhase(): number {
    const spb = beatDuration(this.bpm);
    if (spb <= 0) return 0;
    const position = this.lastPosition;
    return (((position % spb) + spb) % spb) / spb;
  }

  /** A 1-to-0 decay since the last beat, the value most effects want. */
  get pulse(): number {
    const spb = beatDuration(this.bpm);
    if (spb <= 0) return 0;
    return Math.max(0, 1 - this.sinceBeat / spb);
  }

  get currentBeat(): number {
    return this.lastBeat;
  }

  get currentBar(): number {
    return this.lastBar;
  }

  get beatsPerMinute(): number {
    return this.bpm;
  }

  /** Song position of a given beat index, for scheduling ahead. */
  timeOfBeat(beat: number): number {
    return beat * beatDuration(this.bpm) + this.offsetSeconds;
  }
}
