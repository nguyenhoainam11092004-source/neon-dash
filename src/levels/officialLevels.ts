import type { LevelData } from '@/types/LevelTypes';
import { LevelBuilder } from './LevelBuilder';

/**
 * The ten shipped levels.
 *
 * Each is authored in beats rather than pixels (see LevelBuilder), so every
 * obstacle sits on a musical subdivision and the level reads as choreography
 * rather than as a corridor of hazards. They progress deliberately: the first
 * teaches one verb, and each later level introduces exactly one more before
 * combining it with what came before.
 *
 * All ten are original work. Nothing here is derived from any existing game's
 * levels, art, music or naming.
 */

/** 1 - Easy. Teaches the single jump and nothing else. */
function firstLight(): LevelData {
  const level = new LevelBuilder('nd_01_first_light', 'First Light')
    .difficulty('Easy')
    .song('song_pulse', 128)
    .colors('#101a3c', '#1b2a5e', '#2ff3f0')
    .pattern('grid')
    .describe('A gentle introduction. One jump, on the beat.');

  // Bars 1-2: nothing at all, so the player hears the tempo before acting.
  for (let beat = 8; beat <= 20; beat += 4) {
    level.spikeRun(beat, 1);
    level.coin(beat, 3);
  }

  // Pairs, still a full bar apart.
  for (let beat = 24; beat <= 40; beat += 4) {
    level.spikeRun(beat, 2, 0.5);
  }

  level.stairs(44, 3);
  level.spikeRun(50, 1, 1, 3);

  for (let beat = 56; beat <= 68; beat += 2) {
    level.spikeRun(beat, 1);
  }

  level.pad(72);
  level.coin(74, 5);
  level.spikeRun(76, 3, 0.5);

  level.zoomAt(80, 0.92, 1.2);
  level.spikeRun(84, 2, 1);
  level.finish(92);

  return level.build();
}

/** 2 - Easy. Adds jump pads and rings. */
function neonRoad(): LevelData {
  const level = new LevelBuilder('nd_02_neon_road', 'Neon Road')
    .difficulty('Easy')
    .song('song_neon_drift', 120)
    .colors('#0f1f2e', '#16324a', '#2ff3f0')
    .pattern('waves')
    .describe('Pads launch you; rings catch you. Hold to use a ring.');

  level.spikeRun(8, 2, 0.5);
  level.pad(14);
  level.ring(16, 5);
  level.coin(16, 7);

  level.spikeRun(20, 3, 0.5);
  level.pad(26);
  level.ring(28, 5);
  level.ring(30, 7);
  level.coin(30, 9);

  level.stairs(36, 4, 0.5);
  level.spikeRun(42, 2, 0.5, 4);

  level.pad(48);
  level.ring(50, 6);
  level.ring(52.5, 8);
  level.ring(55, 6);
  level.shakeAt(55, 6, 0.3);

  level.spikeRun(60, 4, 0.5);
  level.block(66, 2, 4);
  level.saw(70, 1, 1);
  level.coin(72, 4);

  level.spikeRun(76, 3, 1);
  level.pad(82);
  level.ring(84, 6);
  level.finish(92);

  return level.build();
}

/** 3 - Normal. Introduces the ship. */
function skyCircuit(): LevelData {
  const level = new LevelBuilder('nd_03_sky_circuit', 'Sky Circuit')
    .difficulty('Normal')
    .song('song_circuit', 140)
    .colors('#1a0f2e', '#2b1650', '#9b5cff')
    .pattern('rings')
    .describe('Your first flight. Hold to rise, release to fall.');

  level.spikeRun(8, 2, 0.5);
  level.stairs(14, 3);

  level.modePortal(22, 'ship', 3);
  level.corridor(24, 40, 4, 5, 1);
  level.coin(32, 4);

  level.modePortal(44, 'cube', 2);
  level.spikeRun(48, 3, 0.5);
  level.pad(54);
  level.ring(56, 6);

  level.modePortal(62, 'ship', 3);
  level.corridor(64, 78, 5, 4, 0.75);
  level.saw(70, 5, 1.2);
  level.coin(74, 5);
  level.shakeAt(78, 9, 0.4);

  level.modePortal(82, 'cube', 2);
  level.spikeRun(86, 4, 0.5);
  level.finish(96);

  return level.build();
}

