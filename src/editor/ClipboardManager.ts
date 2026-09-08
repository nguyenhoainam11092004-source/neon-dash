import type { LevelObject, LevelTrigger } from '@/types/LevelTypes';
import { deepClone, generateId } from '@/utils/ValidationUtils';

/** What a copy holds: the objects and any triggers that referred to them. */
export interface ClipboardContents {
  objects: LevelObject[];
  triggers: LevelTrigger[];
  /** Top-left of the copied objects, so a paste can be positioned relative to it. */
  originX: number;
  originY: number;
}

/**
 * Copy, cut and paste for the editor.
 *
 * The subtle part is *id remapping*. Objects carry ids, and triggers refer to
 * objects by id; pasting a copy without new ids would produce duplicates that
 * break trigger targeting silently, and keeping the old ids would make the
 * pasted copy's triggers drive the original objects. So every paste mints fresh
 * ids and rewrites the copied triggers to point at them.
 */
export class ClipboardManager {
  private contents: ClipboardContents | null = null;

  /** Stores a copy of the given objects and the triggers that target them. */
  copy(objects: readonly LevelObject[], triggers: readonly LevelTrigger[]): boolean {
    if (objects.length === 0) return false;

    const ids = new Set(objects.map((object) => object.id));

    let originX = Number.POSITIVE_INFINITY;
    let originY = Number.POSITIVE_INFINITY;
    for (const object of objects) {
      originX = Math.min(originX, object.x);
      originY = Math.min(originY, object.y);
    }

    this.contents = {
      objects: objects.map((object) => deepClone(object)),
      // Only triggers wholly inside the selection travel with it: one that
      // targets an object left behind would be meaningless in the copy.
      triggers: triggers
        .filter((trigger) => trigger.target && ids.has(trigger.target))
        .map(deepClone),
      originX,
      originY,
    };

    return true;
  }

  /**
   * Produces a fresh set of objects and triggers to insert.
   *
   * `atX` and `atY` position the copy's top-left corner; passing the original
   * origin plus an offset is how "paste in place, nudged" is expressed.
   */
  paste(atX: number, atY: number): { objects: LevelObject[]; triggers: LevelTrigger[] } | null {
    if (!this.contents) return null;

    const idMap = new Map<string, string>();

    const objects = this.contents.objects.map((source) => {
      const clone = deepClone(source);
      const freshId = generateId('obj');
      idMap.set(source.id, freshId);

      clone.id = freshId;
      clone.x = atX + (source.x - this.contents!.originX);
      clone.y = atY + (source.y - this.contents!.originY);
      return clone;
    });

    const triggers = this.contents.triggers.map((source) => {
      const clone = deepClone(source);
      clone.id = generateId('trg');
      // Repoint at the pasted copy, not at the original.
      if (clone.target) clone.target = idMap.get(clone.target) ?? clone.target;
      // A position-armed trigger has to move with its objects.
      if (clone.x !== undefined) clone.x = atX + (clone.x - this.contents!.originX);
      if (clone.y !== undefined) clone.y = atY + (clone.y - this.contents!.originY);
      return clone;
    });

    return { objects, triggers };
  }

  /**
   * Duplicates objects in place with a small offset.
   *
   * Shares the id-remapping logic with paste by round-tripping through the
   * clipboard, so duplicate and paste can never drift apart in behaviour.
   */
  duplicate(
    objects: readonly LevelObject[],
    triggers: readonly LevelTrigger[],
    offsetX: number,
    offsetY: number,
  ): { objects: LevelObject[]; triggers: LevelTrigger[] } | null {
    const saved = this.contents;
    if (!this.copy(objects, triggers)) {
      this.contents = saved;
      return null;
    }

    const result = this.paste(this.contents!.originX + offsetX, this.contents!.originY + offsetY);
    this.contents = saved;
    return result;
  }

  get hasContents(): boolean {
    return this.contents !== null && this.contents.objects.length > 0;
  }

  get count(): number {
    return this.contents?.objects.length ?? 0;
  }

  clear(): void {
    this.contents = null;
  }
}
