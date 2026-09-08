import Phaser from 'phaser';
import { PALETTE, SPEED, type SpeedTier } from '@/config/constants';
import {
  GAME_MODES,
  TRIGGER_TYPES,
  type GameModeId,
  type LevelObject,
  type TriggerType,
} from '@/types/LevelTypes';
import { Button } from '@/ui/Button';
import { FONT_STACK, TYPE, UI_COLORS, hex, track } from '@/ui/Theme';
import type { EditorManager } from './EditorManager';

export interface PropertyPanelOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  editor: EditorManager;
  onChanged: () => void;
}

/** One editable field, described as data so the panel can render itself. */
type Field =
  | { kind: 'number'; key: string; label: string; step: number; min?: number; max?: number }
  | { kind: 'choice'; key: string; label: string; options: readonly string[] }
  | { kind: 'toggle'; key: string; label: string };

/**
 * Which properties each object type exposes.
 *
 * Declaring the panel as data rather than as per-type UI code is what keeps it
 * honest: the fields here are exactly the props the object classes read, and
 * adding a property means one line rather than a new panel layout.
 */
const FIELDS: Partial<Record<LevelObject['type'], Field[]>> = {
  block: [
    { kind: 'number', key: 'width', label: 'Width (cells)', step: 1, min: 1, max: 40 },
    { kind: 'number', key: 'height', label: 'Height (cells)', step: 1, min: 1, max: 40 },
  ],
  platform: [
    { kind: 'number', key: 'width', label: 'Width (cells)', step: 1, min: 1, max: 40 },
    { kind: 'number', key: 'height', label: 'Height (cells)', step: 0.5, min: 0.5, max: 10 },
  ],
  saw: [{ kind: 'number', key: 'spinSpeed', label: 'Spin (rev/s)', step: 0.2, min: -6, max: 6 }],
  jumpPad: [{ kind: 'number', key: 'power', label: 'Power', step: 0.05, min: 0.5, max: 3 }],
  jumpRing: [{ kind: 'number', key: 'power', label: 'Power', step: 0.05, min: 0.5, max: 3 }],
  modePortal: [
    { kind: 'choice', key: 'mode', label: 'Mode', options: GAME_MODES },
    { kind: 'toggle', key: 'mini', label: 'Mini' },
  ],
  gravityPortal: [
    { kind: 'choice', key: 'gravity', label: 'Direction', options: ['down', 'up'] as const },
  ],
  speedPortal: [
    {
      kind: 'choice',
      key: 'speed',
      label: 'Speed',
      options: Object.keys(SPEED.MULTIPLIERS) as readonly string[],
    },
  ],
  teleportPortal: [
    { kind: 'number', key: 'targetY', label: 'Target Y', step: 40, min: -4000, max: 4000 },
  ],
  collectible: [{ kind: 'number', key: 'value', label: 'Value', step: 1, min: 1, max: 10 }],
};

/**
 * The editor's right-hand inspector.
 *
 * Shows the selection's shared properties and lets the author attach triggers.
 * Every change is routed through EditorManager so it lands in the undo history
 * like any other edit — a property tweak the author cannot undo would be a trap.
 */
export class PropertyPanel {
  private readonly scene: Phaser.Scene;
  private readonly options: PropertyPanelOptions;
  private readonly container: Phaser.GameObjects.Container;
  private readonly content: Phaser.GameObjects.Container;

  private selectedIds: string[] = [];

  constructor(scene: Phaser.Scene, options: PropertyPanelOptions) {
    this.scene = scene;
    this.options = options;

    this.container = scene.add.container(options.x, options.y);
    this.content = scene.add.container(0, 0);

    this.buildBackground();
    this.container.add(this.content);
    this.render();
  }

