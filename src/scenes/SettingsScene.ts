import Phaser from 'phaser';
import { audioManager } from '@/audio/AudioManager';
import { PALETTE, SCENES, VIEW } from '@/config/constants';
import { NeonBackground } from '@/effects/NeonBackground';
import type { SaveManager } from '@/save/SaveManager';
import type { SettingsData } from '@/save/SaveData';
import { Button } from '@/ui/Button';
import { Slider } from '@/ui/Slider';
import { Toggle } from '@/ui/Toggle';
import { FONT_STACK, SPACING, TYPE, UI_COLORS, hex, track } from '@/ui/Theme';
import { Toast } from '@/ui/Toast';

/**
 * Audio, video and accessibility options.
 *
 * Every control writes straight through to the save and applies immediately —
 * there is no Apply button and no staged copy of the settings, because a player
 * adjusting a volume slider needs to hear the result while they are dragging
 * it.
 */
export class SettingsScene extends Phaser.Scene {
  private save!: SaveManager;
  private background!: NeonBackground;
  private toast!: Toast;
  private lastTime = 0;

  constructor() {
    super({ key: SCENES.SETTINGS });
  }

  create(): void {
    this.save = this.registry.get('save') as SaveManager;

    this.cameras.main.setBackgroundColor(PALETTE.BG_DEEP);
    this.cameras.main.fadeIn(260, 8, 3, 18);

    this.background = new NeonBackground(this, {
      pattern: 'waves',
      accent: PALETTE.MAGENTA,
      motion: this.save.settings.reducedMotion ? 0.25 : 0.5,
      seed: 909,
    });

    this.toast = new Toast(this);

    this.buildHeader();
    this.buildAudioColumn();
    this.buildDisplayColumn();
    this.buildFooter();

    this.input.keyboard?.on('keydown-ESC', () => this.go(SCENES.MAIN_MENU));
  }

