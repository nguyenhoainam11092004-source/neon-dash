import Phaser from 'phaser';
import { DEPTH, GRID, PALETTE } from '@/config/constants';
import { TEX } from '@/effects/TextureFactory';
import { Block } from '@/obstacles/Block';
import { Collectible, Decor, Finish, JumpPad, JumpRing } from '@/obstacles/Interactive';
import { Obstacle } from '@/obstacles/Obstacle';
import { Platform } from '@/obstacles/Platform';
import { Saw } from '@/obstacles/Saw';
import { Spike } from '@/obstacles/Spike';
import { GravityPortal } from '@/portals/GravityPortal';
import { ModePortal } from '@/portals/ModePortal';
import { SpeedPortal } from '@/portals/SpeedPortal';
import { TeleportPortal } from '@/portals/TeleportPortal';
import type { LevelObject, LevelObjectType } from '@/types/LevelTypes';
import { parseHexColor } from '@/utils/MathUtils';
import { logger } from '@/utils/Logger';

/**
 * Builds obstacles from level data, and the sprites that draw them.
 *
 * Simulation and presentation are created together but kept apart: `create`
 * returns a plain Obstacle usable with no scene at all, and `createView` adds
 * the Phaser object. The headless validator calls only the first.
 */

type ObstacleConstructor = new (data: LevelObject) => Obstacle;

/**
 * The single mapping from a type name to a class.
 *
 * Everything data-driven in the game funnels through here, which is why there
 * is no `switch (object.type)` anywhere in the loader, the editor or the
 * renderer.
 */
const REGISTRY: Record<LevelObjectType, ObstacleConstructor> = {
  block: Block,
  spike: Spike,
  saw: Saw,
  platform: Platform,
  jumpPad: JumpPad,
  jumpRing: JumpRing,
  collectible: Collectible,
  gravityPortal: GravityPortal,
  speedPortal: SpeedPortal,
  modePortal: ModePortal,
  teleportPortal: TeleportPortal,
  finish: Finish,
  decor: Decor,
};

/** Default tint per type; a level object may override it with props.color. */
const TINTS: Record<LevelObjectType, number> = {
  block: PALETTE.VIOLET,
  spike: PALETTE.CORAL,
  saw: PALETTE.CORAL,
  platform: PALETTE.CYAN,
  jumpPad: PALETTE.LIME,
  jumpRing: PALETTE.AMBER,
  collectible: PALETTE.AMBER,
  gravityPortal: PALETTE.LIME,
  speedPortal: PALETTE.CYAN,
  modePortal: PALETTE.MAGENTA,
  teleportPortal: PALETTE.VIOLET,
  finish: PALETTE.WHITE,
  decor: PALETTE.GREY,
};

export class LevelObjectFactory {
  /** Instantiates the simulation object for a level entry. */
  create(data: LevelObject): Obstacle | null {
    const Ctor = REGISTRY[data.type];
    if (!Ctor) {
      logger.warn('LevelObjectFactory', `No class registered for type "${data.type}"`);
      return null;
    }
    return new Ctor(data);
  }

  /** Instantiates every object in a level, skipping any that fail. */
  createAll(objects: readonly LevelObject[]): Obstacle[] {
    const result: Obstacle[] = [];
    for (const data of objects) {
      const obstacle = this.create(data);
      if (obstacle) result.push(obstacle);
    }
    return result;
  }