  private buildBackground(): void {
    const panel = this.scene.add.graphics();
    panel.fillStyle(PALETTE.BG_MID, 0.96);
    panel.fillRect(0, 0, this.options.width, this.options.height);
    panel.lineStyle(1, PALETTE.VIOLET, 0.4);
    panel.lineBetween(0, 0, 0, this.options.height);
    this.container.add(panel);
  }

  setSelection(ids: string[]): void {
    this.selectedIds = ids;
    this.render();
  }

  private heading(y: number, text: string, color: number): number {
    this.content.add(
      this.scene.add
        .text(12, y, track(text, 3), {
          fontFamily: FONT_STACK,
          fontSize: '11px',
          fontStyle: '800',
          color: hex(color),
        })
        .setOrigin(0, 0.5),
    );
    return y + 22;
  }

  private caption(y: number, text: string): number {
    this.content.add(
      this.scene.add
        .text(12, y, text, {
          fontFamily: FONT_STACK,
          fontSize: '10px',
          color: hex(UI_COLORS.textMuted),
          wordWrap: { width: this.options.width - 24 },
        })
        .setOrigin(0, 0),
    );
    return y + 30;
  }

  private render(): void {
    this.content.removeAll(true);

    let y = 20;
    y = this.heading(y, 'PROPERTIES', PALETTE.MAGENTA);

    const editor = this.options.editor;
    const objects = editor.current.objects.filter((object) => this.selectedIds.includes(object.id));

    if (objects.length === 0) {
      this.caption(
        y,
        'Nothing selected.\n\nClick an object to inspect it, or drag on empty space to paint with the current brush.',
      );
      this.renderLevelSettings(this.options.height - 150);
      return;
    }

    const first = objects[0];
    if (!first) return;

    // A mixed selection has no single type to edit, so only the shared
    // transform controls are offered.
    const uniform = objects.every((object) => object.type === first.type);

    y = this.caption(
      y,
      objects.length === 1
        ? `${first.type.toUpperCase()}  ${first.id.slice(-6)}`
        : `${objects.length} objects${uniform ? ` (${first.type})` : ' (mixed types)'}`,
    );

    y = this.renderTransform(y, objects);

    if (uniform) {
      const fields = FIELDS[first.type];
      if (fields && fields.length > 0) {
        y = this.heading(y + 6, 'TYPE OPTIONS', PALETTE.CYAN);
        for (const field of fields) {
          y = this.renderField(y, field, objects, first);
        }
      }
    }

    y = this.renderTriggers(y + 8, first);
  }

  /** Rotation and scale controls, which apply to any selection. */
  private renderTransform(y: number, objects: LevelObject[]): number {
    const editor = this.options.editor;
    const width = this.options.width;

    this.content.add(
      this.scene.add
        .text(12, y + 8, 'TRANSFORM', {
          fontFamily: FONT_STACK,
          fontSize: '10px',
          fontStyle: '700',
          color: hex(UI_COLORS.textMuted),
        })
        .setOrigin(0, 0.5),
    );

    const row = y + 34;

    const buttons: { label: string; action: () => void }[] = [
      { label: '-90', action: () => editor.rotateSelected(-90) },
      { label: '+90', action: () => editor.rotateSelected(90) },
      { label: 'S-', action: () => editor.scaleSelected(0.8) },
      { label: 'S+', action: () => editor.scaleSelected(1.25) },
    ];

    buttons.forEach((entry, index) => {
      const button = new Button(this.scene, 12 + 28 + index * 58, row, {
        label: entry.label,
        width: 54,
        height: 28,
        color: PALETTE.VIOLET,
        fontSize: 11,
        tracking: 0,
        onClick: () => {
          entry.action();
          this.options.onChanged();
          this.render();
        },
      });
      this.content.add(button);
    });

    this.content.add(
      this.scene.add
        .text(
          width - 12,
          row,
          `${Math.round(objects[0]?.rotation ?? 0)}deg  x${(objects[0]?.scale ?? 1).toFixed(2)}`,
          {
            fontFamily: FONT_STACK,
            fontSize: '10px',
            color: hex(UI_COLORS.textMuted),
          },
        )
        .setOrigin(1, 0.5),
    );

    return row + 30;
  }

