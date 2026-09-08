import { createRandom } from '@/utils/MathUtils';

/**
 * The game's original soundtrack, generated rather than shipped.
 *
 * Every track is synthesised into an AudioBuffer from a written-down chord
 * progression and drum pattern. That keeps the soundtrack entirely original,
 * makes the bundle a few kilobytes rather than a few megabytes, and — the part
 * that matters for a rhythm game — guarantees the tempo is exactly the BPM the
 * level claims, with the first beat at sample zero.
 */

export interface SongDefinition {
  key: string;
  title: string;
  bpm: number;
  /** Length in bars of 4 beats. */
  bars: number;
  /** Root note in Hz. */
  root: number;
  /** Scale degrees, as semitone offsets from the root. */
  scale: number[];
  /** One entry per bar: the scale degree the bar's chord is built on. */
  progression: number[];
  /** Which sixteenth notes carry a kick, as offsets within a bar. */
  kick: number[];
  /** Which sixteenth notes carry a snare. */
  snare: number[];
  /** Which sixteenth notes carry a hat. */
  hat: number[];
  /** Lead melody, as [sixteenth offset, scale degree] pairs, repeated per bar. */
  lead: [number, number][];
  /** Overall gain, 0..1. */
  gain: number;
}

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];

/**
 * Ten tracks, one per shipped level, each with its own tempo and character so
 * the levels do not blur together.
 */
export const SONGS: readonly SongDefinition[] = [
  {
    key: 'song_pulse',
    title: 'Pulse',
    bpm: 128,
    bars: 16,
    root: 110,
    scale: MINOR,
    progression: [0, 0, 5, 5, 3, 3, 4, 4],
    kick: [0, 4, 8, 12],
    snare: [4, 12],
    hat: [2, 6, 10, 14],
    lead: [
      [0, 0],
      [3, 2],
      [6, 4],
      [8, 3],
      [11, 2],
      [14, 0],
    ],
    gain: 0.5,
  },
  {
    key: 'song_neon_drift',
    title: 'Neon Drift',
    bpm: 120,
    bars: 16,
    root: 98,
    scale: DORIAN,
    progression: [0, 3, 4, 3],
    kick: [0, 6, 8, 14],
    snare: [4, 12],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
    lead: [
      [0, 4],
      [2, 2],
      [5, 0],
      [8, 4],
      [10, 5],
      [13, 4],
    ],
    gain: 0.46,
  },
  {
    key: 'song_circuit',
    title: 'Circuit',
    bpm: 140,
    bars: 16,
    root: 123,
    scale: MINOR,
    progression: [0, 0, 4, 5],
    kick: [0, 4, 7, 8, 12],
    snare: [4, 12],
    hat: [1, 3, 5, 7, 9, 11, 13, 15],
    lead: [
      [0, 0],
      [2, 3],
      [4, 4],
      [7, 6],
      [10, 4],
      [12, 3],
      [15, 2],
    ],
    gain: 0.48,
  },
  {
    key: 'song_afterburn',
    title: 'Afterburn',
    bpm: 150,
    bars: 16,
    root: 130,
    scale: PHRYGIAN,
    progression: [0, 1, 0, 5],
    kick: [0, 3, 6, 8, 11, 14],
    snare: [4, 12],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
    lead: [
      [0, 0],
      [1, 1],
      [4, 3],
      [6, 4],
      [9, 3],
      [12, 1],
      [14, 0],
    ],
    gain: 0.45,
  },
  {
    key: 'song_glass_rain',
    title: 'Glass Rain',
    bpm: 112,
    bars: 16,
    root: 87,
    scale: DORIAN,
    progression: [0, 2, 5, 4],
    kick: [0, 8],
    snare: [4, 12],
    hat: [2, 6, 10, 14],
    lead: [
      [0, 4],
      [3, 5],
      [6, 6],
      [8, 4],
      [11, 2],
      [14, 1],
    ],
    gain: 0.44,
  },
  {
    key: 'song_overdrive',
    title: 'Overdrive',
    bpm: 160,
    bars: 16,
    root: 146,
    scale: MINOR,
    progression: [0, 5, 3, 4],
    kick: [0, 2, 4, 6, 8, 10, 12, 14],
    snare: [4, 12],
    hat: [1, 3, 5, 7, 9, 11, 13, 15],
    lead: [
      [0, 0],
      [2, 4],
      [4, 2],
      [6, 5],
      [8, 4],
      [10, 6],
      [12, 4],
      [14, 2],
    ],
    gain: 0.42,
  },
  {
    key: 'song_low_orbit',
    title: 'Low Orbit',
    bpm: 124,
    bars: 16,
    root: 82,
    scale: MINOR,
    progression: [0, 0, 3, 4],
    kick: [0, 4, 8, 12],
    snare: [12],
    hat: [2, 6, 10, 14],
    lead: [
      [0, 2],
      [4, 4],
      [8, 5],
      [12, 4],
    ],
    gain: 0.47,
  },
  {
    key: 'song_fracture',
    title: 'Fracture',
    bpm: 145,
    bars: 16,
    root: 116,
    scale: PHRYGIAN,
    progression: [0, 1, 4, 1],
    kick: [0, 3, 8, 10, 13],
    snare: [4, 12],
    hat: [0, 2, 5, 7, 9, 11, 14],
    lead: [
      [0, 1],
      [3, 0],
      [5, 4],
      [8, 3],
      [11, 5],
      [14, 3],
    ],
    gain: 0.44,
  },
  {
    key: 'song_hyperline',
    title: 'Hyperline',
    bpm: 170,
    bars: 16,
    root: 155,
    scale: MINOR,
    progression: [0, 4, 5, 3],
    kick: [0, 2, 4, 6, 8, 10, 12, 14],
    snare: [4, 12],
    hat: [1, 3, 5, 7, 9, 11, 13, 15],
    lead: [
      [0, 0],
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 4],
      [9, 2],
      [11, 4],
      [13, 6],
      [15, 4],
    ],
    gain: 0.4,
  },
  {
    key: 'song_terminal',
    title: 'Terminal',
    bpm: 132,
    bars: 16,
    root: 103,
    scale: MINOR,
    progression: [0, 5, 1, 4],
    kick: [0, 4, 6, 8, 12],
    snare: [4, 12],
    hat: [0, 3, 6, 9, 12, 15],
    lead: [
      [0, 5],
      [2, 4],
      [4, 2],
      [6, 0],
      [9, 2],
      [12, 4],
      [15, 5],
    ],
    gain: 0.46,
  },
];

