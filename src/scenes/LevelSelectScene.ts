import Phaser from 'phaser';
import { audioManager } from '@/audio/AudioManager';
import { PALETTE, SCENES, VIEW, type Difficulty } from '@/config/constants';
import { NeonBackground } from '@/effects/NeonBackground';
import { TEX } from '@/effects/TextureFactory';
import { levelManager, type LevelListing } from '@/levels/LevelManager';
import { levelLoader } from '@/levels/LevelLoader';
import type { SaveManager } from '@/save/SaveManager';
import { Button } from '@/ui/Button';
import { FONT_STACK, RADIUS, SPACING, TYPE, UI_COLORS, hex, track } from '@/ui/Theme';
import { Toast } from '@/ui/Toast';
import { formatPercent } from '@/utils/TimeUtils';

/** Colour per difficulty tier, so the list can be scanned at a glance. */
const DIFFICULTY_COLORS: Record<Difficulty, number> = {
  Easy: PALETTE.LIME,
  Normal: PALETTE.CYAN,
  Hard: PALETTE.AMBER,
  Harder: PALETTE.MAGENTA,
  Insane: PALETTE.CORAL,
  Demon: PALETTE.VIOLET,
};

/**
 * Browses the levels the player can reach.
 *
 * Levels are shown as cards in a scrolling column: official levels first, then
 * anything the player made or imported. Progress comes from the save, so a card
 * shows the record before the level body has been fetched.
 */
export class LevelSelectScene extends Phaser.Scene {
  private save!: SaveManager;
  private background!: NeonBackground;
  private toast!: Toast;

  private listContainer!: Phaser.GameObjects.Container;
  private listings: LevelListing[] = [];

  private scrollY = 0;
  private maxScroll = 0;
  private lastTime = 0;

  private practiceMode = false;
  private practiceButton?: Button;

  constructor() {
    super({ key: SCENES.LEVEL_SELECT });
  }

  create(): void {
    this.save = this.registry.get('save') as SaveManager;
    this.scrollY = 0;

    this.cameras.main.setBackgroundColor(PALETTE.BG_DEEP);
    this.cameras.main.fadeIn(260, 8, 3, 18);

    this.background = new NeonBackground(this, {
      pattern: 'stars',
      accent: PALETTE.CYAN,
      motion: this.save.settings.reducedMotion ? 0.25 : 0.6,
      seed: 4242,
    });

    this.toast = new Toast(this);

    this.loadListings();
    this.buildHeader();
    this.buildList();
    this.buildFooter();
    this.attachScrolling();
  }

  private loadListings(): void {
    if (!levelManager.hasManifest) {
      levelManager.loadManifest(this.registry.get('levelManifest'));
    }
    levelManager.loadCreated(this.save);
    this.listings = levelManager.list();
  }