  /**
   * Creates the game object that draws an obstacle.
   *
   * Returns a Container for anything that needs more than one primitive, so the
   * caller can position, tint and rotate every kind of object identically.
   */
  createView(scene: Phaser.Scene, obstacle: Obstacle): Phaser.GameObjects.GameObject {
    const tint = parseHexColor(String(obstacle.data.props?.color ?? '')) ?? TINTS[obstacle.type];
    const size = obstacle.baseSize;

    switch (obstacle.type) {
      case 'block':
      case 'platform': {
        const image = scene.add
          .image(obstacle.x, obstacle.y, TEX.SQUARE)
          .setDisplaySize(size.width * obstacle.scale, size.height * obstacle.scale)
          .setTint(tint)
          .setAngle(obstacle.rotation)
          .setDepth(DEPTH.OBJECTS);
        return image;
      }

      case 'spike': {
        const image = scene.add
          .image(obstacle.x, obstacle.y, TEX.TRIANGLE)
          .setDisplaySize(size.width * obstacle.scale, size.height * obstacle.scale)
          .setTint(tint)
          .setAngle(obstacle.rotation)
          .setDepth(DEPTH.OBJECTS);
        return image;
      }

      case 'saw': {
        const image = scene.add
          .image(obstacle.x, obstacle.y, TEX.SAW)
          .setDisplaySize(size.width * obstacle.scale, size.height * obstacle.scale)
          .setTint(tint)
          .setDepth(DEPTH.OBJECTS);
        return image;
      }

      case 'jumpPad': {
        const container = scene.add.container(obstacle.x, obstacle.y).setDepth(DEPTH.OBJECTS);
        const pad = scene.add
          .image(0, 0, TEX.SQUARE)
          .setDisplaySize(size.width * obstacle.scale, size.height * obstacle.scale)
          .setTint(tint);
        const arrow = scene.add
          .image(0, -6, TEX.CHEVRON)
          .setDisplaySize(20, 20)
          .setAngle(-90)
          .setTint(PALETTE.WHITE)
          .setAlpha(0.9);
        container.add([pad, arrow]);
        container.setAngle(obstacle.rotation);
        // The pulse tells the player it is live without needing a separate hint.
        scene.tweens.add({
          targets: arrow,
          y: -12,
          alpha: 0.5,
          duration: 620,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        return container;
      }

      case 'jumpRing': {
        const image = scene.add
          .image(obstacle.x, obstacle.y, TEX.RING)
          .setDisplaySize(size.width * obstacle.scale, size.height * obstacle.scale)
          .setTint(tint)
          .setDepth(DEPTH.OBJECTS)
          .setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({
          targets: image,
          scale: image.scale * 1.12,
          duration: 780,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        return image;
      }

      case 'collectible': {
        const image = scene.add
          .image(obstacle.x, obstacle.y, TEX.COIN)
          .setDisplaySize(size.width * obstacle.scale, size.height * obstacle.scale)
          .setTint(tint)
          .setDepth(DEPTH.OBJECTS)
          .setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({
          targets: image,
          angle: 360,
          duration: 3200,
          repeat: -1,
          ease: 'Linear',
        });
        return image;
      }

      case 'gravityPortal':
      case 'speedPortal':
      case 'modePortal':
      case 'teleportPortal':
        return this.createPortalView(scene, obstacle, tint);

      case 'finish': {
        const container = scene.add.container(obstacle.x, obstacle.y).setDepth(DEPTH.PORTALS);
        const beam = scene.add
          .image(0, 0, TEX.SQUARE)
          .setDisplaySize(GRID.SIZE * 0.5, size.height)
          .setTint(PALETTE.WHITE)
          .setAlpha(0.35)
          .setBlendMode(Phaser.BlendModes.ADD);
        container.add(beam);
        scene.tweens.add({
          targets: beam,
          alpha: 0.75,
          duration: 500,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        return container;
      }

      case 'decor':
      default: {
        return scene.add
          .image(obstacle.x, obstacle.y, TEX.SQUARE)
          .setDisplaySize(size.width * obstacle.scale, size.height * obstacle.scale)
          .setTint(tint)
          .setAlpha(0.45)
          .setAngle(obstacle.rotation)
          .setDepth(DEPTH.BACKGROUND_DECOR);
      }
    }
  }

  /** Portals share a frame; only the icon inside differs. */
  private createPortalView(
    scene: Phaser.Scene,
    obstacle: Obstacle,
    tint: number,
  ): Phaser.GameObjects.Container {
    const size = obstacle.baseSize;
    const width = size.width * obstacle.scale;
    const height = size.height * obstacle.scale;

    const container = scene.add.container(obstacle.x, obstacle.y).setDepth(DEPTH.PORTALS);

    const frame = scene.add.graphics();
    frame.lineStyle(4, tint, 0.95);
    frame.strokeRoundedRect(-width / 2, -height / 2, width, height, width / 2);
    frame.fillStyle(tint, 0.16);
    frame.fillRoundedRect(-width / 2, -height / 2, width, height, width / 2);

    const halo = scene.add
      .image(0, 0, TEX.GLOW)
      .setDisplaySize(width * 3, height * 1.15)
      .setTint(tint)
      .setAlpha(0.3)
      .setBlendMode(Phaser.BlendModes.ADD);

    container.add([halo, frame]);

    const icon = this.portalIcon(scene, obstacle, tint);
    if (icon) container.add(icon);

    scene.tweens.add({
      targets: halo,
      alpha: 0.55,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return container;
  }

  private portalIcon(
    scene: Phaser.Scene,
    obstacle: Obstacle,
    tint: number,
  ): Phaser.GameObjects.GameObject | null {
    if (obstacle instanceof SpeedPortal) {
      return scene.add
        .image(0, 0, TEX.CHEVRON)
        .setDisplaySize(26, 26)
        .setTint(PALETTE.WHITE)
        .setAlpha(0.9);
    }

    if (obstacle instanceof GravityPortal) {
      const arrow = scene.add
        .image(0, 0, TEX.CHEVRON)
        .setDisplaySize(26, 26)
        .setTint(PALETTE.WHITE)
        .setAlpha(0.9);
      arrow.setAngle(obstacle.data.props?.gravity === 'up' ? -90 : 90);
      return arrow;
    }

    if (obstacle instanceof ModePortal) {
      return scene.add.image(0, 0, TEX.SQUARE).setDisplaySize(20, 20).setTint(tint).setAlpha(0.95);
    }

    if (obstacle instanceof TeleportPortal) {
      return scene.add
        .image(0, 0, TEX.STAR)
        .setDisplaySize(24, 24)
        .setTint(PALETTE.WHITE)
        .setAlpha(0.85);
    }

    return null;
  }
}

export const levelObjectFactory = new LevelObjectFactory();
