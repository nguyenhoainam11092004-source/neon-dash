import Phaser from 'phaser';
import { DEPTH, PALETTE, VIEW } from '@/config/constants';
import { TEX } from '@/effects/TextureFactory';
import { formatPercent } from '@/utils/TimeUtils';
import { Button } from './Button';
import { FONT_STACK, RADIUS, SPACING, TYPE, UI_COLORS, hex, track } from './Theme';
import { ProgressBar } from './ProgressBar';

export interface HudOptions {
  levelName: string;
  practice: boolean;
  showFps: boolean;
  onPause: () => void;
}

export interface PauseOptions {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  onPractice: () => void;
  practice: boolean;
}

/**
 * The in-game overlay: progress, attempts, coins, and the pause menu.
 *
 * Everything here is pinned to the camera and drawn above the world. It reads
 * values pushed in by the scene and never reaches back into gameplay, so the
 * HUD can be disabled entirely without changing how a level plays.
 */
export class GameplayHud {
  private readonly scene: Phaser.Scene;
  private readonly options: HudOptions;

  private readonly root: Phaser.GameObjects.Container;
  private readonly bar: ProgressBar;
  private readonly percentText: Phaser.GameObjects.Text;
  private readonly attemptText: Phaser.GameObjects.Text;
  private readonly levelText: Phaser.GameObjects.Text;
  private readonly coinIcons: Phaser.GameObjects.Image[] = [];
  private readonly practiceBadge?: Phaser.GameObjects.Container;
  private fpsText?: Phaser.GameObjects.Text;

  private pauseLayer?: Phaser.GameObjects.Container;
  private completeLayer?: Phaser.GameObjects.Container;

  private coins = 0;
  private pulseAmount = 0;