  private buildHeader(): void {
    this.add
      .text(SPACING.xl, 46, track('SELECT LEVEL', 8), {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.heading.size}px`,
        fontStyle: '800',
        color: hex(PALETTE.CYAN),
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0);

    new Button(this, VIEW.WIDTH - SPACING.xl - 60, 46, {
      label: 'BACK',
      width: 120,
      height: 40,
      color: PALETTE.GREY,
      tracking: 2,
      fontSize: 13,
      onClick: () => this.go(SCENES.MAIN_MENU),
    }).setScrollFactor(0);
  }

  /**
   * Builds one card per level.
   *
   * Cards are plain containers rather than pooled objects: there are at most a
   * few dozen levels, and the simplicity is worth more here than the recycling
   * would be.
   */
  private buildList(): void {
    this.listContainer = this.add.container(0, 0);

    const cardHeight = 92;
    const gap = 14;
    const top = 96;

    this.listings.forEach((listing, index) => {
      const card = this.buildCard(listing, index);
      card.setPosition(VIEW.WIDTH / 2, top + index * (cardHeight + gap) + cardHeight / 2);
      this.listContainer.add(card);
    });

    const contentHeight = this.listings.length * (cardHeight + gap);
    const viewportHeight = VIEW.HEIGHT - top - 80;
    this.maxScroll = Math.max(0, contentHeight - viewportHeight);

    if (this.listings.length === 0) {
      this.add
        .text(
          VIEW.WIDTH / 2,
          VIEW.HEIGHT / 2,
          'No levels found.\nCheck that public/levels was generated.',
          {
            fontFamily: FONT_STACK,
            fontSize: `${TYPE.body.size}px`,
            color: hex(UI_COLORS.textMuted),
            align: 'center',
          },
        )
        .setOrigin(0.5);
    }
  }

  private buildCard(listing: LevelListing, index: number): Phaser.GameObjects.Container {
    const width = VIEW.WIDTH - SPACING.xl * 2;
    const height = 92;
    const accent = DIFFICULTY_COLORS[listing.difficulty] ?? PALETTE.CYAN;
    const progress = this.save.current.progress[listing.id];

    const card = this.add.container(0, 0);

    const background = this.add.graphics();
    const drawCard = (hovered: boolean): void => {
      background.clear();
      background.fillStyle(PALETTE.BG_MID, hovered ? 0.95 : 0.78);
      background.fillRoundedRect(-width / 2, -height / 2, width, height, RADIUS.md);
      background.lineStyle(hovered ? 2.5 : 1.5, accent, hovered ? 1 : 0.45);
      background.strokeRoundedRect(-width / 2, -height / 2, width, height, RADIUS.md);
      // A thick accent bar on the left edge encodes the difficulty.
      background.fillStyle(accent, 0.95);
      background.fillRoundedRect(-width / 2 + 4, -height / 2 + 10, 5, height - 20, 3);
    };
    drawCard(false);
    card.add(background);

    const name = this.add
      .text(-width / 2 + 30, -20, listing.name.toUpperCase(), {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.heading.size - 4}px`,
        fontStyle: '800',
        color: hex(UI_COLORS.text),
      })
      .setOrigin(0, 0.5);
    card.add(name);

    const meta = this.add
      .text(
        -width / 2 + 30,
        10,
        `${listing.difficulty.toUpperCase()}   ${listing.creator.toUpperCase()}` +
          (listing.source !== 'official' ? `   ${listing.source.toUpperCase()}` : ''),
        {
          fontFamily: FONT_STACK,
          fontSize: `${TYPE.caption.size}px`,
          fontStyle: '600',
          color: hex(accent),
        },
      )
      .setOrigin(0, 0.5);
    card.add(meta);

    const best = progress?.bestProgress ?? 0;
    const attempts = progress?.attempts ?? 0;
    const completed = progress?.completed ?? false;

