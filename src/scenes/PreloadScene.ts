import Phaser from 'phaser';
import { PALETTE, SCENES, VIEW } from '@/config/constants';
import { generateCoreTextures } from '@/effects/TextureFactory';
import { saveManager } from '@/save/SaveManager';
import { ProgressBar } from '@/ui/ProgressBar';
import { FONT_STACK, TYPE, UI_COLORS, hex, track } from '@/ui/Theme';
import { logger } from '@/utils/Logger';

/**
 * The loading screen.
 *
 * NEON DASH generates its art and audio rather than downloading it, so there is
 * little to wait for; this scene still exists because the level manifest is a
 * real network fetch and because a game that flashes straight to a menu feels
 * broken. Work is spread across a few frames so the bar visibly moves.
 */
export class PreloadScene extends Phaser.Scene {
  private bar!: ProgressBar;
  private statusText!: Phaser.GameObjects.Text;
  private steps: { label: string; run: () => void | Promise<void> }[] = [];
  private stepIndex = 0;
  private failed = false;

  constructor() {
    super({ key: SCENES.PRELOAD });
  }

  preload(): void {
    // The level manifest is the one genuinely external file. A failure here is
    // survivable: LevelManager falls back to the levels built into the bundle.
    this.load.json('level-manifest', 'levels/manifest.json');

    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      logger.warn('PreloadScene', `Optional file failed to load: ${file.key}`);
    });
  }

  create(): void {
    this.buildScreen();

    this.steps = [
      { label: 'Generating textures', run: () => generateCoreTextures(this) },
      { label: 'Reading save data', run: () => this.loadSave() },
      { label: 'Preparing audio', run: () => this.prepareAudio() },
      { label: 'Indexing levels', run: () => this.indexLevels() },
    ];

    this.runNextStep();
  }

  private buildScreen(): void {
    const cx = VIEW.WIDTH / 2;
    const cy = VIEW.HEIGHT / 2;

    this.cameras.main.setBackgroundColor(PALETTE.BG_DEEP);

    const glow = this.add.graphics();
    glow.fillStyle(PALETTE.BG_GLOW, 0.55);
    glow.fillCircle(cx, cy - 30, 260);
    glow.setBlendMode(Phaser.BlendModes.ADD);

    const wordmark = this.add
      .text(cx, cy - 70, track('NEON DASH', 12), {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.title.size}px`,
        fontStyle: '800',
        color: hex(PALETTE.CYAN),
      })
      .setOrigin(0.5);
    wordmark.setShadow(0, 0, hex(PALETTE.CYAN), 18, false, true);

    this.bar = new ProgressBar(this, cx, cy + 20, {
      width: 460,
      height: 14,
      color: PALETTE.MAGENTA,
      showLabel: false,
      smoothing: 0.12,
    });

    this.statusText = this.add
      .text(cx, cy + 56, '', {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.caption.size}px`,
        fontStyle: '600',
        color: hex(UI_COLORS.textMuted),
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: wordmark,
      alpha: { from: 0.72, to: 1 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /**
   * Runs one step per frame.
   *
   * Doing the work inside a `time.delayedCall` rather than a tight loop lets the
   * bar repaint between steps; the alternative completes just as fast but shows
   * the player a frozen screen.
   */
  private runNextStep(): void {
    if (this.failed) return;

    if (this.stepIndex >= this.steps.length) {
      this.finish();
      return;
    }

    const step = this.steps[this.stepIndex];
    if (!step) {
      this.finish();
      return;
    }

    this.statusText.setText(step.label);
    this.bar.setProgress(this.stepIndex / this.steps.length);

    this.time.delayedCall(60, () => {
      void (async () => {
        try {
          await step.run();
        } catch (error) {
          // A failed step is reported and skipped rather than aborting the boot:
          // a missing manifest should not stop the player reaching the menu.
          logger.error('PreloadScene', `Step "${step.label}" failed`, error);
          this.statusText.setColor(hex(UI_COLORS.warning));
          this.statusText.setText(`${step.label} - skipped`);
        }
        this.stepIndex += 1;
        this.runNextStep();
      })();
    });
  }

  private loadSave(): void {
    const data = saveManager.load();
    // Hand the save to every other scene through the registry rather than a
    // module-level import, so tests can inject a different one.
    this.registry.set('save', saveManager);
    this.registry.set('settings', data.settings);

    if (data.settings.showFps) this.registry.set('showFps', true);
  }

  private prepareAudio(): void {
    // Browsers refuse to start audio before a gesture, so the context is only
    // created here and resumed on the player's first interaction in the menu.
    this.registry.set('audioUnlocked', this.sound.locked === false);
  }

  private indexLevels(): void {
    const manifest = this.cache.json.get('level-manifest') as unknown;
    this.registry.set('levelManifest', manifest ?? null);
  }

  private finish(): void {
    this.bar.setProgress(1);
    this.statusText.setText('Ready');

    this.time.delayedCall(220, () => {
      this.cameras.main.fadeOut(220, 8, 3, 18);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start(SCENES.MAIN_MENU);
      });
    });
  }

  override update(time: number, delta: number): void {
    this.bar.update(time, delta);
  }
}
