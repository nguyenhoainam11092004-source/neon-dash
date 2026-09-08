import Phaser from 'phaser';
import { audioManager } from '@/audio/AudioManager';
import { PALETTE, SCENES, VIEW } from '@/config/constants';
import { NeonBackground } from '@/effects/NeonBackground';
import { TEX } from '@/effects/TextureFactory';
import { levelManager } from '@/levels/LevelManager';
import { ProgressManager } from '@/progression/ProgressManager';
import type { CosmeticDefinition } from '@/progression/InventoryManager';
import type { SaveManager } from '@/save/SaveManager';
import { Button } from '@/ui/Button';
import { ProgressBar } from '@/ui/ProgressBar';
import { FONT_STACK, RADIUS, SPACING, TYPE, UI_COLORS, hex, track } from '@/ui/Theme';
import { Toast } from '@/ui/Toast';
import { formatTime } from '@/utils/TimeUtils';
import { parseHexColor } from '@/utils/MathUtils';

type Tab = 'stats' | 'achievements' | 'customize';

/**
 * The player's record: statistics, achievements and cosmetics.
 *
 * Three tabs share one scene because they all read from the same save and the
 * player moves between them constantly; separate scenes would mean three
 * reloads of the same data and three fade transitions to look at one number.
 */
export class ProfileScene extends Phaser.Scene {
  private save!: SaveManager;
  private progression!: ProgressManager;
  private background!: NeonBackground;
  private toast!: Toast;

  private tab: Tab = 'stats';
  private tabButtons: Button[] = [];
  private content!: Phaser.GameObjects.Container;
  private lastTime = 0;

  constructor() {
    super({ key: SCENES.PROFILE });
  }

  create(): void {
    this.save = this.registry.get('save') as SaveManager;
    this.progression = new ProgressManager(this.save, levelManager);
    // Opening the profile is a natural moment to reconcile achievements with
    // whatever the player has done since the last check.
    this.progression.achievements.evaluate();

    this.cameras.main.setBackgroundColor(PALETTE.BG_DEEP);
    this.cameras.main.fadeIn(260, 8, 3, 18);

    this.background = new NeonBackground(this, {
      pattern: 'rings',
      accent: PALETTE.AMBER,
      motion: this.save.settings.reducedMotion ? 0.25 : 0.5,
      seed: 7171,
    });

    this.toast = new Toast(this);
    this.content = this.add.container(0, 0);

    this.buildHeader();
    this.buildTabs();
    this.renderTab();

    this.input.keyboard?.on('keydown-ESC', () => this.go(SCENES.MAIN_MENU));
  }

