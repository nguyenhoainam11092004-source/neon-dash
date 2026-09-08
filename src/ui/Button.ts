import Phaser from 'phaser';
import { RADIUS, SPACING, TYPE, UI_COLORS, hex, track } from './Theme';
import { FONT_STACK } from './Theme';
import { containerContains, containerHitArea } from './HitArea';

export interface ButtonOptions {
  label: string;
  width?: number;
  height?: number;
  /** Fill and glow colour. */
  color?: number;
  textColor?: number;
  /** A filled button reads as the primary action; ghost buttons are secondary. */
  variant?: 'solid' | 'ghost' | 'danger';
  fontSize?: number;
  /** Letter tracking applied to the label. */
  tracking?: number;
  onClick?: () => void;
  /** Fires while the button is held; used by editor nudge controls. */
  onHold?: () => void;
  enabled?: boolean;
}

/**
 * A neon button drawn with Graphics rather than an image.
 *
 * Extending Container means a button can be positioned, tweened and added to a
 * layout like any other game object, and its hit area follows automatically.
 */
export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private readonly opts: Required<Omit<ButtonOptions, 'onClick' | 'onHold'>> &
    Pick<ButtonOptions, 'onClick' | 'onHold'>;
  /** Same rectangle handed to `setInteractive`, kept so a click can be
   * verified independently of Phaser's per-object hover bookkeeping. */
  private readonly hitArea: Phaser.Geom.Rectangle;

  private hovered = false;
  private pressed = false;
  private enabledState: boolean;
  private holdTimer?: Phaser.Time.TimerEvent;

  constructor(scene: Phaser.Scene, x: number, y: number, options: ButtonOptions) {
    super(scene, x, y);

    this.opts = {
      label: options.label,
      width: options.width ?? 260,
      height: options.height ?? 56,
      color: options.color ?? UI_COLORS.accent,
      textColor: options.textColor ?? UI_COLORS.text,
      variant: options.variant ?? 'ghost',
      fontSize: options.fontSize ?? TYPE.label.size,
      tracking: options.tracking ?? 2,
      enabled: options.enabled ?? true,
      onClick: options.onClick,
      onHold: options.onHold,
    };
    this.enabledState = this.opts.enabled;

    this.bg = scene.add.graphics();
    this.add(this.bg);

    this.text = scene.add
      .text(0, 0, track(this.opts.label, this.opts.tracking), {
        fontFamily: FONT_STACK,
        fontSize: `${this.opts.fontSize}px`,
        fontStyle: '700',
        color: hex(this.opts.textColor),
      })
      .setOrigin(0.5);
    this.add(this.text);

    this.setSize(this.opts.width, this.opts.height);
    // The button draws itself centred on its own position, so its hit area is
    // the same centred rectangle — expressed in drawing coordinates and
    // converted for Phaser by containerHitArea.
    this.hitArea = containerHitArea(
      this,
      -this.opts.width / 2,
      -this.opts.height / 2,
      this.opts.width,
      this.opts.height,
    );
    this.setInteractive(this.hitArea, Phaser.Geom.Rectangle.Contains);

    this.attachHandlers();
    this.redraw();
    scene.add.existing(this);
  }

  private attachHandlers(): void {
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      if (!this.enabledState) return;
      this.hovered = true;
      this.redraw();
      this.tweenScale(1.04, 110, 'Quad.easeOut');
    });

    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      this.hovered = false;
      this.stopHold();
      this.redraw();
      this.tweenScale(1, 110, 'Quad.easeOut');
    });

    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      if (!this.enabledState) return;
      this.pressed = true;
      this.redraw();
      this.tweenScale(0.97, 70, 'Quad.easeOut');
      if (this.opts.onHold) this.startHold();
    });

    // The click itself is decided here, on the scene-wide pointerup, with our
    // own hit test against `pointer.x/y` — deliberately NOT via
    // GAMEOBJECT_POINTER_UP. Phaser only fires that per-object event when its
    // OWN fresh hit test (run once per raw DOM event) still lists this button
    // in `currentlyOver` at that exact instant; a `mousedown` immediately
    // followed by a sub-pixel `mousemove` (ordinary mouse jitter during a
    // real click, and exactly what a fast/scripted click produces) can make
    // Phaser emit GAMEOBJECT_POINTER_OUT for that intermediate move and then
    // never re-emit GAMEOBJECT_POINTER_UP on release, silently dropping the
    // click even though the pointer visibly ends over the button. The
    // scene-level POINTER_UP event, by contrast, always fires on every
    // release inside the canvas (see InputPlugin#processUpEvents), so
    // checking our own geometry against it can't be defeated by that
    // per-object staleness.
    const onPointerUp = (pointer: Phaser.Input.Pointer): void => {
      if (!this.pressed) return;
      this.pressed = false;
      this.stopHold();
      const stillOver = this.containsPoint(pointer.x, pointer.y);
      this.hovered = stillOver;
      this.redraw();
      this.tweenScale(stillOver ? 1.04 : 1, 110, 'Back.easeOut');
      if (this.enabledState && stillOver) this.opts.onClick?.();
    };
    this.scene.input.on(Phaser.Input.Events.POINTER_UP, onPointerUp);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, onPointerUp);

    // A container is not automatically cleaned up when its scene shuts down.
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.stopHold();
      this.scene.input.off(Phaser.Input.Events.POINTER_UP, onPointerUp);
      this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, onPointerUp);
    });
  }

  /** Tests a point given in scene/world space against this button's actual
   * hit rectangle, the same way Phaser's own input plugin would. */
  private containsPoint(worldX: number, worldY: number): boolean {
    const local = this.getWorldTransformMatrix().applyInverse(worldX, worldY);
    return containerContains(this, this.hitArea, local.x, local.y);
  }

  /** Kills any in-flight scale tween first so rapid hover/press toggling snaps
   * to the latest intent instead of stacking competing tweens on `scale`. */
  private tweenScale(scale: number, duration: number, ease: string): void {
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({ targets: this, scale, duration, ease });
  }

  private startHold(): void {
    this.stopHold();
    this.holdTimer = this.scene.time.addEvent({
      delay: 90,
      startAt: 60,
      loop: true,
      callback: () => this.opts.onHold?.(),
    });
  }

  private stopHold(): void {
    this.holdTimer?.remove();
    this.holdTimer = undefined;
  }

  private redraw(): void {
    const { width, height, variant } = this.opts;
    const color = variant === 'danger' ? UI_COLORS.danger : this.opts.color;
    const x = -width / 2;
    const y = -height / 2;

    this.bg.clear();

    if (!this.enabledState) {
      this.bg.fillStyle(UI_COLORS.panel, 0.5);
      this.bg.fillRoundedRect(x, y, width, height, RADIUS.md);
      this.bg.lineStyle(2, UI_COLORS.textMuted, 0.35);
      this.bg.strokeRoundedRect(x, y, width, height, RADIUS.md);
      this.text.setAlpha(0.4);
      return;
    }

    this.text.setAlpha(1);

    const fillAlpha =
      variant === 'solid'
        ? this.pressed
          ? 1
          : this.hovered
            ? 0.92
            : 0.82
        : this.hovered
          ? 0.2
          : 0.08;
    const strokeAlpha = this.hovered || this.pressed ? 1 : 0.65;

    // A wider, fainter stroke under the crisp one reads as a neon halo without
    // needing a blur shader.
    if (this.hovered || this.pressed) {
      this.bg.lineStyle(10, color, 0.16);
      this.bg.strokeRoundedRect(x - 3, y - 3, width + 6, height + 6, RADIUS.md + 3);
    }

    this.bg.fillStyle(color, fillAlpha);
    this.bg.fillRoundedRect(x, y, width, height, RADIUS.md);
    this.bg.lineStyle(2, color, strokeAlpha);
    this.bg.strokeRoundedRect(x, y, width, height, RADIUS.md);

    this.text.setColor(
      hex(variant === 'solid' ? UI_COLORS.overlay : this.hovered ? color : this.opts.textColor),
    );
  }

  setLabel(label: string): this {
    this.opts.label = label;
    this.text.setText(track(label, this.opts.tracking));
    return this;
  }

  setEnabled(enabled: boolean): this {
    this.enabledState = enabled;
    if (enabled) this.setInteractive();
    else this.disableInteractive();
    this.redraw();
    return this;
  }

  get isEnabled(): boolean {
    return this.enabledState;
  }
}

/**
 * Lays out buttons in a vertical stack and returns them.
 * Menus use this so spacing stays consistent without repeating arithmetic.
 */
export function buttonColumn(
  scene: Phaser.Scene,
  x: number,
  startY: number,
  specs: ButtonOptions[],
  gap = SPACING.md,
): Button[] {
  const buttons: Button[] = [];
  let y = startY;
  for (const spec of specs) {
    const button = new Button(scene, x, y, spec);
    buttons.push(button);
    y += (spec.height ?? 56) + gap;
  }
  return buttons;
}
