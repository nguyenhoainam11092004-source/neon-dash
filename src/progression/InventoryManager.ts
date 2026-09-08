import type { SaveManager } from '@/save/SaveManager';
import type { PlayerCustomization } from '@/types/PlayerTypes';
import { EventBus } from '@/utils/EventBus';

/** The kinds of cosmetic a player can own. */
export type CosmeticKind = 'skin' | 'color' | 'trail' | 'death';

export interface CosmeticDefinition {
  /** Fully qualified id, e.g. "trail:comet". Unique across kinds. */
  id: string;
  kind: CosmeticKind;
  name: string;
  /** Cost in coins. Zero means it is owned from the start. */
  price: number;
  /** Hex colour, for colour cosmetics. */
  value?: string;
  /** An achievement that grants this instead of it being purchasable. */
  unlockedBy?: string;
}

export interface InventoryEvents extends Record<string, unknown> {
  purchased: { item: CosmeticDefinition };
  equipped: { item: CosmeticDefinition };
  'purchase-failed': { item: CosmeticDefinition; reason: string };
}

/**
 * The cosmetic catalogue.
 *
 * Purely visual by design: nothing here changes hit boxes, speeds or physics,
 * so a player who buys nothing is never at a disadvantage.
 */
export const COSMETICS: readonly CosmeticDefinition[] = [
  { id: 'skin:classic', kind: 'skin', name: 'Classic', price: 0 },
  { id: 'skin:outline', kind: 'skin', name: 'Outline', price: 40 },
  { id: 'skin:solid', kind: 'skin', name: 'Solid', price: 40 },
  { id: 'skin:prism', kind: 'skin', name: 'Prism', price: 120, unlockedBy: 'five_down' },

  { id: 'color:cyan', kind: 'color', name: 'Cyan', price: 0, value: '#2ff3f0' },
  { id: 'color:magenta', kind: 'color', name: 'Magenta', price: 0, value: '#ff2fa8' },
  { id: 'color:violet', kind: 'color', name: 'Violet', price: 20, value: '#9b5cff' },
  { id: 'color:lime', kind: 'color', name: 'Lime', price: 20, value: '#8bff3d' },
  { id: 'color:amber', kind: 'color', name: 'Amber', price: 25, value: '#ffc93d' },
  { id: 'color:coral', kind: 'color', name: 'Coral', price: 25, value: '#ff5c5c' },
  { id: 'color:white', kind: 'color', name: 'White', price: 35, value: '#f2f6ff' },
  {
    id: 'color:void',
    kind: 'color',
    name: 'Void',
    price: 90,
    value: '#1a0f2e',
    unlockedBy: 'full_set',
  },

  { id: 'trail:none', kind: 'trail', name: 'None', price: 0 },
  { id: 'trail:comet', kind: 'trail', name: 'Comet', price: 50 },
  { id: 'trail:ribbon', kind: 'trail', name: 'Ribbon', price: 60 },
  { id: 'trail:sparks', kind: 'trail', name: 'Sparks', price: 75, unlockedBy: 'airborne' },

  { id: 'death:shatter', kind: 'death', name: 'Shatter', price: 0 },
  { id: 'death:bloom', kind: 'death', name: 'Bloom', price: 45 },
  { id: 'death:collapse', kind: 'death', name: 'Collapse', price: 65 },
  { id: 'death:supernova', kind: 'death', name: 'Supernova', price: 110, unlockedBy: 'relentless' },
];

/**
 * Owns what the player has bought and what they have equipped.
 *
 * The manager is the only writer of the inventory block in the save, so the
 * rules about affording, owning and equipping are stated once here rather than
 * being re-implemented by each screen that touches cosmetics.
 */
export class InventoryManager {
  readonly events = new EventBus<InventoryEvents>();

  private readonly save: SaveManager;
  private readonly catalogue: Map<string, CosmeticDefinition>;

  constructor(save: SaveManager, catalogue: readonly CosmeticDefinition[] = COSMETICS) {
    this.save = save;
    this.catalogue = new Map(catalogue.map((item) => [item.id, item]));
  }

  get currency(): number {
    return this.save.current.inventory.currency;
  }

  get equipped(): PlayerCustomization {
    return this.save.current.inventory.equipped;
  }

  /** Free items and achievement rewards count as owned without a purchase. */
  owns(id: string): boolean {
    const item = this.catalogue.get(id);
    if (!item) return false;
    if (item.price === 0 && !item.unlockedBy) return true;
    if (item.unlockedBy) return this.save.current.achievements[item.unlockedBy]?.unlocked ?? false;
    return this.save.current.inventory.unlocked.includes(id);
  }

  /** Whether the item can be bought right now. */
  canAfford(id: string): boolean {
    const item = this.catalogue.get(id);
    if (!item) return false;
    return this.currency >= item.price;
  }

  purchase(id: string): boolean {
    const item = this.catalogue.get(id);
    if (!item) return false;

    if (this.owns(id)) {
      this.events.emit('purchase-failed', { item, reason: 'Already owned' });
      return false;
    }

    if (item.unlockedBy) {
      this.events.emit('purchase-failed', {
        item,
        reason: 'Unlocked by an achievement, not for sale',
      });
      return false;
    }

    if (this.currency < item.price) {
      this.events.emit('purchase-failed', { item, reason: 'Not enough coins' });
      return false;
    }

    this.save.current.inventory.currency -= item.price;
    this.save.current.inventory.unlocked.push(id);
    this.save.markDirty();
    this.events.emit('purchased', { item });
    return true;
  }

  /**
   * Equips an owned item into the slot its kind implies.
   *
   * Colours are the exception: there are two colour slots, so the caller says
   * which one.
   */
  equip(id: string, colorSlot: 'primary' | 'secondary' = 'primary'): boolean {
    const item = this.catalogue.get(id);
    if (!item || !this.owns(id)) return false;

    const equipped = this.save.current.inventory.equipped;

    switch (item.kind) {
      case 'skin':
        equipped.skin = id.split(':')[1] ?? 'classic';
        break;
      case 'trail':
        equipped.trail = id.split(':')[1] ?? 'none';
        break;
      case 'death':
        equipped.deathEffect = id.split(':')[1] ?? 'shatter';
        break;
      case 'color': {
        const value = item.value ?? '#2ff3f0';
        if (colorSlot === 'primary') equipped.primaryColor = value;
        else equipped.secondaryColor = value;
        break;
      }
    }

    this.save.markDirty();
    this.events.emit('equipped', { item });
    return true;
  }

  /** Adds coins, e.g. from collectibles. */
  addCurrency(amount: number): void {
    this.save.current.inventory.currency = Math.max(0, this.currency + amount);
    this.save.markDirty();
  }

  /** Every item of a kind, for the customisation screen. */
  byKind(kind: CosmeticKind): CosmeticDefinition[] {
    return [...this.catalogue.values()].filter((item) => item.kind === kind);
  }

  get(id: string): CosmeticDefinition | undefined {
    return this.catalogue.get(id);
  }

  get ownedCount(): number {
    return [...this.catalogue.keys()].filter((id) => this.owns(id)).length;
  }

  get totalCount(): number {
    return this.catalogue.size;
  }
}
