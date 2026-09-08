import type { LevelData, LevelObject } from '@/types/LevelTypes';
import { deepClone } from '@/utils/ValidationUtils';
import type { Command } from './UndoRedoManager';

/**
 * The concrete edit operations.
 *
 * Each one holds only what it needs to reverse itself. `MoveCommand` stores a
 * delta and a list of ids; `DeleteCommand` has to store the removed objects
 * because nothing else will, but that is bounded by the size of the selection
 * rather than by the size of the level.
 */

/** Callback the editor supplies so commands can announce a change. */
export type ChangeNotifier = () => void;

export class CreateCommand implements Command {
  readonly label: string;
  private readonly level: LevelData;
  private readonly objects: LevelObject[];
  private readonly notify: ChangeNotifier;

  constructor(level: LevelData, objects: LevelObject[], notify: ChangeNotifier) {
    this.level = level;
    this.objects = objects;
    this.notify = notify;
    this.label =
      objects.length === 1
        ? `Place ${objects[0]?.type ?? 'object'}`
        : `Place ${objects.length} objects`;
  }

  execute(): void {
    this.level.objects.push(...this.objects);
    this.notify();
  }

  undo(): void {
    const ids = new Set(this.objects.map((object) => object.id));
    // Filtering in place keeps the array identity, which the editor's views map
    // is indexed against.
    for (let i = this.level.objects.length - 1; i >= 0; i -= 1) {
      const object = this.level.objects[i];
      if (object && ids.has(object.id)) this.level.objects.splice(i, 1);
    }
    this.notify();
  }
}

export class DeleteCommand implements Command {
  readonly label: string;
  private readonly level: LevelData;
  private readonly removed: { object: LevelObject; index: number }[] = [];
  private readonly ids: Set<string>;
  private readonly notify: ChangeNotifier;

  constructor(level: LevelData, ids: string[], notify: ChangeNotifier) {
    this.level = level;
    this.ids = new Set(ids);
    this.notify = notify;
    this.label = ids.length === 1 ? 'Delete object' : `Delete ${ids.length} objects`;
  }

  execute(): void {
    this.removed.length = 0;
    for (let i = this.level.objects.length - 1; i >= 0; i -= 1) {
      const object = this.level.objects[i];
      if (!object || !this.ids.has(object.id)) continue;
      this.removed.push({ object, index: i });
      this.level.objects.splice(i, 1);
    }
    this.notify();
  }

  undo(): void {
    // Reinsert back-to-front so each recorded index is still valid.
    for (let i = this.removed.length - 1; i >= 0; i -= 1) {
      const entry = this.removed[i];
      if (entry) this.level.objects.splice(entry.index, 0, entry.object);
    }
    this.removed.length = 0;
    this.notify();
  }
}

export class MoveCommand implements Command {
  readonly label: string;
  private readonly objects: LevelObject[];
  private dx: number;
  private dy: number;
  private readonly notify: ChangeNotifier;

  constructor(objects: LevelObject[], dx: number, dy: number, notify: ChangeNotifier) {
    this.objects = objects;
    this.dx = dx;
    this.dy = dy;
    this.notify = notify;
    this.label = objects.length === 1 ? 'Move object' : `Move ${objects.length} objects`;
  }

  execute(): void {
    for (const object of this.objects) {
      object.x += this.dx;
      object.y += this.dy;
    }
    this.notify();
  }

  undo(): void {
    for (const object of this.objects) {
      object.x -= this.dx;
      object.y -= this.dy;
    }
    this.notify();
  }

  /**
   * Absorbs the previous move of the same objects.
   *
   * A drag emits a command per pointer-move event; without this, undoing a drag
   * would take dozens of keystrokes.
   */
  mergeWith(previous: Command): boolean {
    if (!(previous instanceof MoveCommand)) return false;
    if (previous.objects.length !== this.objects.length) return false;
    for (let i = 0; i < this.objects.length; i += 1) {
      if (previous.objects[i] !== this.objects[i]) return false;
    }
    this.dx += previous.dx;
    this.dy += previous.dy;
    return true;
  }
}

