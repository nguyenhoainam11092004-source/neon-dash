/**
 * Central tuning table for NEON DASH.
 *
 * Nothing in gameplay code is allowed to hard-code a magic number that belongs
 * here: designers tune the game by editing this file, not by hunting through
 * systems. Values are expressed in world units (pixels) and seconds unless the
 * name says otherwise.
 */

/** Logical design resolution. The canvas scales to fit, letterboxing as needed. */
export const VIEW = {
  WIDTH: 1280,
  HEIGHT: 720,
  MIN_WIDTH: 320,
  MIN_HEIGHT: 240,
  MAX_WIDTH: 2560,
  MAX_HEIGHT: 1440,
} as const;

/** One grid cell. Every level object snaps to a multiple of this. */
export const GRID = {
  SIZE: 40,
  SNAP_STEPS: [10, 20, 40, 80] as const,
  DEFAULT_SNAP_INDEX: 2,
} as const;

/**
 * Fixed-timestep simulation. Gameplay integrates at a constant rate so physics
 * is deterministic and independent of the display refresh rate; rendering
 * interpolates between simulation ticks.
 */
export const SIM = {
  /** Simulation ticks per second. */
  TICK_RATE: 240,
  /** Seconds per simulation tick. */
  get FIXED_DT(): number {
    return 1 / SIM.TICK_RATE;
  },
  /** Never simulate more than this many ticks in one frame (spiral-of-death guard). */
  MAX_TICKS_PER_FRAME: 12,
  /** A frame delta larger than this is treated as a stall and clamped. */
  MAX_FRAME_DELTA: 0.25,
} as const;

/** Horizontal auto-run speed. Speed portals multiply the base value. */
export const SPEED = {
  BASE: 480,
  MULTIPLIERS: {
    slow: 0.7,
    normal: 1.0,
    fast: 1.3,
    faster: 1.6,
    fastest: 1.9,
  },
} as const;

export type SpeedTier = keyof typeof SPEED.MULTIPLIERS;

/** Shared physics constants. Individual game modes scale these. */
export const PHYSICS = {
  GRAVITY: 2900,
  MAX_FALL_SPEED: 1800,
  /** Player hit box, in pixels. */
  PLAYER_SIZE: 34,
  /** Vertical slack allowed when resolving a landing, prevents jitter. */
  LANDING_TOLERANCE: 6,
  /** Grace window after leaving a ledge during which a jump still registers. */
  COYOTE_TIME: 0.06,
  /** A jump pressed this long before landing still fires on touchdown. */
  JUMP_BUFFER: 0.1,
} as const;

/** Per-mode tuning. Each GameMode reads its own block; none reads another's. */
export const MODE_TUNING = {
  cube: {
    jumpVelocity: -1000,
    gravityScale: 1,
    /** Degrees per second while airborne. */
    airRotationSpeed: 420,
  },
  ship: {
    /** Upward acceleration while holding. */
    thrust: -2400,
    gravityScale: 0.62,
    maxRiseSpeed: -900,
    maxFallSpeed: 900,
    /** Nose pitch is velocity mapped into this range, in degrees. */
    maxPitch: 32,
  },
  ball: {
    /** Ball flips gravity instead of jumping. */
    gravityScale: 1.25,
    flipCooldown: 0.08,
    rollRotationSpeed: 540,
  },
  ufo: {
    /** Each tap is an impulse, not a hold. */
    jumpVelocity: -740,
    gravityScale: 0.85,
    tapCooldown: 0.12,
  },
  wave: {
    /** Wave moves on a fixed diagonal; slope is a ratio of horizontal speed. */
    slope: 1.0,
    gravityScale: 0,
    trailWidth: 6,
  },
  robot: {
    /** Hold longer for a higher jump, up to maxChargeTime. */
    minJumpVelocity: -680,
    maxJumpVelocity: -1180,
    maxChargeTime: 0.25,
    gravityScale: 1,
  },
  swing: {
    /** Swing flips gravity on tap and coasts, like a copter. */
    gravityScale: 0.95,
    flipCooldown: 0.06,
    maxFallSpeed: 1000,
  },
} as const;

/** Camera behaviour. Triggers may temporarily override any of these. */
export const CAMERA = {
  /** Player is kept this fraction across the viewport while running. */
  FOLLOW_X: 0.32,
  /** Vertical smoothing, higher is snappier. Units: 1/second. */
  LERP_Y: 6,
  LERP_X: 12,
  DEFAULT_ZOOM: 1,
  MIN_ZOOM: 0.4,
  MAX_ZOOM: 2.5,
  /** Dead zone height in pixels: vertical drift inside this does not move the camera. */
  DEADZONE_HEIGHT: 120,
  SHAKE_DECAY: 4.5,
} as const;

/** Audio defaults, all volumes normalised 0..1. */
export const AUDIO = {
  DEFAULT_MASTER_VOLUME: 0.8,
  DEFAULT_MUSIC_VOLUME: 0.7,
  DEFAULT_SFX_VOLUME: 0.8,
  /** Beat callbacks fire this far ahead so visuals land on the beat, not after. */
  BEAT_LOOKAHEAD: 0.02,
  /** Music clock is resynced to the audio hardware clock this often. */
  RESYNC_INTERVAL: 0.5,
} as const;

/** Persistence. Bump SAVE_VERSION whenever the shape changes and add a migration. */
export const SAVE = {
  STORAGE_KEY: 'neon-dash.save',
  SAVE_VERSION: 1,
  AUTOSAVE_INTERVAL: 10,
} as const;

/** Practice mode. */
export const PRACTICE = {
  /** Auto checkpoints are dropped at most this often, in seconds of survival. */
  AUTO_CHECKPOINT_INTERVAL: 1.6,
  MAX_CHECKPOINTS: 64,
} as const;

/** Render-layer ordering. Higher draws on top. */
export const DEPTH = {
  BACKGROUND: 0,
  BACKGROUND_DECOR: 10,
  GROUND: 20,
  OBJECTS: 30,
  PORTALS: 35,
  PLAYER_TRAIL: 38,
  PLAYER: 40,
  PARTICLES: 50,
  FOREGROUND: 60,
  EDITOR_GRID: 70,
  EDITOR_OVERLAY: 80,
  UI: 100,
  MODAL: 110,
  TOAST: 120,
} as const;

/** The original NEON DASH palette. */
export const PALETTE = {
  BG_DEEP: 0x080312,
  BG_MID: 0x120a24,
  BG_GLOW: 0x1d1040,
  CYAN: 0x2ff3f0,
  MAGENTA: 0xff2fa8,
  VIOLET: 0x9b5cff,
  LIME: 0x8bff3d,
  AMBER: 0xffc93d,
  CORAL: 0xff5c5c,
  WHITE: 0xf2f6ff,
  GREY: 0x6b7394,
  BLACK: 0x05030c,
} as const;

/** Difficulty tiers used by level metadata and the level-select UI. */
export const DIFFICULTIES = ['Easy', 'Normal', 'Hard', 'Harder', 'Insane', 'Demon'] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];

/** Named scene keys. Strings are centralised so a rename cannot desync scenes. */
export const SCENES = {
  BOOT: 'BootScene',
  PRELOAD: 'PreloadScene',
  MAIN_MENU: 'MainMenuScene',
  LEVEL_SELECT: 'LevelSelectScene',
  GAMEPLAY: 'GameplayScene',
  PRACTICE: 'PracticeScene',
  EDITOR: 'EditorScene',
  SETTINGS: 'SettingsScene',
  PROFILE: 'ProfileScene',
} as const;

export type SceneKey = (typeof SCENES)[keyof typeof SCENES];
