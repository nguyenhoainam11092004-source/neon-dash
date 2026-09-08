import Phaser from 'phaser';
import { PALETTE, SCENES, VIEW } from '@/config/constants';
import { NeonBackground } from '@/effects/NeonBackground';
import { TEX } from '@/effects/TextureFactory';
import { Button } from '@/ui/Button';
import { FONT_STACK, SPACING, TYPE, UI_COLORS, hex, track } from '@/ui/Theme';
import type { SaveManager } from '@/save/SaveManager';

/**
 * The title screen and the hub every other screen returns to.
 *
 * It owns no gameplay state: it reads the save for the header stats and starts
 * the scene the player picked.
 */
export class MainMenuScene extends Phaser.Scene {
  private background!: NeonBackground;
  private mark!: Phaser.GameObjects.Container;
  private lastTime = 0;

  constructor() {
    super({ key: SCENES.MAIN_MENU });
  }

  create(): void {
    const save = this.registry.get('save') as SaveManager | undefined;
    const reducedMotion = save?.settings.reducedMotion ?? false;

    this.cameras.main.setBackgroundColor(PALETTE.BG_DEEP);
    this.cameras.main.fadeIn(320, 8, 3, 18);

    this.background = new NeonBackground(this, {
      pattern: 'grid',
      accent: PALETTE.VIOLET,
      motion: reducedMotion ? 0.25 : 1,
      seed: 20260908,
    });

    this.buildWordmark();
    this.buildMenu();
    this.buildFooter(save);

    // The browser blocks audio until a gesture; the first click anywhere is the
    // right moment to unlock it, and the menu is where that click happens.
    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => {
      if (this.sound.locked) this.sound.unlock();
      this.registry.set('audioUnlocked', true);
    });
  }

  private buildWordmark(): void {
    const cx = VIEW.WIDTH / 2;
    const top = 108;

    this.mark = this.add.container(cx, top);

    const neon = this.add
      .text(0, 0, track('NEON', 16), {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.display.size}px`,
        fontStyle: '800',
        color: hex(PALETTE.CYAN),
      })
      .setOrigin(0.5, 1);
    neon.setShadow(0, 0, hex(PALETTE.CYAN), 26, false, true);

    const dash = this.add
      .text(0, 8, track('DASH', 16), {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.display.size}px`,
        fontStyle: '800',
        color: hex(PALETTE.MAGENTA),
      })
      .setOrigin(0.5, 0);
    dash.setShadow(0, 0, hex(PALETTE.MAGENTA), 26, false, true);

    // A hairline between the two words, drawn rather than typed, so it can
    // animate independently of the text.
    const rule = this.add.graphics();
    rule.fillStyle(PALETTE.VIOLET, 0.85);
    rule.fillRect(-140, 2, 280, 2);

    this.mark.add([neon, rule, dash]);

    const cube = this.add
      .image(cx, top + 4, TEX.SQUARE)
      .setTint(PALETTE.LIME)
      .setScale(0.42)
      .setAlpha(0.9);
    cube.setPosition(cx - 300, top - 26);

    this.tweens.add({
      targets: cube,
      y: cube.y - 18,
      angle: 90,
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.tweens.add({
      targets: rule,
      scaleX: { from: 0.2, to: 1 },
      duration: 700,
      ease: 'Cubic.easeOut',
    });
  }

  private buildMenu(): void {
    const cx = VIEW.WIDTH / 2;
    const startY = 268;
    const width = 300;
    const height = 54;

    const entries: { label: string; color: number; action: () => void; variant?: 'solid' }[] = [
      {
        label: 'PLAY',
        color: PALETTE.CYAN,
        variant: 'solid',
        action: () => this.go(SCENES.LEVEL_SELECT),
      },
      { label: 'LEVELS', color: PALETTE.VIOLET, action: () => this.go(SCENES.LEVEL_SELECT) },
      { label: 'CREATE', color: PALETTE.LIME, action: () => this.go(SCENES.EDITOR) },
      { label: 'PROFILE', color: PALETTE.AMBER, action: () => this.go(SCENES.PROFILE) },
      { label: 'SETTINGS', color: PALETTE.MAGENTA, action: () => this.go(SCENES.SETTINGS) },
    ];

    entries.forEach((entry, index) => {
      const button = new Button(this, cx, startY + index * (height + SPACING.sm), {
        label: entry.label,
        width,
        height,
        color: entry.color,
        variant: entry.variant ?? 'ghost',
        tracking: 4,
        onClick: entry.action,
      });

      // Stagger the entrance so the column assembles rather than appearing.
      button.setAlpha(0);
      button.x = cx - 60;
      this.tweens.add({
        targets: button,
        alpha: 1,
        x: cx,
        duration: 340,
        delay: 90 + index * 70,
        ease: 'Cubic.easeOut',
      });
    });
  }

  private buildFooter(save: SaveManager | undefined): void {
    const stats = save?.current.stats;
    const completed = stats?.levelsCompleted ?? 0;
    const attempts = stats?.totalAttempts ?? 0;

    this.add
      .text(
        SPACING.lg,
        VIEW.HEIGHT - SPACING.lg,
        `LEVELS COMPLETED  ${completed}     ATTEMPTS  ${attempts}`,
        {
          fontFamily: FONT_STACK,
          fontSize: `${TYPE.caption.size}px`,
          fontStyle: '600',
          color: hex(UI_COLORS.textMuted),
        },
      )
      .setOrigin(0, 1);

    this.add
      .text(VIEW.WIDTH - SPACING.lg, VIEW.HEIGHT - SPACING.lg, 'SPACE / CLICK / TAP  TO JUMP', {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.caption.size}px`,
        fontStyle: '600',
        color: hex(UI_COLORS.textMuted),
      })
      .setOrigin(1, 1);
  }

  private go(scene: string): void {
    this.cameras.main.fadeOut(200, 8, 3, 18);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(scene);
    });
  }

  override update(time: number): void {
    const dt = this.lastTime === 0 ? 0 : (time - this.lastTime) / 1000;
    this.lastTime = time;
    this.background.update(dt);

    // A slow drift keeps the title alive without a tween fighting the layout.
    this.mark.y = 108 + Math.sin(time / 900) * 4;
  }

  shutdown(): void {
    this.background.destroy();
    this.lastTime = 0;
  }
}
