import type { LevelObject } from '@/types/LevelTypes';
import { EventBus } from '@/utils/EventBus';

export interface SelectionEvents extends Record<string, unknown> {
  changed: { ids: string[] };
}

/**
 * Which objects the editor is currently acting on.
 *
 * Selection is stored as a set of ids rather than as object references, so it
 * survives an undo that removes and reinserts an object, and so a stale
 * selection can never keep a deleted object alive.
 */
export class SelectionManager {
  readonly events = new EventBus<SelectionEvents>();

  private readonly selected = new Set<string>();

  /** Replaces the selection. */
  set(ids: string[]): void {
    this.selected.clear();
    for (const id of ids) this.selected.add(id);
    this.announce();
  }

  add(ids: string[]): void {
    let changed = false;
    for (const id of ids) {
      if (!this.selected.has(id)) {
        this.selected.add(id);
        changed = true;
      }
    }
    if (changed) this.announce();
  }

  remove(ids: string[]): void {
    let changed = false;
    for (const id of ids) {
      if (this.selected.delete(id)) changed = true;
    }
    if (changed) this.announce();
  }

  /** Adds ids not selected and removes ones that are; the shift-click gesture. */
  toggle(ids: string[]): void {
    for (const id of ids) {
      if (this.selected.has(id)) this.selected.delete(id);
      else this.selected.add(id);
    }
    this.announce();
  }

  clear(): void {
    if (this.selected.size === 0) return;
    this.selected.clear();
    this.announce();
  }

  has(id: string): boolean {
    return this.selected.has(id);
  }

  get ids(): string[] {
    return [...this.selected];
  }

  get size(): number {
    return this.selected.size;
  }

  get isEmpty(): boolean {
    return this.selected.size === 0;
  }

  /** Resolves the selection against a level's object list. */
  resolve(objects: readonly LevelObject[]): LevelObject[] {
    return objects.filter((object) => this.selected.has(object.id));
  }

  /**
   * Drops ids that no longer exist.
   *
   * Called after a delete or an undo, so the selection cannot hold onto objects
   * the level has forgotten.
   */
  prune(objects: readonly LevelObject[]): void {
    const live = new Set(objects.map((object) => object.id));
    let changed = false;
    for (const id of [...this.selected]) {
      if (!live.has(id)) {
        this.selected.delete(id);
        changed = true;
      }
    }
    if (changed) this.announce();
  }

  /** The bounding box of the selection, or null when empty. */
  bounds(
    objects: readonly LevelObject[],
  ): { x: number; y: number; width: number; height: number } | null {
    const chosen = this.resolve(objects);
    if (chosen.length === 0) return null;

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const object of chosen) {
      minX = Math.min(minX, object.x);
      minY = Math.min(minY, object.y);
      maxX = Math.max(maxX, object.x);
      maxY = Math.max(maxY, object.y);
    }

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  private announce(): void {
    this.events.emit('changed', { ids: this.ids });
  }
}