  /** Renders one declared field as the control its kind implies. */
  private renderField(
    y: number,
    field: Field,
    objects: LevelObject[],
    reference: LevelObject,
  ): number {
    const editor = this.options.editor;
    const width = this.options.width;

    this.content.add(
      this.scene.add
        .text(12, y + 10, field.label, {
          fontFamily: FONT_STACK,
          fontSize: '10px',
          fontStyle: '700',
          color: hex(UI_COLORS.textMuted),
        })
        .setOrigin(0, 0.5),
    );

    const apply = (value: unknown): void => {
      for (const object of objects) editor.setProperty(object.id, field.key, value);
      this.options.onChanged();
      this.render();
    };

    if (field.kind === 'number') {
      const current = Number(reference.props?.[field.key] ?? 1);

      const valueText = this.scene.add
        .text(width - 12, y + 10, String(Number(current.toFixed(2))), {
          fontFamily: FONT_STACK,
          fontSize: '11px',
          fontStyle: '800',
          color: hex(PALETTE.CYAN),
        })
        .setOrigin(1, 0.5);
      this.content.add(valueText);

      const nudge = (direction: number): void => {
        const next = Phaser.Math.Clamp(
          current + field.step * direction,
          field.min ?? -Infinity,
          field.max ?? Infinity,
        );
        apply(Number(next.toFixed(3)));
      };

      const minus = new Button(this.scene, 40, y + 36, {
        label: '-',
        width: 46,
        height: 26,
        color: PALETTE.GREY,
        fontSize: 12,
        tracking: 0,
        onClick: () => nudge(-1),
        onHold: () => nudge(-1),
      });
      const plus = new Button(this.scene, 96, y + 36, {
        label: '+',
        width: 46,
        height: 26,
        color: PALETTE.GREY,
        fontSize: 12,
        tracking: 0,
        onClick: () => nudge(1),
        onHold: () => nudge(1),
      });
      this.content.add([minus, plus]);

      return y + 60;
    }

    if (field.kind === 'toggle') {
      const current = reference.props?.[field.key] === true;
      const button = new Button(this.scene, width - 46, y + 10, {
        label: current ? 'ON' : 'OFF',
        width: 60,
        height: 24,
        color: current ? PALETTE.LIME : PALETTE.GREY,
        variant: current ? 'solid' : 'ghost',
        fontSize: 10,
        tracking: 0,
        onClick: () => apply(!current),
      });
      this.content.add(button);
      return y + 34;
    }

    // Choice: a wrapping row of small chips.
    const current = String(reference.props?.[field.key] ?? '');
    let chipX = 12;
    let chipY = y + 34;

    for (const option of field.options) {
      const label = option.slice(0, 7).toUpperCase();
      const chipWidth = Math.max(44, label.length * 8);

      if (chipX + chipWidth > width - 10) {
        chipX = 12;
        chipY += 30;
      }

      const chip = new Button(this.scene, chipX + chipWidth / 2, chipY, {
        label,
        width: chipWidth,
        height: 24,
        color: option === current ? PALETTE.CYAN : PALETTE.GREY,
        variant: option === current ? 'solid' : 'ghost',
        fontSize: 9,
        tracking: 0,
        onClick: () => apply(option as GameModeId | SpeedTier | string),
      });
      this.content.add(chip);
      chipX += chipWidth + 6;
    }

    return chipY + 32;
  }

