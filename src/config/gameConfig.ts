import Phaser from 'phaser';
import { PALETTE, VIEW } from './constants';

/**
 * Builds the Phaser game configuration.
 *
 * Physics is deliberately absent: NEON DASH runs its own deterministic
 * fixed-timestep simulation (see PlayerPhysics and CollisionSystem) because a
 * rhythm platformer needs identical results on every machine, which an
 * impulse-based engine stepped by the render clock cannot guarantee.
 */
export function createGameConfig(parent: HTMLElement | string): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    backgroundColor: PALETTE.BG_DEEP,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: VIEW.WIDTH,
      height: VIEW.HEIGHT,
      min: { width: VIEW.MIN_WIDTH, height: VIEW.MIN_HEIGHT },
      max: { width: VIEW.MAX_WIDTH, height: VIEW.MAX_HEIGHT },
      expandParent: true,
    },
    render: {
      antialias: true,
      pixelArt: false,
      roundPixels: false,
      powerPreference: 'high-performance',
      // The editor and the share features need to read pixels back off the canvas.
      preserveDrawingBuffer: false,
      transparent: false,
    },
    audio: {
      disableWebAudio: false,
      noAudio: false,
    },
    input: {
      keyboard: true,
      mouse: true,
      touch: true,
      gamepad: false,
      activePointers: 3,
    },
    dom: {
      // The level editor's text inputs are real DOM elements layered over the canvas.
      createContainer: true,
    },
    fps: {
      // Phaser only drives rendering; the simulation clock lives in TimeUtils.
      target: 60,
      forceSetTimeOut: false,
      smoothStep: true,
    },
    disableContextMenu: true,
    banner: false,
    autoFocus: true,
  };
}