/** Looks a song up by key, falling back to the first track. */
export function getSong(key: string): SongDefinition {
  return SONGS.find((song) => song.key === key) ?? (SONGS[0] as SongDefinition);
}

/** Frequency of a scale degree, wrapping into higher octaves as needed. */
function degreeToFrequency(song: SongDefinition, degree: number, octave = 0): number {
  const length = song.scale.length;
  const wrapped = ((degree % length) + length) % length;
  const octaveShift = Math.floor(degree / length) + octave;
  const semitones = (song.scale[wrapped] ?? 0) + octaveShift * 12;
  return song.root * Math.pow(2, semitones / 12);
}

/** Adds `value` into the buffer, clipping softly rather than wrapping. */
function mix(channel: Float32Array, index: number, value: number): void {
  if (index < 0 || index >= channel.length) return;
  const sum = (channel[index] ?? 0) + value;
  // tanh-like soft clip: keeps transients from clicking when layers stack.
  channel[index] = sum > 1 ? 1 - 1 / (sum + 1) : sum < -1 ? -1 + 1 / (1 - sum) : sum;
}

/** A short percussive noise burst: the snare and hat. */
function renderNoise(
  channel: Float32Array,
  start: number,
  length: number,
  gain: number,
  decay: number,
  random: () => number,
): void {
  for (let i = 0; i < length; i += 1) {
    const t = i / length;
    const envelope = Math.pow(1 - t, decay);
    mix(channel, start + i, (random() * 2 - 1) * envelope * gain);
  }
}

/** A pitched sine with an exponential decay: the kick and the bass. */
function renderTone(
  channel: Float32Array,
  start: number,
  length: number,
  frequency: number,
  gain: number,
  sampleRate: number,
  options: { decay?: number; sweep?: number; harmonics?: number } = {},
): void {
  const decay = options.decay ?? 4;
  const sweep = options.sweep ?? 1;
  const harmonics = options.harmonics ?? 1;

  for (let i = 0; i < length; i += 1) {
    const t = i / length;
    const seconds = i / sampleRate;
    const envelope = Math.exp(-decay * t);
    // A downward sweep on the kick is what makes it read as a drum rather than
    // as a bass note.
    const f = frequency * (sweep === 1 ? 1 : Math.pow(sweep, t));

    let sample = 0;
    for (let h = 1; h <= harmonics; h += 1) {
      sample += Math.sin(2 * Math.PI * f * h * seconds) / h;
    }

    mix(channel, start + i, sample * envelope * gain);
  }
}

/** A square-ish lead with a soft attack, used for the melody. */
function renderLead(
  channel: Float32Array,
  start: number,
  length: number,
  frequency: number,
  gain: number,
  sampleRate: number,
): void {
  const attack = Math.min(length * 0.1, sampleRate * 0.01);

  for (let i = 0; i < length; i += 1) {
    const t = i / length;
    const seconds = i / sampleRate;
    const envelope = (i < attack ? i / attack : 1) * Math.exp(-2.6 * t);

    // Two detuned saws: the beating between them is what gives the lead width
    // without needing a chorus effect.
    const phaseA = (frequency * seconds) % 1;
    const phaseB = (frequency * 1.005 * seconds) % 1;
    const saw = (phaseA * 2 - 1) * 0.5 + (phaseB * 2 - 1) * 0.5;

    mix(channel, start + i, saw * envelope * gain);
  }
}