/** 4 - Normal. Introduces gravity portals. */
function inversion(): LevelData {
  const level = new LevelBuilder('nd_04_inversion', 'Inversion')
    .difficulty('Normal')
    .song('song_low_orbit', 124)
    .colors('#2e0f1f', '#4a1630', '#ff2fa8')
    .pattern('grid')
    .describe('Down is negotiable.');

  level.ceiling(-40);

  level.spikeRun(8, 2, 0.5);

  level.gravityPortal(14, 'up', 3);
  // Upside down: hazards hang from the ceiling, which is the level's floor now.
  for (let beat = 18; beat <= 28; beat += 2) {
    level.add('spike', level.beatX(beat), level.cellY(11), { rotation: 180 });
  }
  level.block(20, 12, 6, 1);
  level.coin(24, 10);

  level.gravityPortal(32, 'down', 6);
  level.spikeRun(36, 3, 0.5);

  level.gravityPortal(42, 'up', 3);
  level.saw(46, 9, 1.1);
  level.saw(50, 9, 1.1);
  level.coin(48, 8);

  level.gravityPortal(56, 'down', 6);
  level.pad(60);
  level.ring(62, 6);
  level.spikeRun(66, 4, 0.5);

  level.gravityPortal(72, 'up', 3);
  level.zoomAt(72, 0.85, 0.6);
  for (let beat = 76; beat <= 84; beat += 1.5) {
    level.add('spike', level.beatX(beat), level.cellY(11), { rotation: 180 });
  }
  level.gravityPortal(88, 'down', 6);
  level.zoomAt(88, 1, 0.6);
  level.finish(96);

  return level.build();
}

/** 5 - Hard. Introduces the ball and speed changes. */
function rollingSteel(): LevelData {
  const level = new LevelBuilder('nd_05_rolling_steel', 'Rolling Steel')
    .difficulty('Hard')
    .song('song_terminal', 132)
    .colors('#0f2e1f', '#164a30', '#8bff3d')
    .pattern('stars')
    .describe('The ball flips gravity, but only while it is touching something.');

  level.ceiling(-40);

  level.spikeRun(8, 3, 0.5);
  level.speedPortal(14, 'fast', 2);

  level.modePortal(18, 'ball', 3);
  // A ceiling to flip onto, and hazards on both surfaces.
  for (let beat = 20; beat <= 40; beat += 0.5) {
    level.block(beat, 8, 1, 1);
  }
  level.spikeRun(24, 2, 1);
  level.add('spike', level.beatX(28), level.cellY(7), { rotation: 180 });
  level.add('spike', level.beatX(30), level.cellY(7), { rotation: 180 });
  level.spikeRun(34, 2, 1);
  level.coin(32, 4);

  level.modePortal(44, 'cube', 2);
  level.speedPortal(44, 'normal', 4);
  level.spikeRun(48, 4, 0.5);
  level.stairs(54, 4, 0.5);

  level.speedPortal(60, 'faster', 2);
  level.shakeAt(60, 10, 0.4);
  level.spikeRun(64, 6, 1);
  level.pad(72);
  level.ring(74, 7);
  level.coin(74, 9);

  level.speedPortal(80, 'normal', 2);
  level.spikeRun(84, 3, 0.5);
  level.finish(94);

  return level.build();
}