  private buildHeader(): void {
    this.add
      .text(SPACING.xl, 46, track('SETTINGS', 8), {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.heading.size}px`,
        fontStyle: '800',
        color: hex(PALETTE.MAGENTA),
      })
      .setOrigin(0, 0.5);

    new Button(this, VIEW.WIDTH - SPACING.xl - 60, 46, {
      label: 'BACK',
      width: 120,
      height: 40,
      color: PALETTE.GREY,
      tracking: 2,
      fontSize: 13,
      onClick: () => this.go(SCENES.MAIN_MENU),
    });
  }

  private sectionTitle(x: number, y: number, text: string, color: number): void {
    this.add
      .text(x, y, track(text, 4), {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.label.size}px`,
        fontStyle: '800',
        color: hex(color),
      })
      .setOrigin(0, 0.5);
  }

  private buildAudioColumn(): void {
    const x = SPACING.xl;
    let y = 120;
    const settings = this.save.settings;

    this.sectionTitle(x, y, 'AUDIO', PALETTE.CYAN);
    y += 46;

    new Slider(this, x, y, {
      label: 'MASTER VOLUME',
      value: settings.masterVolume,
      color: PALETTE.CYAN,
      onChange: (value) => this.applyAudio({ masterVolume: value }),
    });
    y += 68;

    new Slider(this, x, y, {
      label: 'MUSIC VOLUME',
      value: settings.musicVolume,
      color: PALETTE.CYAN,
      onChange: (value) => this.applyAudio({ musicVolume: value }),
    });
    y += 68;

    new Slider(this, x, y, {
      label: 'SFX VOLUME',
      value: settings.sfxVolume,
      color: PALETTE.CYAN,
      // Play a sound on release so the player hears the level they just set.
      onRelease: () => audioManager.play('click'),
      onChange: (value) => this.applyAudio({ sfxVolume: value }),
    });
    y += 78;

    this.sectionTitle(x, y, 'TIMING', PALETTE.AMBER);
    y += 46;

    new Slider(this, x, y, {
      label: 'AUDIO OFFSET',
      value: (settings.audioOffsetMs + 200) / 400,
      color: PALETTE.AMBER,
      format: (value) => `${Math.round(value * 400 - 200)} ms`,
      onChange: (value) => {
        this.save.updateSettings({ audioOffsetMs: Math.round(value * 400 - 200) });
      },
    });
    y += 68;

    new Slider(this, x, y, {
      label: 'INPUT OFFSET',
      value: (settings.inputOffsetMs + 100) / 200,
      color: PALETTE.AMBER,
      format: (value) => `${Math.round(value * 200 - 100)} ms`,
      onChange: (value) => {
        this.save.updateSettings({ inputOffsetMs: Math.round(value * 200 - 100) });
      },
    });
  }

  private buildDisplayColumn(): void {
    const x = VIEW.WIDTH / 2 + SPACING.md;
    let y = 120;
    const settings = this.save.settings;

    this.sectionTitle(x, y, 'DISPLAY', PALETTE.VIOLET);
    y += 46;

    new Slider(this, x, y, {
      label: 'SCREEN SHAKE',
      value: settings.screenShake,
      color: PALETTE.VIOLET,
      format: (value) => (value <= 0.001 ? 'OFF' : `${Math.round(value * 100)}%`),
      onChange: (value) => this.save.updateSettings({ screenShake: value }),
    });
    y += 68;

    const qualities: SettingsData['quality'][] = ['low', 'medium', 'high'];
    this.add
      .text(x, y - 6, 'QUALITY', {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.caption.size}px`,
        fontStyle: '700',
        color: hex(UI_COLORS.textMuted),
      })
      .setOrigin(0, 0.5);

    const qualityButtons: Button[] = [];
    qualities.forEach((quality, index) => {
      const button = new Button(this, x + 66 + index * 132, y + 30, {
        label: quality.toUpperCase(),
        width: 124,
        height: 38,
        color: PALETTE.VIOLET,
        variant: settings.quality === quality ? 'solid' : 'ghost',
        fontSize: 13,
        onClick: () => {
          this.save.updateSettings({ quality });
          // Re-render the row so the selected state is visible; cheaper and
          // clearer than tracking three buttons' variants by hand.
          qualityButtons.forEach((other, otherIndex) => {
            other.setEnabled(true);
            other.setLabel(qualities[otherIndex]?.toUpperCase() ?? '');
          });
          this.scene.restart();
        },
      });
      qualityButtons.push(button);
    });
    y += 88;

    new Toggle(this, x, y, {
      label: 'SHOW FPS',
      value: settings.showFps,
      color: PALETTE.LIME,
      onChange: (value) => this.save.updateSettings({ showFps: value }),
    });
    y += 54;

    new Toggle(this, x, y, {
      label: 'SHOW HITBOXES',
      value: settings.showHitboxes,
      color: PALETTE.LIME,
      onChange: (value) => this.save.updateSettings({ showHitboxes: value }),
    });
    y += 54;

    new Toggle(this, x, y, {
      label: 'REDUCED MOTION',
      value: settings.reducedMotion,
      color: PALETTE.LIME,
      onChange: (value) => {
        this.save.updateSettings({ reducedMotion: value });
        this.background.setMotion(value ? 0.25 : 0.5);
      },
    });
    y += 54;

    new Toggle(this, x, y, {
      label: 'FULLSCREEN',
      value: this.scale.isFullscreen,
      color: PALETTE.LIME,
      onChange: (value) => this.setFullscreen(value),
    });
  }

  /**
   * Fullscreen can only be requested from a user gesture and can be refused by
   * the browser, so the setting records intent and the actual state is read back
   * from the scale manager.
   */
  private setFullscreen(enabled: boolean): void {
    try {
      if (enabled && !this.scale.isFullscreen) this.scale.startFullscreen();
      else if (!enabled && this.scale.isFullscreen) this.scale.stopFullscreen();
      this.save.updateSettings({ fullscreen: enabled });
    } catch {
      this.toast.show('Fullscreen was refused by the browser', 'warning');
    }
  }

  private applyAudio(patch: Partial<SettingsData>): void {
    const settings = this.save.updateSettings(patch);
    audioManager.setVolume('master', settings.masterVolume);
    audioManager.setVolume('music', settings.musicVolume);
    audioManager.setVolume('sfx', settings.sfxVolume);
  }

  private buildFooter(): void {
    const y = VIEW.HEIGHT - 46;

    new Button(this, SPACING.xl + 110, y, {
      label: 'EXPORT SAVE',
      width: 200,
      height: 42,
      color: PALETTE.CYAN,
      fontSize: 13,
      onClick: () => this.exportSave(),
    });

    new Button(this, SPACING.xl + 322, y, {
      label: 'IMPORT SAVE',
      width: 200,
      height: 42,
      color: PALETTE.VIOLET,
      fontSize: 13,
      onClick: () => this.importSave(),
    });

    new Button(this, VIEW.WIDTH - SPACING.xl - 110, y, {
      label: 'RESET PROGRESS',
      width: 210,
      height: 42,
      variant: 'danger',
      fontSize: 13,
      onClick: () => this.confirmReset(),
    });
  }

  /**
   * Offers the save as a download.
   *
   * An anchor with a blob URL is the only way to hand the browser a file the
   * page generated; the URL is revoked immediately after to release the memory.
   */
  private exportSave(): void {
    try {
      const json = JSON.stringify(this.save.export(), null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `neon-dash-save-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      this.toast.show('Save exported', 'success');
    } catch (error) {
      this.toast.show(
        `Export failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        'error',
      );
    }
  }

  private importSave(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;

      void file
        .text()
        .then((text) => {
          const parsed: unknown = JSON.parse(text);
          if (this.save.import(parsed)) {
            this.toast.show('Save imported', 'success');
            this.time.delayedCall(700, () => this.scene.restart());
          } else {
            this.toast.show('That file is not a valid NEON DASH save', 'error');
          }
        })
        .catch(() => this.toast.show('That file is not valid JSON', 'error'));
    });

    document.body.appendChild(input);
    input.click();
  }

  private confirmReset(): void {
    // Deliberately a two-step: erasing every record should not be one misclick.
    const confirmButton = new Button(this, VIEW.WIDTH / 2, VIEW.HEIGHT / 2, {
      label: 'CONFIRM: ERASE ALL PROGRESS',
      width: 460,
      height: 62,
      variant: 'danger',
      onClick: () => {
        this.save.reset();
        this.toast.show('Progress reset', 'warning');
        confirmButton.destroy();
        this.time.delayedCall(600, () => this.scene.restart());
      },
    });

    this.time.delayedCall(4000, () => confirmButton.destroy());
  }

  private go(scene: string): void {
    this.save.flush();
    this.cameras.main.fadeOut(200, 8, 3, 18);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(scene);
    });
  }

  override update(time: number): void {
    const dt = this.lastTime === 0 ? 0 : (time - this.lastTime) / 1000;
    this.lastTime = time;
    this.background.update(dt);
    this.toast.update(dt);
  }
}