  private buildHeader(): void {
    this.add
      .text(SPACING.xl, 46, track('PROFILE', 8), {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.heading.size}px`,
        fontStyle: '800',
        color: hex(PALETTE.AMBER),
      })
      .setOrigin(0, 0.5);

    const summary = this.progression.summary();
    this.add
      .text(SPACING.xl + 220, 48, `${summary.currency} COINS`, {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.label.size}px`,
        fontStyle: '800',
        color: hex(PALETTE.AMBER),
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

  private buildTabs(): void {
    const tabs: { id: Tab; label: string; color: number }[] = [
      { id: 'stats', label: 'STATS', color: PALETTE.CYAN },
      { id: 'achievements', label: 'ACHIEVEMENTS', color: PALETTE.LIME },
      { id: 'customize', label: 'CUSTOMISE', color: PALETTE.MAGENTA },
    ];

    this.tabButtons = tabs.map((tab, index) => {
      return new Button(this, SPACING.xl + 100 + index * 210, 106, {
        label: tab.label,
        width: 200,
        height: 42,
        color: tab.color,
        variant: this.tab === tab.id ? 'solid' : 'ghost',
        fontSize: 13,
        onClick: () => {
          if (this.tab === tab.id) return;
          this.tab = tab.id;
          audioManager.play('click');
          this.refreshTabs(tabs);
          this.renderTab();
        },
      });
    });
  }

  private refreshTabs(tabs: { id: Tab; label: string; color: number }[]): void {
    // Rebuilding is simpler than mutating a variant in place, and there are
    // only three of them.
    for (const button of this.tabButtons) button.destroy();
    this.buildTabs();
    void tabs;
  }

  private renderTab(): void {
    this.content.removeAll(true);

    switch (this.tab) {
      case 'stats':
        this.renderStats();
        break;
      case 'achievements':
        this.renderAchievements();
        break;
      case 'customize':
        this.renderCustomize();
        break;
    }
  }

  // ---------- Stats ----------

  private renderStats(): void {
    const summary = this.progression.summary();
    const top = 170;

    const bar = new ProgressBar(this, VIEW.WIDTH / 2, top, {
      width: VIEW.WIDTH - SPACING.xl * 2,
      height: 26,
      color: PALETTE.AMBER,
      showLabel: true,
      smoothing: 0,
    });
    bar.setProgressImmediate(summary.completion);
    this.content.add(bar);

    this.content.add(
      this.add
        .text(VIEW.WIDTH / 2, top + 30, 'TOTAL COMPLETION', {
          fontFamily: FONT_STACK,
          fontSize: `${TYPE.caption.size}px`,
          fontStyle: '700',
          color: hex(UI_COLORS.textMuted),
        })
        .setOrigin(0.5, 0),
    );

    const rows: [string, string, number][] = [
      ['LEVELS COMPLETED', `${summary.levelsCompleted} / ${summary.levelsAvailable}`, PALETTE.CYAN],
      ['COINS COLLECTED', `${summary.coinsCollected} / ${summary.coinsAvailable}`, PALETTE.AMBER],
      [
        'ACHIEVEMENTS',
        `${summary.achievementsUnlocked} / ${summary.achievementsTotal}`,
        PALETTE.LIME,
      ],
      ['COSMETICS OWNED', `${summary.cosmeticsOwned} / ${summary.cosmeticsTotal}`, PALETTE.MAGENTA],
      ['TOTAL ATTEMPTS', `${summary.totalAttempts}`, PALETTE.VIOLET],
      ['TOTAL DEATHS', `${summary.totalDeaths}`, PALETTE.CORAL],
      ['TOTAL JUMPS', `${summary.totalJumps}`, PALETTE.CYAN],
      ['TIME PLAYED', formatTime(summary.timePlayed), PALETTE.WHITE],
    ];

    const columns = 2;
    const cellWidth = (VIEW.WIDTH - SPACING.xl * 2 - SPACING.lg) / columns;

    rows.forEach(([label, value, color], index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = SPACING.xl + column * (cellWidth + SPACING.lg);
      const y = top + 74 + row * 78;

      const card = this.add.graphics();
      card.fillStyle(PALETTE.BG_MID, 0.7);
      card.fillRoundedRect(x, y, cellWidth, 62, RADIUS.md);
      card.lineStyle(1.5, color, 0.45);
      card.strokeRoundedRect(x, y, cellWidth, 62, RADIUS.md);
      card.fillStyle(color, 0.9);
      card.fillRoundedRect(x + 4, y + 10, 4, 42, 2);
      this.content.add(card);

      this.content.add(
        this.add
          .text(x + SPACING.md + 6, y + 18, label, {
            fontFamily: FONT_STACK,
            fontSize: `${TYPE.caption.size}px`,
            fontStyle: '700',
            color: hex(UI_COLORS.textMuted),
          })
          .setOrigin(0, 0.5),
      );

      this.content.add(
        this.add
          .text(x + cellWidth - SPACING.md, y + 34, value, {
            fontFamily: FONT_STACK,
            fontSize: `${TYPE.heading.size - 4}px`,
            fontStyle: '800',
            color: hex(color),
          })
          .setOrigin(1, 0.5),
      );
    });
  }

  // ---------- Achievements ----------

  private renderAchievements(): void {
    const list = this.progression.achievements.visible();
    const top = 170;
    const cardWidth = (VIEW.WIDTH - SPACING.xl * 2 - SPACING.md) / 2;
    const cardHeight = 78;

    list.forEach((definition, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = SPACING.xl + column * (cardWidth + SPACING.md);
      const y = top + row * (cardHeight + SPACING.sm);

      // Only six rows fit; the rest are reachable once earlier ones unlock,
      // which keeps this screen scroll-free.
      if (y + cardHeight > VIEW.HEIGHT - 30) return;

      const unlocked = this.progression.achievements.isUnlocked(definition.id);
      const fraction = this.progression.achievements.fraction(definition.id);
      const color = unlocked ? PALETTE.LIME : UI_COLORS.textMuted;

      const card = this.add.graphics();
      card.fillStyle(PALETTE.BG_MID, unlocked ? 0.85 : 0.55);
      card.fillRoundedRect(x, y, cardWidth, cardHeight, RADIUS.md);
      card.lineStyle(1.5, color, unlocked ? 0.9 : 0.3);
      card.strokeRoundedRect(x, y, cardWidth, cardHeight, RADIUS.md);
      // Progress toward an unearned achievement, drawn along the bottom edge.
      if (!unlocked && fraction > 0) {
        card.fillStyle(PALETTE.AMBER, 0.75);
        card.fillRoundedRect(x + 10, y + cardHeight - 9, (cardWidth - 20) * fraction, 3, 2);
      }
      this.content.add(card);

      const star = this.add
        .image(x + 30, y + cardHeight / 2, TEX.STAR)
        .setDisplaySize(24, 24)
        .setTint(unlocked ? PALETTE.AMBER : UI_COLORS.textMuted)
        .setAlpha(unlocked ? 1 : 0.3);
      this.content.add(star);

      this.content.add(
        this.add
          .text(x + 56, y + 24, definition.name.toUpperCase(), {
            fontFamily: FONT_STACK,
            fontSize: `${TYPE.label.size}px`,
            fontStyle: '800',
            color: hex(unlocked ? UI_COLORS.text : UI_COLORS.textMuted),
          })
          .setOrigin(0, 0.5),
      );

      this.content.add(
        this.add
          .text(x + 56, y + 48, definition.description, {
            fontFamily: FONT_STACK,
            fontSize: `${TYPE.caption.size}px`,
            color: hex(UI_COLORS.textMuted),
          })
          .setOrigin(0, 0.5),
      );

      this.content.add(
        this.add
          .text(x + cardWidth - 14, y + 24, unlocked ? 'UNLOCKED' : `+${definition.reward}`, {
            fontFamily: FONT_STACK,
            fontSize: `${TYPE.caption.size}px`,
            fontStyle: '800',
            color: hex(unlocked ? PALETTE.LIME : PALETTE.AMBER),
          })
          .setOrigin(1, 0.5),
      );
    });
  }

  // ---------- Customise ----------

  private renderCustomize(): void {
    const inventory = this.progression.inventory;
    const top = 168;

    // A live preview of the equipped colours.
    const equipped = inventory.equipped;
    const preview = this.add.graphics();
    const primary = parseHexColor(equipped.primaryColor) ?? PALETTE.CYAN;
    const secondary = parseHexColor(equipped.secondaryColor) ?? PALETTE.MAGENTA;
    preview.fillStyle(primary, 1);
    preview.fillRoundedRect(VIEW.WIDTH / 2 - 28, top - 6, 56, 56, 8);
    preview.fillStyle(secondary, 1);
    preview.fillRoundedRect(VIEW.WIDTH / 2 - 12, top + 10, 24, 24, 4);
    preview.lineStyle(3, PALETTE.WHITE, 0.85);
    preview.strokeRoundedRect(VIEW.WIDTH / 2 - 28, top - 6, 56, 56, 8);
    this.content.add(preview);

    let y = top + 76;

    y = this.renderCosmeticRow('PRIMARY COLOUR', inventory.byKind('color'), y, (item) =>
      this.equip(item, 'primary'),
    );
    y = this.renderCosmeticRow('SECONDARY COLOUR', inventory.byKind('color'), y, (item) =>
      this.equip(item, 'secondary'),
    );
    y = this.renderCosmeticRow('TRAIL', inventory.byKind('trail'), y, (item) => this.equip(item));
    this.renderCosmeticRow('DEATH EFFECT', inventory.byKind('death'), y, (item) =>
      this.equip(item),
    );
  }

  /** Draws one labelled row of cosmetic chips and returns the next y. */
  private renderCosmeticRow(
    label: string,
    items: CosmeticDefinition[],
    y: number,
    onPick: (item: CosmeticDefinition) => void,
  ): number {
    this.content.add(
      this.add
        .text(SPACING.xl, y, label, {
          fontFamily: FONT_STACK,
          fontSize: `${TYPE.caption.size}px`,
          fontStyle: '700',
          color: hex(UI_COLORS.textMuted),
        })
        .setOrigin(0, 0.5),
    );

    const chipWidth = 96;
    const gap = 8;
    const startX = SPACING.xl + 210;

    items.forEach((item, index) => {
      const x = startX + index * (chipWidth + gap);
      if (x + chipWidth > VIEW.WIDTH - SPACING.xl) return;

      const owned = this.progression.inventory.owns(item.id);
      const color = item.value ? (parseHexColor(item.value) ?? PALETTE.CYAN) : PALETTE.VIOLET;

      const chip = new Button(this, x + chipWidth / 2, y, {
        label: owned ? item.name.toUpperCase() : `${item.price}`,
        width: chipWidth,
        height: 34,
        color,
        variant: owned ? 'solid' : 'ghost',
        fontSize: 11,
        tracking: 0,
        onClick: () => onPick(item),
      });
      this.content.add(chip);
    });

    return y + 62;
  }

  private equip(item: CosmeticDefinition, slot: 'primary' | 'secondary' = 'primary'): void {
    const inventory = this.progression.inventory;

    if (!inventory.owns(item.id)) {
      if (inventory.purchase(item.id)) {
        this.toast.show(`Bought ${item.name} for ${item.price}`, 'success');
        audioManager.play('coin');
      } else {
        this.toast.show(
          item.unlockedBy ? `${item.name} is an achievement reward` : 'Not enough coins',
          'warning',
        );
        return;
      }
    }

    inventory.equip(item.id, slot);
    audioManager.play('click');
    this.renderTab();
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
