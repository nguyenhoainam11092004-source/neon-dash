import Phaser from 'phaser';
import { PALETTE } from '@/config/constants';
import { clamp01 } from '@/utils/MathUtils';
import { FONT_STACK, RADIUS, TYPE, UI_COLORS, hex } from './Theme';

export interface SliderOptions {
  label: string;
  /** Initial value, 0..1. */
  value: number;
  width?: number;
  color?: number;
  /** Formats the value for display. Defaults to a percentage. */
  format?: (value: number) => string;
  onChange?: (value: number) => void;
  /** Fires once when the drag ends, for previews that should not spam. */
  onRelease?: (value: number) => void;
}

/**
 * A labelled horizontal slider.
 *
 * The whole track is draggable rather than just the handle: on a touch screen a
 * 14-pixel handle is unusable, and on a mouse it is merely annoying.
 */
export class Slider extends Phaser.GameObjects.Container {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly labelText: Phaser.GameObjects.Text;
  private readonly valueText: Phaser.GameObjects.Text;
  private readonly opts: Required<Omit<SliderOptions, 'onChange' | 'onRelease'>> &
    Pick<SliderOptions, 'onChange' | 'onRelease'>;

  private current: number;
  private dragging = false;
  private hovered = false;

  constructor(scene: Phaser.Scene, x: number, y: number, options: SliderOptions) {
    super(scene, x, y);

    this.opts = {
      label: options.label,
      value: clamp01(options.value),
      width: options.width ?? 420,
      color: options.color ?? PALETTE.CYAN,
      format: options.format ?? ((value) => `${Math.round(value * 100)}%`),
      onChange: options.onChange,
      onRelease: options.onRelease,
    };
    this.current = this.opts.value;

    this.labelText = scene.add
      .text(0, -6, options.label, {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.caption.size}px`,
        fontStyle: '700',
        color: hex(UI_COLORS.textMuted),
      })
      .setOrigin(0, 1);

    this.valueText = scene.add
      .text(this.opts.width, -6, this.opts.format(this.current), {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.caption.size}px`,
        fontStyle: '800',
        color: hex(this.opts.color),
      })
      .setOrigin(1, 1);

    this.graphics = scene.add.graphics();

    this.add([this.graphics, this.labelText, this.valueText]);

    const hitHeight = 30;
    this.setSize(this.opts.width, hitHeight);
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, -hitHeight / 2 + 8, this.opts.width, hitHeight),
      Phaser.Geom.Rectangle.Contains,
    );

    this.attachHandlers();
    this.redraw();
    scene.add.existing(this);
  }

  private attachHandlers(): void {
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      this.hovered = true;
      this.redraw();
    });

    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      this.hovered = false;
      this.redraw();
    });

    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.setFromPointer(pointer);
    });

    // Tracking on the scene, not on this object, is what lets the drag continue
    // when the pointer leaves the slider's bounds.
    const onMove = (pointer: Phaser.Input.Pointer): void => {
      if (this.dragging) this.setFromPointer(pointer);
    };
    const onUp = (): void => {
      if (!this.dragging) return;
      this.dragging = false;
      this.opts.onRelease?.(this.current);
      this.redraw();
    };

    this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, onMove);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP, onUp);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, onUp);

    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, onMove);
      this.scene.input.off(Phaser.Input.Events.POINTER_UP, onUp);
      this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, onUp);
    });
  }

  private setFromPointer(pointer: Phaser.Input.Pointer): void {
    // The container may be nested or scrolled, so convert through its matrix
    // rather than assuming the pointer's scene coordinates line up.
    const matrix = this.getWorldTransformMatrix();
    const localX = (pointer.worldX - matrix.tx) / (matrix.scaleX || 1);
    this.setValue(clamp01(localX / this.opts.width));
  }

  setValue(value: number, notify = true): this {
    const next = clamp01(value);
    if (next === this.current) return this;
    this.current = next;
    this.valueText.setText(this.opts.format(next));
    this.redraw();
    if (notify) this.opts.onChange?.(next);
    return this;
  }

  get value(): number {
    return this.current;
  }

  private redraw(): void {
    const { width, color } = this.opts;
    const trackHeight = 6;
    const y = 8;
    const active = this.hovered || this.dragging;

    this.graphics.clear();

    this.graphics.fillStyle(UI_COLORS.panel, 0.9);
    this.graphics.fillRoundedRect(0, y, width, trackHeight, RADIUS.pill);

    const fillWidth = width * this.current;
    if (fillWidth > 1) {
      this.graphics.fillStyle(color, 0.95);
      this.graphics.fillRoundedRect(0, y, fillWidth, trackHeight, RADIUS.pill);
    }

    const handleX = fillWidth;
    const radius = active ? 11 : 9;

    if (active) {
      this.graphics.fillStyle(color, 0.22);
      this.graphics.fillCircle(handleX, y + trackHeight / 2, radius + 7);
    }

    this.graphics.fillStyle(UI_COLORS.text, 1);
    this.graphics.fillCircle(handleX, y + trackHeight / 2, radius);
    this.graphics.lineStyle(2.5, color, 1);
    this.graphics.strokeCircle(handleX, y + trackHeight / 2, radius);
  }
}