  constructor(scene: Phaser.Scene, options: HudOptions) {
    this.scene = scene;
    this.options = options;

    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(DEPTH.UI);

    // --- Progress bar across the top.
    this.bar = new ProgressBar(scene, VIEW.WIDTH / 2, 30, {
      width: VIEW.WIDTH - 260,
      height: 16,
      color: PALETTE.CYAN,
      showLabel: false,
      smoothing: 0.1,
    });
    this.bar.setScrollFactor(0);
    this.root.add(this.bar);

    this.percentText = scene.add
      .text(VIEW.WIDTH / 2, 54, '0%', {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.label.size}px`,
        fontStyle: '700',
        color: hex(UI_COLORS.text),
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0);
    this.root.add(this.percentText);

    // --- Level name, top left.
    this.levelText = scene.add
      .text(SPACING.lg, 22, track(options.levelName.toUpperCase(), 3), {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.caption.size}px`,
        fontStyle: '700',
        color: hex(UI_COLORS.accent),
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0);
    this.root.add(this.levelText);

    this.attemptText = scene.add
      .text(SPACING.lg, 44, 'ATTEMPT 1', {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.caption.size}px`,
        fontStyle: '600',
        color: hex(UI_COLORS.textMuted),
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0);
    this.root.add(this.attemptText);

    // --- Coin slots, top right. Three per level by convention.
    for (let i = 0; i < 3; i += 1) {
      const icon = scene.add
        .image(VIEW.WIDTH - SPACING.lg - i * 30, 30, TEX.COIN)
        .setDisplaySize(20, 20)
        .setTint(UI_COLORS.textMuted)
        .setAlpha(0.35)
        .setScrollFactor(0);
      this.coinIcons.unshift(icon);
      this.root.add(icon);
    }

    // --- Pause button, always reachable by touch.
    const pauseButton = new Button(scene, VIEW.WIDTH - SPACING.lg - 34, 74, {
      label: 'II',
      width: 46,
      height: 34,
      color: PALETTE.VIOLET,
      tracking: 0,
      fontSize: 14,
      onClick: options.onPause,
    });
    pauseButton.setScrollFactor(0);
    this.root.add(pauseButton);

    if (options.practice) {
      this.practiceBadge = this.buildPracticeBadge();
      this.root.add(this.practiceBadge);
    }

    if (options.showFps) {
      this.fpsText = scene.add
        .text(SPACING.lg, VIEW.HEIGHT - SPACING.lg, '', {
          fontFamily: FONT_STACK,
          fontSize: '12px',
          color: hex(UI_COLORS.positive),
        })
        .setOrigin(0, 1)
        .setScrollFactor(0);
      this.root.add(this.fpsText);
    }
  }

  private buildPracticeBadge(): Phaser.GameObjects.Container {
    const container = this.scene.add.container(VIEW.WIDTH / 2, VIEW.HEIGHT - 34).setScrollFactor(0);

    const background = this.scene.add.graphics();
    background.fillStyle(PALETTE.LIME, 0.16);
    background.fillRoundedRect(-140, -16, 280, 32, RADIUS.pill);
    background.lineStyle(1.5, PALETTE.LIME, 0.7);
    background.strokeRoundedRect(-140, -16, 280, 32, RADIUS.pill);

    const label = this.scene.add
      .text(0, 0, 'PRACTICE   Z ADD CP   X REMOVE CP', {
        fontFamily: FONT_STACK,
        fontSize: '12px',
        fontStyle: '700',
        color: hex(PALETTE.LIME),
      })
      .setOrigin(0.5);

    container.add([background, label]);
    return container;
  }

  // ---------- Values pushed in by the scene ----------

  setProgress(progress: number): void {
    this.bar.setProgress(progress);
    this.percentText.setText(formatPercent(progress));
  }

  setAttempts(attempts: number): void {
    this.attemptText.setText(`ATTEMPT ${attempts}`);
  }

  setCheckpoints(marks: number[]): void {
    this.bar.setMarkers(marks);
  }

  addCoin(): void {
    const icon = this.coinIcons[this.coins];
    this.coins += 1;
    if (!icon) return;

    icon.setTint(PALETTE.AMBER).setAlpha(1);
    this.scene.tweens.add({
      targets: icon,
      scale: { from: icon.scale * 1.9, to: icon.scale },
      duration: 320,
      ease: 'Back.easeOut',
    });
  }

  resetCoins(): void {
    this.coins = 0;
    for (const icon of this.coinIcons) {
      icon.setTint(UI_COLORS.textMuted).setAlpha(0.35);
    }
  }

  /** Called on every beat; makes the bar breathe with the music. */
  pulse(strength: number): void {
    this.pulseAmount = Math.min(1, this.pulseAmount + strength);
  }

  update(dt: number, fps: number): void {
    if (this.pulseAmount > 0) {
      this.pulseAmount = Math.max(0, this.pulseAmount - dt * 4);
      this.bar.setScale(1 + this.pulseAmount * 0.012, 1 + this.pulseAmount * 0.12);
    }

    this.bar.update(0, dt * 1000);

    if (this.fpsText) {
      this.fpsText.setText(`${Math.round(fps)} FPS`);
      this.fpsText.setColor(
        hex(fps >= 55 ? UI_COLORS.positive : fps >= 30 ? UI_COLORS.warning : UI_COLORS.danger),
      );
    }
  }

  // ---------- Overlays ----------

  showPause(options: PauseOptions): void {
    if (this.pauseLayer) return;

    const layer = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(DEPTH.MODAL);

    const scrim = this.scene.add
      .rectangle(0, 0, VIEW.WIDTH, VIEW.HEIGHT, PALETTE.BLACK, 0.78)
      .setOrigin(0)
      .setScrollFactor(0)
      .setInteractive();
    layer.add(scrim);

    const title = this.scene.add
      .text(VIEW.WIDTH / 2, 180, track('PAUSED', 10), {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.title.size}px`,
        fontStyle: '800',
        color: hex(PALETTE.CYAN),
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    title.setShadow(0, 0, hex(PALETTE.CYAN), 22, false, true);
    layer.add(title);

    const subtitle = this.scene.add
      .text(VIEW.WIDTH / 2, 226, this.options.levelName, {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.body.size}px`,
        color: hex(UI_COLORS.textMuted),
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    layer.add(subtitle);

    const entries: { label: string; color: number; action: () => void }[] = [
      { label: 'RESUME', color: PALETTE.CYAN, action: options.onResume },
      { label: 'RESTART', color: PALETTE.VIOLET, action: options.onRestart },
      {
        label: options.practice ? 'NORMAL MODE' : 'PRACTICE MODE',
        color: PALETTE.LIME,
        action: options.onPractice,
      },
      { label: 'QUIT TO LEVELS', color: PALETTE.MAGENTA, action: options.onQuit },
    ];

    entries.forEach((entry, index) => {
      const button = new Button(this.scene, VIEW.WIDTH / 2, 300 + index * 64, {
        label: entry.label,
        width: 300,
        height: 52,
        color: entry.color,
        tracking: 3,
        onClick: entry.action,
      });
      button.setScrollFactor(0);
      layer.add(button);
    });

    this.pauseLayer = layer;
  }

  hidePause(): void {
    this.pauseLayer?.destroy(true);
    this.pauseLayer = undefined;
  }

  showComplete(practice: boolean): void {
    if (this.completeLayer) return;

    const layer = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(DEPTH.MODAL);

    const scrim = this.scene.add
      .rectangle(0, 0, VIEW.WIDTH, VIEW.HEIGHT, PALETTE.BLACK, 0.6)
      .setOrigin(0)
      .setScrollFactor(0);
    layer.add(scrim);

    const title = this.scene.add
      .text(
        VIEW.WIDTH / 2,
        VIEW.HEIGHT / 2 - 30,
        track(practice ? 'PRACTICE CLEAR' : 'LEVEL COMPLETE', 8),
        {
          fontFamily: FONT_STACK,
          fontSize: `${TYPE.title.size}px`,
          fontStyle: '800',
          color: hex(practice ? PALETTE.AMBER : PALETTE.LIME),
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0);
    title.setShadow(0, 0, hex(practice ? PALETTE.AMBER : PALETTE.LIME), 26, false, true);
    layer.add(title);

    const subtitle = this.scene.add
      .text(
        VIEW.WIDTH / 2,
        VIEW.HEIGHT / 2 + 28,
        practice ? 'Practice runs do not count toward your record' : this.options.levelName,
        {
          fontFamily: FONT_STACK,
          fontSize: `${TYPE.body.size}px`,
          color: hex(UI_COLORS.textMuted),
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0);
    layer.add(subtitle);

    this.scene.tweens.add({
      targets: title,
      scale: { from: 0.7, to: 1 },
      duration: 460,
      ease: 'Back.easeOut',
    });

    this.completeLayer = layer;
  }

  destroy(): void {
    this.hidePause();
    this.completeLayer?.destroy(true);
    this.root.destroy(true);
    this.coinIcons.length = 0;
  }
}
