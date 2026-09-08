import Phaser from 'phaser';
import { PALETTE } from '@/config/constants';
import { FONT_STACK, RADIUS, TYPE, UI_COLORS, hex } from './Theme';

export interface ToggleOptions {
  label: string;
  value: boolean;
  color?: number;
  width?: number;
  onChange?: (value: boolean) => void;
}

/**
 * An on/off switch with a label.
 *
 * The label is part of the hit area: a switch you have to hit precisely is a
 * worse switch, and there is nothing else on the row to click by mistake.
 */
export class Toggle extends Phaser.GameObjects.Container {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly labelText: Phaser.GameObjects.Text;
  private readonly opts: Required<Omit<ToggleOptions, 'onChange'>> &
    Pick<ToggleOptions, 'onChange'>;

  private current: boolean;
  private hovered = false;
  /** Animated 0..1 position of the knob, so the flip is not instantaneous. */
  private knob: number;

  constructor(scene: Phaser.Scene, x: number, y: number, options: ToggleOptions) {
    super(scene, x, y);

    this.opts = {
      label: options.label,
      value: options.value,
      color: options.color ?? PALETTE.LIME,
      width: options.width ?? 420,
      onChange: options.onChange,
    };
    this.current = options.value;
    this.knob = options.value ? 1 : 0;

    this.labelText = scene.add
      .text(0, 0, options.label, {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.caption.size}px`,
        fontStyle: '700',
        color: hex(UI_COLORS.textMuted),
      })
      .setOrigin(0, 0.5);

    this.graphics = scene.add.graphics();
    this.add([this.graphics, this.labelText]);

    this.setSize(this.opts.width, 34);
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, -17, this.opts.width, 34),
      Phaser.Geom.Rectangle.Contains,
    );

    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      this.hovered = true;
      this.redraw();
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      this.hovered = false;
      this.redraw();
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.toggle());

    this.redraw();
    scene.add.existing(this);
  }

  toggle(): void {
    this.setValue(!this.current);
  }

  setValue(value: boolean, notify = true): this {
    if (value === this.current) return this;
    this.current = value;

    // Tween the knob rather than snapping it: the motion is what tells the
    // player the click registered.
    this.scene.tweens.add({
      targets: this,
      knob: value ? 1 : 0,
      duration: 160,
      ease: 'Cubic.easeOut',
      onUpdate: () => this.redraw(),
    });

    if (notify) this.opts.onChange?.(value);
    return this;
  }

  get value(): boolean {
    return this.current;
  }

  private redraw(): void {
    const trackWidth = 54;
    const trackHeight = 28;
    const x = this.opts.width - trackWidth;
    const y = -trackHeight / 2;
    const color = this.opts.color;

    this.graphics.clear();

    if (this.hovered) {
      this.graphics.lineStyle(8, color, 0.14);
      this.graphics.strokeRoundedRect(x - 3, y - 3, trackWidth + 6, trackHeight + 6, RADIUS.pill);
    }

    this.graphics.fillStyle(this.current ? color : UI_COLORS.panel, this.current ? 0.85 : 0.95);
    this.graphics.fillRoundedRect(x, y, trackWidth, trackHeight, RADIUS.pill);
    this.graphics.lineStyle(2, this.current ? color : UI_COLORS.textMuted, this.current ? 1 : 0.5);
    this.graphics.strokeRoundedRect(x, y, trackWidth, trackHeight, RADIUS.pill);

    const travel = trackWidth - trackHeight;
    const knobX = x + trackHeight / 2 + travel * this.knob;
    this.graphics.fillStyle(UI_COLORS.text, 1);
    this.graphics.fillCircle(knobX, 0, trackHeight / 2 - 4);

    this.labelText.setColor(hex(this.current ? UI_COLORS.text : UI_COLORS.textMuted));
  }
}