/**
 * Renders a song definition into a stereo AudioBuffer.
 *
 * The buffer length is an exact whole number of bars, so looping it is
 * seamless and beat *n* always falls on sample `n * sampleRate * 60 / bpm`.
 */
export function renderSong(context: BaseAudioContext, song: SongDefinition): AudioBuffer {
  const sampleRate = context.sampleRate;
  const secondsPerBeat = 60 / song.bpm;
  const secondsPerSixteenth = secondsPerBeat / 4;
  const totalSeconds = song.bars * 4 * secondsPerBeat;
  const totalSamples = Math.ceil(totalSeconds * sampleRate);

  const buffer = context.createBuffer(2, totalSamples, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  // A fixed seed means the noise in the drums is identical every time the song
  // is rendered, so two players hear exactly the same track.
  const random = createRandom(0xbeef ^ song.bpm);

  const sixteenthSamples = Math.floor(secondsPerSixteenth * sampleRate);
  const beatSamples = Math.floor(secondsPerBeat * sampleRate);

  for (let bar = 0; bar < song.bars; bar += 1) {
    const barStart = bar * 4 * beatSamples;
    const chordDegree = song.progression[bar % song.progression.length] ?? 0;

    // --- Bass: one note per beat, following the bar's chord root.
    for (let beat = 0; beat < 4; beat += 1) {
      const start = barStart + beat * beatSamples;
      const frequency = degreeToFrequency(song, chordDegree, -1);
      renderTone(left, start, beatSamples, frequency, song.gain * 0.5, sampleRate, {
        decay: 2.2,
        harmonics: 3,
      });
      renderTone(right, start, beatSamples, frequency, song.gain * 0.5, sampleRate, {
        decay: 2.2,
        harmonics: 3,
      });
    }

    // --- Pad: a sustained chord across the whole bar, quiet and wide.
    for (const interval of [0, 2, 4]) {
      const frequency = degreeToFrequency(song, chordDegree + interval, 0);
      const target = interval === 2 ? right : interval === 4 ? left : null;
      const gain = song.gain * 0.12;
      const length = 4 * beatSamples;
      if (target) {
        renderTone(target, barStart, length, frequency, gain, sampleRate, { decay: 1.1 });
      } else {
        renderTone(left, barStart, length, frequency, gain, sampleRate, { decay: 1.1 });
        renderTone(right, barStart, length, frequency, gain, sampleRate, { decay: 1.1 });
      }
    }

    // --- Drums, on the sixteenth grid.
    for (const offset of song.kick) {
      const start = barStart + offset * sixteenthSamples;
      const length = Math.floor(sixteenthSamples * 2.2);
      renderTone(left, start, length, 130, song.gain * 0.95, sampleRate, {
        decay: 9,
        sweep: 0.28,
      });
      renderTone(right, start, length, 130, song.gain * 0.95, sampleRate, {
        decay: 9,
        sweep: 0.28,
      });
    }

    for (const offset of song.snare) {
      const start = barStart + offset * sixteenthSamples;
      const length = Math.floor(sixteenthSamples * 1.6);
      renderNoise(left, start, length, song.gain * 0.42, 2.4, random);
      renderNoise(right, start, length, song.gain * 0.42, 2.4, random);
      renderTone(left, start, length, 210, song.gain * 0.22, sampleRate, { decay: 12 });
      renderTone(right, start, length, 210, song.gain * 0.22, sampleRate, { decay: 12 });
    }

    for (const offset of song.hat) {
      const start = barStart + offset * sixteenthSamples;
      const length = Math.floor(sixteenthSamples * 0.5);
      // Pan the hats slightly by weighting the two channels differently.
      renderNoise(left, start, length, song.gain * 0.16, 5.5, random);
      renderNoise(right, start, length, song.gain * 0.13, 5.5, random);
    }

    // --- Lead melody, transposed into the bar's chord.
    for (const [offset, degree] of song.lead) {
      const start = barStart + offset * sixteenthSamples;
      const length = Math.floor(sixteenthSamples * 1.8);
      const frequency = degreeToFrequency(song, chordDegree + degree, 1);
      renderLead(left, start, length, frequency, song.gain * 0.3, sampleRate);
      renderLead(right, start, length, frequency * 1.002, song.gain * 0.3, sampleRate);
    }
  }

  // A short fade at each end so looping the buffer does not click.
  const fade = Math.min(Math.floor(sampleRate * 0.008), Math.floor(totalSamples / 2));
  for (let i = 0; i < fade; i += 1) {
    const gain = i / fade;
    left[i] = (left[i] ?? 0) * gain;
    right[i] = (right[i] ?? 0) * gain;
    const end = totalSamples - 1 - i;
    left[end] = (left[end] ?? 0) * gain;
    right[end] = (right[end] ?? 0) * gain;
  }

  return buffer;
}