export class TransformCommand implements Command {
  readonly label: string;
  private readonly objects: LevelObject[];
  private readonly before: { rotation: number; scale: number }[];
  private readonly rotationDelta: number;
  private readonly scaleFactor: number;
  private readonly notify: ChangeNotifier;

  constructor(
    objects: LevelObject[],
    rotationDelta: number,
    scaleFactor: number,
    notify: ChangeNotifier,
  ) {
    this.objects = objects;
    this.rotationDelta = rotationDelta;
    this.scaleFactor = scaleFactor;
    this.notify = notify;
    this.before = objects.map((object) => ({ rotation: object.rotation, scale: object.scale }));
    this.label = rotationDelta !== 0 ? 'Rotate' : 'Scale';
  }

  execute(): void {
    for (const object of this.objects) {
      object.rotation += this.rotationDelta;
      // Clamped so a runaway scroll cannot produce an object the renderer
      // refuses to draw.
      object.scale = Math.min(40, Math.max(0.05, object.scale * this.scaleFactor));
    }
    this.notify();
  }

  undo(): void {
    this.objects.forEach((object, index) => {
      const snapshot = this.before[index];
      if (!snapshot) return;
      object.rotation = snapshot.rotation;
      object.scale = snapshot.scale;
    });
    this.notify();
  }
}

export class PropertyCommand implements Command {
  readonly label: string;
  private readonly object: LevelObject;
  private readonly key: string;
  private readonly next: unknown;
  private previous: unknown;
  private readonly notify: ChangeNotifier;

  constructor(object: LevelObject, key: string, value: unknown, notify: ChangeNotifier) {
    this.object = object;
    this.key = key;
    this.next = value;
    this.notify = notify;
    this.label = `Set ${key}`;
  }

  execute(): void {
    const props = (this.object.props ??= {});
    this.previous = props[this.key];
    props[this.key] = this.next;
    this.notify();
  }

  undo(): void {
    const props = (this.object.props ??= {});
    if (this.previous === undefined) delete props[this.key];
    else props[this.key] = this.previous;
    this.notify();
  }
}

export class TriggerCommand implements Command {
  readonly label: string;
  private readonly level: LevelData;
  private readonly trigger: LevelData['triggers'][number];
  private readonly adding: boolean;
  private removedIndex = -1;
  private readonly notify: ChangeNotifier;

  constructor(
    level: LevelData,
    trigger: LevelData['triggers'][number],
    adding: boolean,
    notify: ChangeNotifier,
  ) {
    this.level = level;
    this.trigger = trigger;
    this.adding = adding;
    this.notify = notify;
    this.label = adding ? `Add ${trigger.type} trigger` : 'Remove trigger';
  }

  execute(): void {
    if (this.adding) {
      this.level.triggers.push(this.trigger);
    } else {
      this.removedIndex = this.level.triggers.indexOf(this.trigger);
      if (this.removedIndex >= 0) this.level.triggers.splice(this.removedIndex, 1);
    }
    this.notify();
  }

  undo(): void {
    if (this.adding) {
      const index = this.level.triggers.indexOf(this.trigger);
      if (index >= 0) this.level.triggers.splice(index, 1);
    } else if (this.removedIndex >= 0) {
      this.level.triggers.splice(this.removedIndex, 0, this.trigger);
    }
    this.notify();
  }
}

/** Changes a metadata field, e.g. the level's name or BPM. */
export class MetadataCommand<K extends keyof LevelData> implements Command {
  readonly label: string;
  private readonly level: LevelData;
  private readonly key: K;
  private readonly next: LevelData[K];
  private previous: LevelData[K];
  private readonly notify: ChangeNotifier;

  constructor(level: LevelData, key: K, value: LevelData[K], notify: ChangeNotifier) {
    this.level = level;
    this.key = key;
    this.next = value;
    this.previous = deepClone(level[key]);
    this.notify = notify;
    this.label = `Set ${String(key)}`;
  }

  execute(): void {
    this.previous = deepClone(this.level[this.key]);
    this.level[this.key] = this.next;
    this.notify();
  }

  undo(): void {
    this.level[this.key] = this.previous;
    this.notify();
  }
}
