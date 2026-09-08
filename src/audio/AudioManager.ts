import { AUDIO } from '@/config/constants';
import { logger } from '@/utils/Logger';
import { clamp01 } from '@/utils/MathUtils';

/** The mixer buses volume settings map onto. */
export type AudioBus = 'music' | 'sfx';

export interface SfxOptions {
  /** Playback rate; 1 is the recorded pitch. */
  rate?: number;
  /** Extra gain on top of the bus volume, 0..1. */
  volume?: number;
  /** -1 hard left, 1 hard right. */
  pan?: number;
}

/**
 * Owns the Web Audio graph and every sound effect.
 *
 * Effects are synthesised on demand rather than loaded, which keeps them
 * original and lets them follow the player's state — a jump at a faster speed
 * tier really is a higher-pitched sound, not the same file replayed.
 *
 * The graph is built once:
 *
 *   source -> busGain(music|sfx) -> masterGain -> destination
 *
 * so a volume change is a single parameter write and never restarts anything.
 */
export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buses = new Map<AudioBus, GainNode>();

  private volumes: Record<'master' | AudioBus, number> = {
    master: AUDIO.DEFAULT_MASTER_VOLUME,
    music: AUDIO.DEFAULT_MUSIC_VOLUME,
    sfx: AUDIO.DEFAULT_SFX_VOLUME,
  };

  private unlocked = false;

  /**
   * Creates the context.
   *
   * Browsers start an AudioContext suspended until a user gesture, so this is
   * safe to call at boot; `unlock` is what actually starts it.
   */
  init(): AudioContext | null {
    if (this.context) return this.context;

    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!Ctor) {
        logger.warn('AudioManager', 'Web Audio is unavailable; the game will run silently');
        return null;
      }

      this.context = new Ctor({ latencyHint: 'interactive' });

      this.master = this.context.createGain();
      this.master.gain.value = this.volumes.master;
      this.master.connect(this.context.destination);

      for (const bus of ['music', 'sfx'] as const) {
        const gain = this.context.createGain();
        gain.gain.value = this.volumes[bus];
        gain.connect(this.master);
        this.buses.set(bus, gain);
      }

      this.unlocked = (this.context.state as string) === 'running';
      logger.info('AudioManager', `Audio context created at ${this.context.sampleRate} Hz`);
      return this.context;
    } catch (error) {
      logger.error('AudioManager', 'Could not create an audio context', error);
      return null;
    }
  }

  /** Resumes the context. Must be called from a user gesture handler. */
  async unlock(): Promise<boolean> {
    const context = this.init();
    if (!context) return false;

    if (context.state === 'running') {
      this.unlocked = true;
      return true;
    }

    try {
      await context.resume();
      this.unlocked = (context.state as AudioContextState) === 'running';
      if (this.unlocked) logger.info('AudioManager', 'Audio unlocked');
      return this.unlocked;
    } catch (error) {
      logger.warn('AudioManager', 'Audio could not be unlocked yet', error);
      return false;
    }
  }

  get isUnlocked(): boolean {
    return this.unlocked && this.context?.state === 'running';
  }

  get audioContext(): AudioContext | null {
    return this.context;
  }

  /** The node a music source should connect to. */
  bus(name: AudioBus): GainNode | null {
    return this.buses.get(name) ?? null;
  }

  /**
   * The audio hardware's clock, in seconds.
   *
   * This is the only clock gameplay synchronisation is allowed to trust: it
   * advances with the sound card rather than with the render loop, so it cannot
   * drift away from what the player is hearing.
   */
  get currentTime(): number {
    return this.context?.currentTime ?? 0;
  }

  /** Round-trip latency reported by the browser, in seconds. */
  get outputLatency(): number {
    if (!this.context) return 0;
    const context = this.context as AudioContext & { outputLatency?: number };
    return context.outputLatency ?? context.baseLatency ?? 0;
  }

  setVolume(target: 'master' | AudioBus, value: number): void {
    const volume = clamp01(value);
    this.volumes[target] = volume;

    const node = target === 'master' ? this.master : this.buses.get(target);
    if (!node || !this.context) return;

    // Ramp rather than jump: an instantaneous gain change is audible as a click.
    const now = this.context.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(volume, now + 0.02);
  }

  getVolume(target: 'master' | AudioBus): number {
    return this.volumes[target];
  }

  // ---------- Sound effects ----------

  /**
   * Plays a synthesised effect.
   *
   * Each call builds a tiny throwaway graph. That sounds wasteful, but Web Audio
   * nodes are designed for exactly this: they are cheap, and letting them be
   * collected after they stop is simpler and more reliable than pooling.
   */
  play(name: SfxName, options: SfxOptions = {}): void {
    const context = this.context;
    const bus = this.buses.get('sfx');
    if (!context || !bus || !this.isUnlocked) return;

    const spec = SFX[name];
    if (!spec) return;

    const now = context.currentTime;
    const rate = options.rate ?? 1;
    const volume = clamp01(options.volume ?? 1);

    const output = context.createGain();
    output.gain.value = volume;

    if (options.pan !== undefined && typeof context.createStereoPanner === 'function') {
      const panner = context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, options.pan));
      output.connect(panner);
      panner.connect(bus);
    } else {
      output.connect(bus);
    }

    spec(context, output, now, rate);
  }

  /** Stops everything and releases the context. */
  destroy(): void {
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.buses.clear();
    this.unlocked = false;
  }
}