/** 6 - Hard. Introduces the UFO. */
function glassCeiling(): LevelData {
  const level = new LevelBuilder('nd_06_glass_ceiling', 'Glass Ceiling')
    .difficulty('Hard')
    .song('song_glass_rain', 112)
    .colors('#0f2a2e', '#164a4a', '#2ff3f0')
    .pattern('waves')
    .describe('The UFO taps to climb. Rhythm, not pressure.');

  level.ceiling(-80);

  level.spikeRun(8, 2, 0.5);
  level.modePortal(14, 'ufo', 4);

  // Alternating pillars: each requires exactly one tap to clear.
  for (let beat = 18; beat <= 38; beat += 2) {
    const high = ((beat / 2) | 0) % 2 === 0;
    level.block(beat, high ? 6 : 0, 1, high ? 5 : 4);
  }
  level.coin(28, 8);

  level.modePortal(42, 'cube', 2);
  level.spikeRun(46, 4, 0.5);
  level.saw(52, 2, 1.3);

  level.modePortal(58, 'ufo', 4);
  level.corridor(60, 76, 6, 4, 1);
  level.saw(66, 6, 1);
  level.saw(72, 6, 1);
  level.coin(70, 6);
  level.shakeAt(76, 8, 0.35);

  level.modePortal(80, 'cube', 2);
  level.spikeRun(84, 4, 0.5);
  level.pad(90);
  level.finish(98);

  return level.build();
}

/** 7 - Harder. Introduces the wave. */
function hairline(): LevelData {
  const level = new LevelBuilder('nd_07_hairline', 'Hairline')
    .difficulty('Harder')
    .song('song_fracture', 145)
    .colors('#2e1a0f', '#4a2b16', '#ffc93d')
    .pattern('grid')
    .describe('The wave has no inertia. Every pixel is your fault.');

  level.ceiling(-60);

  level.spikeRun(8, 3, 0.5);
  level.speedPortal(14, 'fast', 2);
  level.modePortal(18, 'wave', 4);

  // A narrowing corridor: the gap shrinks each phrase.
  level.corridor(20, 30, 5, 6, 0.5);
  level.corridor(32, 42, 5, 4, 0.5);
  level.corridor(44, 54, 6, 3, 0.5);
  level.coin(38, 5);
  level.coin(50, 6);

  level.modePortal(58, 'cube', 2);
  level.speedPortal(58, 'normal', 4);
  level.spikeRun(62, 5, 0.5);
  level.stairs(68, 4, 0.5);

  level.speedPortal(74, 'fast', 2);
  level.modePortal(76, 'wave', 4);
  level.corridor(78, 90, 4, 3, 0.5);
  level.zoomAt(78, 0.88, 0.5);

  level.modePortal(94, 'cube', 2);
  level.zoomAt(94, 1, 0.5);
  level.finish(102);

  return level.build();
}

/** 8 - Harder. Introduces the robot's charged jump. */
function heavyMachinery(): LevelData {
  const level = new LevelBuilder('nd_08_heavy_machinery', 'Heavy Machinery')
    .difficulty('Harder')
    .song('song_afterburn', 150)
    .colors('#2e0f0f', '#4a1616', '#ff5c5c')
    .pattern('rings')
    .describe('Hold longer, jump higher. The robot rewards commitment.');

  level.spikeRun(8, 2, 0.5);
  level.modePortal(14, 'robot', 3);

  // Gaps of varying width, each needing a different charge.
  level.block(18, 0, 3, 1);
  level.block(24, 2, 3, 3);
  level.block(31, 5, 3, 6);
  level.block(39, 2, 3, 3);
  level.block(46, 0, 4, 1);
  level.coin(31, 8);

  level.spikeRun(52, 3, 0.5);
  level.saw(58, 1, 1.4);
  level.saw(60, 3, 1.4);

  level.modePortal(66, 'cube', 2);
  level.speedPortal(66, 'fast', 4);
  level.shakeAt(66, 12, 0.5);
  level.spikeRun(70, 6, 0.75);
  level.pad(78);
  level.ring(80, 7);
  level.ring(83, 9);
  level.coin(83, 11);

  level.modePortal(88, 'robot', 3);
  level.speedPortal(88, 'normal', 5);
  level.block(92, 3, 3, 4);
  level.block(99, 0, 4, 1);
  level.finish(106);

  return level.build();
}

