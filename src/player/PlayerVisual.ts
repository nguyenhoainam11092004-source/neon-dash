import Phaser from 'phaser';
import { DEPTH, PALETTE, PHYSICS } from '@/config/constants';
import { TEX } from '@/effects/TextureFactory';
import type { GameModeId } from '@/types/LevelTypes';
import type { PlayerCustomization, PlayerState } from '@/types/PlayerTypes';
import { parseHexColor } from '@/utils/MathUtils';

/**
 * Draws the player.
 *
 * Kept entirely separate from the simulation: this class reads PlayerState and
 * never writes to it. That separation is what allows the physics to run at a
 * fixed rate while the visual interpolates between ticks, and it means the
 * headless validator can run a whole level with no renderer at all.
 */
export class PlayerVisual {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly hitbox: Phaser.GameObjects.Graphics;

  private primary: number = PALETTE.CYAN;
  private secondary: number = PALETTE.MAGENTA;
  private currentMode: GameModeId = 'cube';
  private showHitbox = false;

  /** Position the sprite is easing toward, set from the simulation each frame. */
  private targetX = 0;
  private targetY = 0;
  private targetRotation = 0;

  constructor(scene: Phaser.Scene, customization?: PlayerCustomization) {
    this.scene = scene;

    this.glow = scene.add
      .image(0, 0, TEX.GLOW)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.9)
      .setAlpha(0.55);

    this.body = scene.add.graphics();
    this.hitbox = scene.add.graphics().setVisible(false);

    this.container = scene.add.container(0, 0, [this.glow, this.body]).setDepth(DEPTH.PLAYER);

    this.hitbox.setDepth(DEPTH.PLAYER + 1);

    if (customization) this.applyCustomization(customization);
    this.redraw();
  }

  applyCustomization(customization: PlayerCustomization): void {
    this.primary = parseHexColor(customization.primaryColor) ?? PALETTE.CYAN;
    this.secondary = parseHexColor(customization.secondaryColor) ?? PALETTE.MAGENTA;
    this.glow.setTint(this.primary);
    this.redraw();
  }

  setShowHitbox(show: boolean): void {
    this.showHitbox = show;
    this.hitbox.setVisible(show);
  }

  /** Switches the drawn shape. Called when a mode portal fires. */
  setMode(mode: GameModeId): void {
    if (mode === this.currentMode) return;
    this.currentMode = mode;
    this.redraw();

    // A short flash sells the transition without needing a separate effect.
    this.scene.tweens.add({
      targets: this.container,
      scale: { from: 1.5, to: 1 },
      duration: 220,
      ease: 'Back.easeOut',
    });
  }

  /**
   * Each form is drawn from primitives rather than loaded as a sprite, so the
   * player's two chosen colours apply to every mode automatically.
   */
  private redraw(): void {
    const g = this.body;
    const size = PHYSICS.PLAYER_SIZE;
    const half = size / 2;

    g.clear();

    switch (this.currentMode) {
      case 'cube':
      case 'robot': {
        g.fillStyle(this.primary, 1);
        g.fillRoundedRect(-half, -half, size, size, 6);
        g.fillStyle(this.secondary, 1);
        g.fillRoundedRect(-half * 0.45, -half * 0.45, size * 0.45, size * 0.45, 3);
        g.lineStyle(2.5, PALETTE.WHITE, 0.85);
        g.strokeRoundedRect(-half, -half, size, size, 6);
        break;
      }

      case 'ship': {
        // A forward-pointing wedge; the nose is at +x because the player always
        // runs to the right.
        g.fillStyle(this.primary, 1);
        g.beginPath();
        g.moveTo(half + 4, 0);
        g.lineTo(-half, -half * 0.8);
        g.lineTo(-half * 0.4, 0);
        g.lineTo(-half, half * 0.8);
        g.closePath();
        g.fillPath();
        g.fillStyle(this.secondary, 1);
        g.fillCircle(0, 0, half * 0.34);
        g.lineStyle(2, PALETTE.WHITE, 0.8);
        g.strokePath();
        break;
      }

      case 'ball': {
        g.fillStyle(this.primary, 1);
        g.fillCircle(0, 0, half);
        g.fillStyle(this.secondary, 1);
        g.fillCircle(0, -half * 0.4, half * 0.3);
        g.lineStyle(2.5, PALETTE.WHITE, 0.85);
        g.strokeCircle(0, 0, half);
        break;
      }

      case 'ufo': {
        g.fillStyle(this.secondary, 1);
        g.fillEllipse(0, half * 0.15, size * 1.15, size * 0.5);
        g.fillStyle(this.primary, 1);
        g.fillEllipse(0, -half * 0.35, size * 0.62, size * 0.62);
        g.lineStyle(2, PALETTE.WHITE, 0.8);
        g.strokeEllipse(0, half * 0.15, size * 1.15, size * 0.5);
        break;
      }

      case 'wave': {
        // A slim dart, so the player can see the gap they are threading.
        g.fillStyle(this.primary, 1);
        g.beginPath();
        g.moveTo(half, 0);
        g.lineTo(-half * 0.6, -half * 0.62);
        g.lineTo(-half * 0.2, 0);
        g.lineTo(-half * 0.6, half * 0.62);
        g.closePath();
        g.fillPath();
        g.lineStyle(2, this.secondary, 0.95);
        g.strokePath();
        break;
      }

      case 'swing': {
        g.fillStyle(this.primary, 1);
        g.fillRoundedRect(-half, -half * 0.55, size, size * 0.55, 4);
        g.fillStyle(this.secondary, 1);
        g.fillTriangle(-half * 0.5, half * 0.5, half * 0.5, half * 0.5, 0, half);
        g.lineStyle(2, PALETTE.WHITE, 0.8);
        g.strokeRoundedRect(-half, -half * 0.55, size, size * 0.55, 4);
        break;
      }
    }
  }

  /**
   * Copies the simulation state onto the sprite.
   *
   * `alpha` is the fraction of a simulation tick already elapsed; the sprite is
   * drawn slightly ahead of the last resolved tick so motion stays smooth when
   * the display refreshes faster than the simulation.
   */
  sync(state: PlayerState, alpha: number): void {
    const runAhead = state.velocity.x * alpha * (1 / 240);
    this.targetX = state.position.x + runAhead;
    this.targetY = state.position.y + state.velocity.y * alpha * (1 / 240);
    this.targetRotation = state.rotation;

    this.container.setPosition(this.targetX, this.targetY);
    this.container.setAngle(this.targetRotation);

    const scale = state.mini ? 0.6 : 1;
    this.container.setScale(scale);

    // The glow brightens with vertical speed, so a fast fall reads as dangerous.
    const speedFactor = Math.min(1, Math.abs(state.velocity.y) / 1200);
    this.glow.setAlpha(0.4 + speedFactor * 0.35);
    this.glow.setScale(0.85 + speedFactor * 0.25);

    if (this.showHitbox) {
      const half = (state.mini ? PHYSICS.PLAYER_SIZE * 0.6 : PHYSICS.PLAYER_SIZE) / 2;
      this.hitbox.clear();
      this.hitbox.lineStyle(1.5, PALETTE.LIME, 0.9);
      this.hitbox.strokeRect(state.position.x - half, state.position.y - half, half * 2, half * 2);
    }
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible);
    if (!visible) this.hitbox.clear();
  }

  get gameObject(): Phaser.GameObjects.Container {
    return this.container;
  }

  get x(): number {
    return this.targetX;
  }

  get y(): number {
    return this.targetY;
  }

  destroy(): void {
    this.container.destroy(true);
    this.hitbox.destroy();
  }
}