    const stats = this.add
      .text(width / 2 - 30, -20, completed ? 'COMPLETE' : `BEST ${formatPercent(best)}`, {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.label.size}px`,
        fontStyle: '800',
        color: hex(completed ? PALETTE.LIME : UI_COLORS.text),
      })
      .setOrigin(1, 0.5);
    card.add(stats);

    const attemptText = this.add
      .text(width / 2 - 30, 10, `${attempts} ATTEMPTS`, {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.caption.size}px`,
        fontStyle: '600',
        color: hex(UI_COLORS.textMuted),
      })
      .setOrigin(1, 0.5);
    card.add(attemptText);

    // Coin slots: three per level, filled as they are found.
    const coinsFound = progress?.coinsCollected.length ?? 0;
    for (let i = 0; i < 3; i += 1) {
      const icon = this.add
        .image(width / 2 - 30 - (2 - i) * 22, 32, TEX.COIN)
        .setDisplaySize(14, 14)
        .setTint(i < coinsFound ? PALETTE.AMBER : UI_COLORS.textMuted)
        .setAlpha(i < coinsFound ? 1 : 0.3);
      card.add(icon);
    }

    // A thin completion bar along the bottom of the card.
    if (best > 0) {
      const barWidth = (width - 60) * best;
      const bar = this.add.graphics();
      bar.fillStyle(completed ? PALETTE.LIME : accent, 0.75);
      bar.fillRoundedRect(-width / 2 + 30, height / 2 - 14, barWidth, 4, 2);
      card.add(bar);
    }

    card.setSize(width, height);
    card.setInteractive(
      new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
      Phaser.Geom.Rectangle.Contains,
    );

    card.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      drawCard(true);
      audioManager.play('hover');
    });
    card.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => drawCard(false));
    card.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.playLevel(listing));

    card.setAlpha(0);
    this.tweens.add({
      targets: card,
      alpha: 1,
      duration: 280,
      delay: index * 45,
      ease: 'Quad.easeOut',
    });

    return card;
  }

  private buildFooter(): void {
    const y = VIEW.HEIGHT - 40;

    this.practiceButton = new Button(this, SPACING.xl + 90, y, {
      label: 'PRACTICE: OFF',
      width: 200,
      height: 40,
      color: PALETTE.LIME,
      tracking: 1,
      fontSize: 13,
      onClick: () => this.togglePractice(),
    });
    this.practiceButton.setScrollFactor(0);

    new Button(this, SPACING.xl + 300, y, {
      label: 'IMPORT LEVEL',
      width: 190,
      height: 40,
      color: PALETTE.VIOLET,
      tracking: 1,
      fontSize: 13,
      onClick: () => this.importLevel(),
    }).setScrollFactor(0);

    this.add
      .text(VIEW.WIDTH - SPACING.xl, y, 'SCROLL TO BROWSE   CLICK TO PLAY', {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.caption.size}px`,
        fontStyle: '600',
        color: hex(UI_COLORS.textMuted),
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0);
  }

  private togglePractice(): void {
    this.practiceMode = !this.practiceMode;
    this.practiceButton?.setLabel(this.practiceMode ? 'PRACTICE: ON' : 'PRACTICE: OFF');
    audioManager.play('click');
  }

  /**
   * Opens a file picker and imports the chosen level.
   *
   * A DOM input is used rather than a Phaser control because only a real file
   * input can open the OS picker, and only from inside a user gesture.
   */
  private importLevel(): void {
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
          const result = levelLoader.fromJson(text);
          if (!result.ok) {
            this.toast.show(`Import failed: ${result.error}`, 'error');
            return;
          }
          levelManager.addImported(result.level);
          this.toast.show(`Imported "${result.level.name}"`, 'success');
          this.scene.restart();
        })
        .catch((error: unknown) => {
          this.toast.show(
            `Could not read file: ${error instanceof Error ? error.message : 'unknown error'}`,
            'error',
          );
        });
    });

    document.body.appendChild(input);
    input.click();
  }

  private playLevel(listing: LevelListing): void {
    audioManager.play('click');
    void audioManager.unlock();

    this.cameras.main.fadeOut(200, 8, 3, 18);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SCENES.GAMEPLAY, { levelId: listing.id, practice: this.practiceMode });
    });
  }

  /** Mouse wheel, drag and arrow keys all scroll the list. */
  private attachScrolling(): void {
    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (_pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
        this.scrollBy(dy * 0.6);
      },
    );

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      this.scrollBy(-(pointer.y - pointer.prevPosition.y));
    });

    const keyboard = this.input.keyboard;
    keyboard?.on('keydown-ESC', () => this.go(SCENES.MAIN_MENU));
    keyboard?.on('keydown-DOWN', () => this.scrollBy(70));
    keyboard?.on('keydown-UP', () => this.scrollBy(-70));
  }

  private scrollBy(amount: number): void {
    this.scrollY = Phaser.Math.Clamp(this.scrollY + amount, 0, this.maxScroll);
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
    // Ease toward the scroll target so wheel steps and drags both feel smooth.
    this.listContainer.y += (-this.scrollY - this.listContainer.y) * Math.min(1, dt * 14);
    this.toast.update(dt);
  }
}
