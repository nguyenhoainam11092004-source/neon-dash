import Phaser from 'phaser';
import { SCENES } from '@/config/constants';
import { logger } from '@/utils/Logger';

/**
 * First scene to run. Does the minimum needed before anything can be shown:
 * reads persisted settings, configures scaling, and hands off to PreloadScene.
 *
 * Nothing here may depend on a loaded asset, because nothing has loaded yet.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.BOOT });
  }

  init(): void {
    // Keep the game running when the tab loses focus is the wrong default for a
    // rhythm game: a backgrounded tab throttles timers and desyncs the music, so
    // let Phaser pause and let GameplayScene decide how to resume.
    this.game.events.on(Phaser.Core.Events.BLUR, () => {
      this.game.events.emit('nd:window-blur');
    });
    this.game.events.on(Phaser.Core.Events.FOCUS, () => {
      this.game.events.emit('nd:window-focus');
    });
  }

  create(): void {
    logger.info('BootScene', 'Boot complete', {
      renderer: this.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas',
      dpr: window.devicePixelRatio,
      size: `${this.scale.width}x${this.scale.height}`,
    });

    this.scene.start(SCENES.PRELOAD);
  }
}