/** 9 - Insane. Introduces the swing and mixes everything. */
function pendulum(): LevelData {
  const level = new LevelBuilder('nd_09_pendulum', 'Pendulum')
    .difficulty('Insane')
    .song('song_overdrive', 160)
    .colors('#1a0f2e', '#301650', '#9b5cff')
    .pattern('rings')
    .describe('Every form you have learned, one after another, at speed.');

  level.ceiling(-100);
  level.startsAs('cube', 'fast');

  level.spikeRun(8, 4, 0.5);
  level.modePortal(14, 'swing', 5);

  for (let beat = 18; beat <= 34; beat += 2) {
    const high = ((beat / 2) | 0) % 2 === 0;
    level.saw(beat, high ? 9 : 2, 1, 1.6);
  }
  level.coin(26, 6);

  level.modePortal(38, 'ship', 4);
  level.corridor(40, 52, 6, 4, 0.75);
  level.saw(46, 6, 1.1);

  level.modePortal(56, 'ball', 3);
  for (let beat = 58; beat <= 74; beat += 0.5) level.block(beat, 8, 1, 1);
  level.spikeRun(62, 2, 1);
  level.add('spike', level.beatX(66), level.cellY(7), { rotation: 180 });
  level.add('spike', level.beatX(68), level.cellY(7), { rotation: 180 });
  level.spikeRun(72, 2, 1);
  level.coin(70, 4);

  level.modePortal(78, 'wave', 4);
  level.speedPortal(78, 'faster', 6);
  level.corridor(80, 92, 5, 3, 0.5);
  level.shakeAt(80, 14, 0.6);

  level.modePortal(96, 'cube', 2);
  level.speedPortal(96, 'fast', 4);
  level.spikeRun(100, 6, 0.5);
  level.pad(108);
  level.ring(110, 8);
  level.finish(118);

  return level.build();
}

/** 10 - Insane. The finale: fastest tier, tightest windows. */
function terminalVelocity(): LevelData {
  const level = new LevelBuilder('nd_10_terminal_velocity', 'Terminal Velocity')
    .difficulty('Insane')
    .song('song_hyperline', 170)
    .colors('#05030c', '#1d1040', '#ff2fa8')
    .pattern('stars')
    .describe('No introductions. Good luck.');

  level.ceiling(-120);
  level.startsAs('cube', 'faster');

  level.spikeRun(6, 5, 0.5);
  level.pad(12);
  level.ring(14, 7);
  level.ring(16.5, 9);

  level.modePortal(20, 'wave', 5);
  level.corridor(22, 34, 5, 3, 0.5);
  level.zoomAt(22, 0.86, 0.4);

  level.modePortal(38, 'ufo', 4);
  level.zoomAt(38, 1, 0.4);
  for (let beat = 40; beat <= 54; beat += 1.5) {
    const high = ((beat / 1.5) | 0) % 2 === 0;
    level.block(beat, high ? 7 : 0, 1, high ? 6 : 5);
  }
  level.coin(48, 9);

  level.speedPortal(58, 'fastest', 4);
  level.shakeAt(58, 16, 0.7);
  level.modePortal(60, 'cube', 2);
  level.spikeRun(64, 8, 0.5);
  level.stairs(72, 5, 0.5);

  level.modePortal(80, 'ship', 5);
  level.corridor(82, 96, 6, 4, 0.5);
  level.saw(86, 6, 1.2, 2);
  level.saw(92, 6, 1.2, 2);
  level.coin(90, 6);

  level.modePortal(100, 'swing', 5);
  for (let beat = 102; beat <= 116; beat += 2) {
    const high = ((beat / 2) | 0) % 2 === 0;
    level.saw(beat, high ? 10 : 2, 1, 2);
  }

  level.modePortal(120, 'cube', 2);
  level.speedPortal(120, 'fast', 4);
  level.spikeRun(124, 6, 0.5);
  level.shakeAt(130, 18, 0.8);
  level.finish(134);

  return level.build();
}

/** Every shipped level, in play order. */
export const OFFICIAL_LEVEL_FACTORIES: readonly (() => LevelData)[] = [
  firstLight,
  neonRoad,
  skyCircuit,
  inversion,
  rollingSteel,
  glassCeiling,
  hairline,
  heavyMachinery,
  pendulum,
  terminalVelocity,
];

/** Builds all ten levels. Used by the generator script and as a runtime fallback. */
export function buildOfficialLevels(): LevelData[] {
  return OFFICIAL_LEVEL_FACTORIES.map((factory) => factory());
}
