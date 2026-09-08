import Phaser from 'phaser';
import { DEPTH, PALETTE, VIEW } from '@/config/constants';
import { FONT_STACK, RADIUS, SPACING, TYPE, UI_COLORS, hex } from './Theme';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

interface LiveToast {
  container: Phaser.GameObjects.Container;
  life: number;
}

const KIND_COLORS: Record<ToastKind, number> = {
  info: PALETTE.CYAN,
  success: PALETTE.LIME,
  warning: PALETTE.AMBER,
  error: PALETTE.CORAL,
};

/**
 * Transient notifications, stacked at the bottom of the screen.
 *
 * Used for the outcomes a player needs to know about but should not have to
 * dismiss: an import that worked, a save that failed, a level that would not
 * validate. Anything requiring a decision belongs in a Modal instead.
 */
export class Toast {
  private readonly scene: Phaser.Scene;
  private readonly active: LiveToast[] = [];
  private readonly maxVisible = 4;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  show(message: string, kind: ToastKind = 'info', seconds = 3.2): void {
    const color = KIND_COLORS[kind];

    const container = this.scene.add
      .container(VIEW.WIDTH / 2, VIEW.HEIGHT - 80)
      .setScrollFactor(0)
      .setDepth(DEPTH.TOAST);

    const text = this.scene.add
      .text(0, 0, message, {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.body.size - 2}px`,
        fontStyle: '600',
        color: hex(UI_COLORS.text),
        align: 'center',
        wordWrap: { width: 620 },
      })
      .setOrigin(0.5);

    const width = Math.max(260, text.width + SPACING.xl);
    const height = text.height + SPACING.lg;

    const background = this.scene.add.graphics();
    background.fillStyle(PALETTE.BG_MID, 0.96);
    background.fillRoundedRect(-width / 2, -height / 2, width, height, RADIUS.md);
    background.lineStyle(2, color, 0.9);
    background.strokeRoundedRect(-width / 2, -height / 2, width, height, RADIUS.md);
    // A colour bar on the leading edge encodes the kind without an icon font.
    background.fillStyle(color, 1);
    background.fillRoundedRect(-width / 2 + 3, -height / 2 + 8, 4, height - 16, 2);

    container.add([background, text]);
    container.setAlpha(0);

    this.scene.tweens.add({
      targets: container,
      alpha: 1,
      y: container.y - 14,
      duration: 240,
      ease: 'Back.easeOut',
    });

    this.active.push({ container, life: seconds });

    // Oldest first: pushing a fifth toast should retire the first, not the one
    // the player is most likely still reading.
    while (this.active.length > this.maxVisible) {
      const oldest = this.active.shift();
      oldest?.container.destroy(true);
    }

    this.reflow();
  }

  /** Repositions the stack so toasts sit above one another. */
  private reflow(): void {
    const baseY = VIEW.HEIGHT - 94;
    for (let i = 0; i < this.active.length; i += 1) {
      const entry = this.active[this.active.length - 1 - i];
      if (!entry) continue;
      this.scene.tweens.add({
        targets: entry.container,
        y: baseY - i * 62,
        duration: 200,
        ease: 'Quad.easeOut',
      });
    }
  }

  /** Advances the timers. Call once per frame with the frame delta. */
  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const entry = this.active[i];
      if (!entry) continue;

      entry.life -= dt;
      if (entry.life > 0) continue;

      this.active.splice(i, 1);
      this.scene.tweens.add({
        targets: entry.container,
        alpha: 0,
        y: entry.container.y - 18,
        duration: 240,
        ease: 'Quad.easeIn',
        onComplete: () => entry.container.destroy(true),
      });
      this.reflow();
    }
  }

  clear(): void {
    for (const entry of this.active) entry.container.destroy(true);
    this.active.length = 0;
  }
}