/**
 * The sound-effect library.
 *
 * Each entry schedules its own oscillators and envelopes against the audio
 * clock, which is what makes them sample-accurate regardless of frame rate.
 */
type SfxSpec = (context: AudioContext, destination: AudioNode, now: number, rate: number) => void;

/** A pitched blip with an exponential decay. */
function blip(
  context: AudioContext,
  destination: AudioNode,
  now: number,
  from: number,
  to: number,
  duration: number,
  type: OscillatorType,
  peak: number,
): void {
  const osc = context.createOscillator();
  const gain = context.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(from, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + duration);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

/** A filtered noise burst, for impacts and explosions. */
function noise(
  context: AudioContext,
  destination: AudioNode,
  now: number,
  duration: number,
  peak: number,
  filterFrom: number,
  filterTo: number,
): void {
  const length = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }

  const source = context.createBufferSource();
  source.buffer = buffer;

  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterFrom, now);
  filter.frequency.exponentialRampToValueAtTime(Math.max(60, filterTo), now + duration);

  const gain = context.createGain();
  gain.gain.setValueAtTime(peak, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  source.start(now);
  source.stop(now + duration + 0.02);
}

const SFX = {
  jump: (context, destination, now, rate) => {
    blip(context, destination, now, 420 * rate, 780 * rate, 0.1, 'triangle', 0.24);
  },
  land: (context, destination, now, rate) => {
    blip(context, destination, now, 200 * rate, 90 * rate, 0.09, 'sine', 0.18);
  },
  death: (context, destination, now, rate) => {
    blip(context, destination, now, 320 * rate, 48, 0.42, 'sawtooth', 0.3);
    noise(context, destination, now, 0.38, 0.34, 3400, 180);
  },
  coin: (context, destination, now, rate) => {
    blip(context, destination, now, 880 * rate, 1320 * rate, 0.07, 'square', 0.16);
    blip(context, destination, now + 0.06, 1320 * rate, 1760 * rate, 0.12, 'square', 0.14);
  },
  portal: (context, destination, now, rate) => {
    blip(context, destination, now, 260 * rate, 900 * rate, 0.24, 'sine', 0.2);
    blip(context, destination, now + 0.02, 390 * rate, 1350 * rate, 0.2, 'triangle', 0.12);
  },
  bounce: (context, destination, now, rate) => {
    blip(context, destination, now, 300 * rate, 1000 * rate, 0.13, 'square', 0.2);
  },
  finish: (context, destination, now) => {
    // An ascending arpeggio, scheduled ahead on the audio clock so the notes are
    // evenly spaced no matter what the frame rate does.
    [523, 659, 784, 1047].forEach((frequency, index) => {
      blip(context, destination, now + index * 0.09, frequency, frequency, 0.24, 'triangle', 0.2);
    });
  },
  click: (context, destination, now) => {
    blip(context, destination, now, 900, 1200, 0.04, 'square', 0.1);
  },
  hover: (context, destination, now) => {
    blip(context, destination, now, 620, 720, 0.03, 'sine', 0.05);
  },
  place: (context, destination, now) => {
    blip(context, destination, now, 480, 620, 0.05, 'triangle', 0.12);
  },
  erase: (context, destination, now) => {
    noise(context, destination, now, 0.09, 0.14, 2200, 400);
  },
  checkpoint: (context, destination, now) => {
    blip(context, destination, now, 660, 990, 0.16, 'sine', 0.16);
  },
} satisfies Record<string, SfxSpec>;

export type SfxName = keyof typeof SFX;

/** The process-wide mixer. Scenes receive it through the registry. */
export const audioManager = new AudioManager();
