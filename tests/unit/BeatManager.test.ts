import { describe, expect, it } from 'vitest';
import { BeatManager } from '@/audio/BeatManager';

describe('BeatManager', () => {
  it('emits a beat event when the song position crosses a beat boundary', () => {
    const manager = new BeatManager();
    manager.configure(120); // exactly 0.5s per beat

    const beats: number[] = [];
    manager.events.on('beat', ({ beat }) => beats.push(beat));

    manager.update(0, 0);
    manager.update(0.49, 0.49);
    expect(beats).toEqual([0]);

    manager.update(0.5, 0.01);
    expect(beats).toEqual([0, 1]);
  });

  it('emits a bar event every four beats', () => {
    const manager = new BeatManager();
    manager.configure(120);

    const bars: number[] = [];
    manager.events.on('bar', ({ bar }) => bars.push(bar));

    for (let i = 0; i <= 8; i += 1) {
      manager.update(i * 0.5, 0.5);
    }

    // Beats 0, 4 and 8 each start a new bar.
    expect(bars).toEqual([0, 1, 2]);
  });

  it('never emits the same beat twice for forward-only progress', () => {
    const manager = new BeatManager();
    manager.configure(140);

    const beats: number[] = [];
    manager.events.on('beat', ({ beat }) => beats.push(beat));

    let t = 0;
    for (let i = 0; i < 200; i += 1) {
      t += 1 / 240; // simulate a fixed 240Hz tick
      manager.update(t, 1 / 240);
    }

    const unique = new Set(beats);
    expect(unique.size).toBe(beats.length);
    expect([...unique]).toEqual([...unique].sort((a, b) => a - b));
  });

  it('re-derives cleanly after a backward jump (seek or loop)', () => {
    const manager = new BeatManager();
    manager.configure(120);

    manager.update(10, 0.5);
    // Song looped back to the start.
    manager.update(0, 0.016);

    // Should not throw, and future beats should resume normally.
    const beats: number[] = [];
    manager.events.on('beat', ({ beat }) => beats.push(beat));
    manager.update(0.5, 0.5);
    expect(beats.length).toBeGreaterThan(0);
  });

  it('reset clears emitted-beat history', () => {
    const manager = new BeatManager();
    manager.configure(120);
    manager.update(2, 2);
    expect(manager.currentBeat).toBeGreaterThan(0);

    manager.reset();
    expect(manager.currentBeat).toBe(-1);
  });

  it('pulse decays toward zero as time passes since the last beat', () => {
    const manager = new BeatManager();
    manager.configure(120);

    manager.update(0, 0);
    const justAfterBeat = manager.pulse;

    manager.update(0.4, 0.4);
    const laterPulse = manager.pulse;

    expect(laterPulse).toBeLessThan(justAfterBeat);
  });

  it('timeOfBeat is the inverse of the beat/time relationship', () => {
    const manager = new BeatManager();
    manager.configure(120);
    // At 120 BPM, beat 4 should land at 2 seconds.
    expect(manager.timeOfBeat(4)).toBeCloseTo(2, 5);
  });
});
