import Phaser from 'phaser';
import { PALETTE } from '@/config/constants';
import { TEX } from '@/effects/TextureFactory';
import { OBJECT_TYPES, type LevelObjectType } from '@/types/LevelTypes';
import { FONT_STACK, RADIUS, TYPE, UI_COLORS, hex, track } from '@/ui/Theme';

export interface ObjectPaletteOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  onSelect: (type: LevelObjectType) => void;
}

/** How each type is presented: label, icon and colour. */
interface PaletteEntry {
  type: LevelObjectType;
  label: string;
  texture: string;
  color: number;
  /** Grouping heading shown above the first entry of each group. */
  group: string;
}

/**
 * The palette is generated from the object-type list, not hand-written, so a
 * new type appears here automatically once it has an entry below.
 */
const ENTRIES: PaletteEntry[] = [
  { type: 'block', label: 'Block', texture: TEX.SQUARE, color: PALETTE.VIOLET, group: 'SOLID' },
  { type: 'platform', label: 'Platform', texture: TEX.SQUARE, color: PALETTE.CYAN, group: 'SOLID' },
  { type: 'spike', label: 'Spike', texture: TEX.TRIANGLE, color: PALETTE.CORAL, group: 'HAZARD' },
  { type: 'saw', label: 'Saw', texture: TEX.SAW, color: PALETTE.CORAL, group: 'HAZARD' },
  { type: 'jumpPad', label: 'Pad', texture: TEX.CHEVRON, color: PALETTE.LIME, group: 'BOOST' },
  { type: 'jumpRing', label: 'Ring', texture: TEX.RING, color: PALETTE.AMBER, group: 'BOOST' },
  { type: 'collectible', label: 'Coin', texture: TEX.COIN, color: PALETTE.AMBER, group: 'BOOST' },
  {
    type: 'modePortal',
    label: 'Mode',
    texture: TEX.SQUARE,
    color: PALETTE.MAGENTA,
    group: 'PORTAL',
  },
  {
    type: 'gravityPortal',
    label: 'Gravity',
    texture: TEX.CHEVRON,
    color: PALETTE.LIME,
    group: 'PORTAL',
  },
  {
    type: 'speedPortal',
    label: 'Speed',
    texture: TEX.CHEVRON,
    color: PALETTE.CYAN,
    group: 'PORTAL',
  },
  {
    type: 'teleportPortal',
    label: 'Teleport',
    texture: TEX.STAR,
    color: PALETTE.VIOLET,
    group: 'PORTAL',
  },
  { type: 'finish', label: 'Finish', texture: TEX.SQUARE, color: PALETTE.WHITE, group: 'LEVEL' },
  { type: 'decor', label: 'Decor', texture: TEX.SQUARE, color: PALETTE.GREY, group: 'LEVEL' },
];

/**
 * The editor's left-hand tool column.
 *
 * Each entry is a compact swatch rather than a text button: at this width a
 * label alone is hard to scan, and the icon is the same shape the object will
 * take on the canvas, which is the fastest possible mapping to learn.
 */
export class ObjectPalette {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly options: ObjectPaletteOptions;

  private readonly swatches = new Map<LevelObjectType, Phaser.GameObjects.Graphics>();
  private active: LevelObjectType = 'block';

  constructor(scene: Phaser.Scene, options: ObjectPaletteOptions) {
    this.scene = scene;
    this.options = options;
    this.container = scene.add.container(options.x, options.y);

    this.buildBackground();
    this.buildEntries();
    this.setActive('block');
  }

  private buildBackground(): void {
    const panel = this.scene.add.graphics();
    panel.fillStyle(PALETTE.BG_MID, 0.96);
    panel.fillRect(0, 0, this.options.width, this.options.height);
    panel.lineStyle(1, PALETTE.VIOLET, 0.4);
    panel.lineBetween(this.options.width, 0, this.options.width, this.options.height);
    this.container.add(panel);

    this.container.add(
      this.scene.add
        .text(12, 14, track('OBJECTS', 3), {
          fontFamily: FONT_STACK,
          fontSize: '11px',
          fontStyle: '800',
          color: hex(PALETTE.CYAN),
        })
        .setOrigin(0, 0.5),
    );
  }

  private buildEntries(): void {
    const rowHeight = 34;
    const groupGap = 18;
    let y = 34;
    let lastGroup = '';

    for (const entry of ENTRIES) {
      if (entry.group !== lastGroup) {
        lastGroup = entry.group;
        y += groupGap;
        this.container.add(
          this.scene.add
            .text(12, y - 10, entry.group, {
              fontFamily: FONT_STACK,
              fontSize: '9px',
              fontStyle: '800',
              color: hex(UI_COLORS.textMuted),
            })
            .setOrigin(0, 0.5),
        );
        y += 6;
      }

      this.buildRow(entry, y, rowHeight);
      y += rowHeight;
    }
  }

  private buildRow(entry: PaletteEntry, y: number, rowHeight: number): void {
    const width = this.options.width - 16;
    const x = 8;

    const swatch = this.scene.add.graphics();
    this.swatches.set(entry.type, swatch);
    this.container.add(swatch);

    const icon = this.scene.add
      .image(x + 20, y + rowHeight / 2, entry.texture)
      .setDisplaySize(18, 18)
      .setTint(entry.color);
    this.container.add(icon);

    const label = this.scene.add
      .text(x + 40, y + rowHeight / 2, entry.label.toUpperCase(), {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.caption.size - 2}px`,
        fontStyle: '700',
        color: hex(UI_COLORS.text),
      })
      .setOrigin(0, 0.5);
    this.container.add(label);

    // The hit zone covers the whole row, not just the icon.
    const zone = this.scene.add
      .zone(x, y, width, rowHeight - 2)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    this.container.add(zone);

    const paint = (state: 'idle' | 'hover' | 'active'): void => {
      swatch.clear();
      if (state === 'idle') return;
      const alpha = state === 'active' ? 0.24 : 0.12;
      swatch.fillStyle(entry.color, alpha);
      swatch.fillRoundedRect(x, y, width, rowHeight - 2, RADIUS.sm);
      swatch.lineStyle(state === 'active' ? 2 : 1, entry.color, state === 'active' ? 1 : 0.5);
      swatch.strokeRoundedRect(x, y, width, rowHeight - 2, RADIUS.sm);
    };

    zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      if (this.active !== entry.type) paint('hover');
    });
    zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      paint(this.active === entry.type ? 'active' : 'idle');
    });
    zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.setActive(entry.type);
      this.options.onSelect(entry.type);
    });

    // Store the painter so setActive can repaint every row without re-querying.
    (
      swatch as Phaser.GameObjects.Graphics & { paint?: (s: 'idle' | 'hover' | 'active') => void }
    ).paint = paint;
  }

  setActive(type: LevelObjectType): void {
    this.active = type;
    for (const [entryType, swatch] of this.swatches) {
      const painter = (
        swatch as Phaser.GameObjects.Graphics & {
          paint?: (s: 'idle' | 'hover' | 'active') => void;
        }
      ).paint;
      painter?.(entryType === type ? 'active' : 'idle');
    }
  }

  get activeType(): LevelObjectType {
    return this.active;
  }

  get gameObject(): Phaser.GameObjects.Container {
    return this.container;
  }

  destroy(): void {
    this.container.destroy(true);
    this.swatches.clear();
  }
}

/** Types with no palette entry, for the validator's benefit. */
export const UNLISTED_TYPES = OBJECT_TYPES.filter(
  (type) => !ENTRIES.some((entry) => entry.type === type),
);