  /** Lists triggers targeting the object and offers to add one. */
  private renderTriggers(y: number, object: LevelObject): number {
    const editor = this.options.editor;
    const width = this.options.width;

    let cursor = this.heading(y, 'TRIGGERS', PALETTE.AMBER);

    const attached = editor.triggersFor(object.id);

    if (attached.length === 0) {
      cursor = this.caption(cursor, 'No triggers on this object.');
    } else {
      for (const trigger of attached.slice(0, 4)) {
        this.content.add(
          this.scene.add
            .text(12, cursor, `${trigger.type.toUpperCase()}  ${trigger.duration}s`, {
              fontFamily: FONT_STACK,
              fontSize: '10px',
              fontStyle: '700',
              color: hex(UI_COLORS.text),
            })
            .setOrigin(0, 0.5),
        );

        const remove = new Button(this.scene, width - 30, cursor, {
          label: 'X',
          width: 32,
          height: 22,
          variant: 'danger',
          fontSize: 10,
          tracking: 0,
          onClick: () => {
            editor.removeTrigger(trigger.id);
            this.render();
          },
        });
        this.content.add(remove);
        cursor += 28;
      }
    }

    // A short list of the most useful trigger types; the rest are reachable by
    // editing the exported JSON, which is the honest trade-off at this width.
    const offered: TriggerType[] = ['move', 'rotate', 'scale', 'pulse', 'alpha', 'toggle'];
    let chipX = 12;
    let chipY = cursor + 12;

    for (const type of offered) {
      if (!TRIGGER_TYPES.includes(type)) continue;
      const chipWidth = 56;
      if (chipX + chipWidth > width - 10) {
        chipX = 12;
        chipY += 28;
      }

      const chip = new Button(this.scene, chipX + chipWidth / 2, chipY, {
        label: `+${type.slice(0, 5).toUpperCase()}`,
        width: chipWidth,
        height: 24,
        color: PALETTE.AMBER,
        fontSize: 9,
        tracking: 0,
        onClick: () => {
          editor.addTrigger(type, object.id, object.x);
          this.render();
        },
      });
      this.content.add(chip);
      chipX += chipWidth + 6;
    }

    return chipY + 30;
  }

  /** Level-wide settings, shown when nothing is selected. */
  private renderLevelSettings(y: number): void {
    const editor = this.options.editor;
    const level = editor.current;

    let cursor = this.heading(y, 'LEVEL', PALETTE.LIME);

    const rows: [string, string][] = [
      ['NAME', level.name],
      ['BPM', String(level.bpm)],
      ['SONG', level.song],
      ['DIFFICULTY', level.difficulty],
      ['OBJECTS', String(level.objects.length)],
    ];

    for (const [label, value] of rows) {
      this.content.add(
        this.scene.add
          .text(12, cursor, label, {
            fontFamily: FONT_STACK,
            fontSize: '10px',
            fontStyle: '700',
            color: hex(UI_COLORS.textMuted),
          })
          .setOrigin(0, 0.5),
      );
      this.content.add(
        this.scene.add
          .text(this.options.width - 12, cursor, value.slice(0, 18), {
            fontFamily: FONT_STACK,
            fontSize: `${TYPE.caption.size - 2}px`,
            fontStyle: '700',
            color: hex(UI_COLORS.text),
          })
          .setOrigin(1, 0.5),
      );
      cursor += 20;
    }

    const bpmDown = new Button(this.scene, 46, cursor + 16, {
      label: 'BPM-',
      width: 60,
      height: 24,
      color: PALETTE.GREY,
      fontSize: 10,
      tracking: 0,
      onClick: () => {
        editor.setMetadata('bpm', Math.max(20, level.bpm - 2));
        this.render();
      },
    });
    const bpmUp = new Button(this.scene, 112, cursor + 16, {
      label: 'BPM+',
      width: 60,
      height: 24,
      color: PALETTE.GREY,
      fontSize: 10,
      tracking: 0,
      onClick: () => {
        editor.setMetadata('bpm', Math.min(400, level.bpm + 2));
        this.render();
      },
    });
    this.content.add([bpmDown, bpmUp]);
  }

  get gameObject(): Phaser.GameObjects.Container {
    return this.container;
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
