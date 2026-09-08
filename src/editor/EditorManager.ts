import { GRID, type SpeedTier } from '@/config/constants';
import { levelSerializer } from '@/levels/LevelSerializer';
import { levelValidator } from '@/levels/LevelValidator';
import type {
  GameModeId,
  GravityDirection,
  LevelData,
  LevelObject,
  LevelObjectType,
  LevelTrigger,
  TriggerType,
  ValidationResult,
} from '@/types/LevelTypes';
import { EventBus } from '@/utils/EventBus';
import { generateId, slugify } from '@/utils/ValidationUtils';
import { ClipboardManager } from './ClipboardManager';
import {
  CreateCommand,
  DeleteCommand,
  MetadataCommand,
  MoveCommand,
  PropertyCommand,
  TransformCommand,
  TriggerCommand,
} from './EditorCommands';
import { SelectionManager } from './SelectionManager';
import { UndoRedoManager } from './UndoRedoManager';

export interface EditorEvents extends Record<string, unknown> {
  'level:changed': { level: LevelData };
  'selection:changed': { ids: string[] };
  'history:changed': { canUndo: boolean; canRedo: boolean };
  validated: { result: ValidationResult };
}

/**
 * The editor's model layer: the level being edited and every operation on it.
 *
 * Deliberately free of Phaser. EditorScene renders what this exposes and turns
 * input into calls on it, but every edit — including undo, clipboard and
 * validation — runs headlessly, which is what makes the editor testable.
 */
export class EditorManager {
  readonly events = new EventBus<EditorEvents>();
  readonly selection = new SelectionManager();
  readonly clipboard = new ClipboardManager();
  readonly history = new UndoRedoManager();

  private level: LevelData;
  private dirty = false;

  /** The type the next click will place. */
  private brush: LevelObjectType = 'block';

  constructor(level?: LevelData) {
    this.level = level ?? levelSerializer.createBlank();
    this.selection.events.on('changed', ({ ids }) => {
      this.events.emit('selection:changed', { ids });
    });
  }

  // ---------- Document ----------

  get current(): LevelData {
    return this.level;
  }

  get hasUnsavedChanges(): boolean {
    return this.dirty;
  }

  /** Replaces the document being edited and resets all editing state. */
  open(level: LevelData): void {
    this.level = level;
    this.selection.clear();
    this.history.clear();
    this.dirty = false;
    this.notifyChanged();
  }

  markSaved(): void {
    this.dirty = false;
  }

  private notifyChanged(): void {
    this.dirty = true;
    this.selection.prune(this.level.objects);
    this.events.emit('level:changed', { level: this.level });
    this.events.emit('history:changed', {
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
    });
  }

  // ---------- Brush ----------

  setBrush(type: LevelObjectType): void {
    this.brush = type;
  }

  get currentBrush(): LevelObjectType {
    return this.brush;
  }

  // ---------- Object operations ----------

  /**
   * Places one object of the current brush type.
   *
   * Default properties come from the type: a platform is wide and thin, a
   * portal carries the mode or direction it needs. Without those defaults every
   * placement would need a trip to the property panel.
   */
  place(x: number, y: number, overrides: Partial<LevelObject> = {}): LevelObject {
    const object: LevelObject = {
      id: generateId('obj'),
      type: this.brush,
      x,
      y,
      rotation: 0,
      scale: 1,
      props: defaultPropsFor(this.brush),
      ...overrides,
    };

    this.history.execute(new CreateCommand(this.level, [object], () => this.notifyChanged()));
    return object;
  }

  /** Places several objects as one undoable step, e.g. a drag-painted run. */
  placeMany(objects: LevelObject[]): void {
    if (objects.length === 0) return;
    this.history.execute(new CreateCommand(this.level, objects, () => this.notifyChanged()));
  }

  deleteSelected(): void {
    const ids = this.selection.ids;
    if (ids.length === 0) return;
    this.history.execute(new DeleteCommand(this.level, ids, () => this.notifyChanged()));
    this.selection.clear();
  }

  moveSelected(dx: number, dy: number): void {
    const objects = this.selection.resolve(this.level.objects);
    if (objects.length === 0 || (dx === 0 && dy === 0)) return;
    this.history.execute(new MoveCommand(objects, dx, dy, () => this.notifyChanged()));
  }

  rotateSelected(degrees: number): void {
    const objects = this.selection.resolve(this.level.objects);
    if (objects.length === 0) return;
    this.history.execute(new TransformCommand(objects, degrees, 1, () => this.notifyChanged()));
  }

  scaleSelected(factor: number): void {
    const objects = this.selection.resolve(this.level.objects);
    if (objects.length === 0) return;
    this.history.execute(new TransformCommand(objects, 0, factor, () => this.notifyChanged()));
  }

  setProperty(objectId: string, key: string, value: unknown): void {
    const object = this.level.objects.find((entry) => entry.id === objectId);
    if (!object) return;
    this.history.execute(new PropertyCommand(object, key, value, () => this.notifyChanged()));
  }

  setMetadata<K extends keyof LevelData>(key: K, value: LevelData[K]): void {
    this.history.execute(new MetadataCommand(this.level, key, value, () => this.notifyChanged()));
  }

  // ---------- Clipboard ----------

  copySelection(): boolean {
    const objects = this.selection.resolve(this.level.objects);
    return this.clipboard.copy(objects, this.level.triggers);
  }

  cutSelection(): boolean {
    if (!this.copySelection()) return false;
    this.deleteSelected();
    return true;
  }

  /** Pastes at a world position, selecting what was pasted. */
  pasteAt(x: number, y: number): boolean {
    const pasted = this.clipboard.paste(x, y);
    if (!pasted || pasted.objects.length === 0) return false;

    this.history.execute(new CreateCommand(this.level, pasted.objects, () => this.notifyChanged()));
    for (const trigger of pasted.triggers) {
      this.history.execute(
        new TriggerCommand(this.level, trigger, true, () => this.notifyChanged()),
      );
    }

    this.selection.set(pasted.objects.map((object) => object.id));
    return true;
  }

  duplicateSelection(): boolean {
    const objects = this.selection.resolve(this.level.objects);
    if (objects.length === 0) return false;

    const copy = this.clipboard.duplicate(objects, this.level.triggers, GRID.SIZE, 0);
    if (!copy) return false;

    this.history.execute(new CreateCommand(this.level, copy.objects, () => this.notifyChanged()));
    for (const trigger of copy.triggers) {
      this.history.execute(
        new TriggerCommand(this.level, trigger, true, () => this.notifyChanged()),
      );
    }

    this.selection.set(copy.objects.map((object) => object.id));
    return true;
  }

  // ---------- Triggers ----------

  addTrigger(type: TriggerType, target: string | undefined, atX: number): LevelTrigger {
    const trigger: LevelTrigger = {
      id: generateId('trg'),
      type,
      target,
      x: atX,
      activation: 'touchX',
      delay: 0,
      duration: type === 'toggle' ? 0 : 1,
      easing: 'easeInOut',
      value: defaultTriggerValue(type),
    };

    this.history.execute(new TriggerCommand(this.level, trigger, true, () => this.notifyChanged()));
    return trigger;
  }

  removeTrigger(triggerId: string): void {
    const trigger = this.level.triggers.find((entry) => entry.id === triggerId);
    if (!trigger) return;
    this.history.execute(
      new TriggerCommand(this.level, trigger, false, () => this.notifyChanged()),
    );
  }

  /** Triggers that act on a given object, for the property panel. */
  triggersFor(objectId: string): LevelTrigger[] {
    return this.level.triggers.filter((trigger) => trigger.target === objectId);
  }

  // ---------- History ----------

  undo(): void {
    if (this.history.undo()) this.notifyChanged();
  }

  redo(): void {
    if (this.history.redo()) this.notifyChanged();
  }

  // ---------- Selection helpers ----------

  /** Selects every object whose centre falls inside a world rectangle. */
  selectInRect(x: number, y: number, width: number, height: number, additive: boolean): void {
    const left = Math.min(x, x + width);
    const right = Math.max(x, x + width);
    const top = Math.min(y, y + height);
    const bottom = Math.max(y, y + height);

    const ids = this.level.objects
      .filter(
        (object) => object.x >= left && object.x <= right && object.y >= top && object.y <= bottom,
      )
      .map((object) => object.id);

    if (additive) this.selection.add(ids);
    else this.selection.set(ids);
  }

  selectAll(): void {
    this.selection.set(this.level.objects.map((object) => object.id));
  }

  /**
   * The topmost object at a world point.
   *
   * Later objects win, matching what the renderer draws on top, so clicking an
   * overlapping pile picks the one the author can see.
   */
  objectAt(x: number, y: number, tolerance = GRID.SIZE / 2): LevelObject | null {
    for (let i = this.level.objects.length - 1; i >= 0; i -= 1) {
      const object = this.level.objects[i];
      if (!object) continue;
      const half = (GRID.SIZE * object.scale) / 2 + tolerance * 0.2;
      if (Math.abs(object.x - x) <= half && Math.abs(object.y - y) <= half) return object;
    }
    return null;
  }

  // ---------- Validation and export ----------

  validate(): ValidationResult {
    const result = levelValidator.validate(this.level);
    this.events.emit('validated', { result });
    return result;
  }

  toJson(): string {
    return levelSerializer.serialize(this.level);
  }

  /** A filename-safe name for the exported file. */
  get exportFileName(): string {
    return `${slugify(this.level.name) || 'level'}.json`;
  }

  get objectCount(): number {
    return this.level.objects.length;
  }

  get triggerCount(): number {
    return this.level.triggers.length;
  }
}

/**
 * Sensible starting properties per object type.
 *
 * These are the values that make a freshly placed object immediately useful:
 * a mode portal has to name a mode, a speed portal a tier, or the object is
 * inert until the author visits the property panel.
 */
export function defaultPropsFor(type: LevelObjectType): Record<string, unknown> | undefined {
  switch (type) {
    case 'platform':
      return { width: 4, height: 0.5 };
    case 'block':
      return { width: 1, height: 1 };
    case 'saw':
      return { spinSpeed: 1.4 };
    case 'jumpPad':
      return { power: 1.35 };
    case 'jumpRing':
      return { power: 1.1 };
    case 'modePortal':
      return { mode: 'ship' satisfies GameModeId };
    case 'gravityPortal':
      return { gravity: 'up' satisfies GravityDirection };
    case 'speedPortal':
      return { speed: 'fast' satisfies SpeedTier };
    case 'teleportPortal':
      return { targetY: 300 };
    default:
      return undefined;
  }
}

/** Starting value for a newly added trigger, so it does something visible. */
function defaultTriggerValue(type: TriggerType): Record<string, unknown> {
  switch (type) {
    case 'move':
      return { x: 0, y: -GRID.SIZE * 3 };
    case 'rotate':
      return { rotation: 180 };
    case 'scale':
      return { scale: 2 };
    case 'alpha':
      return { alpha: 0 };
    case 'color':
      return { color: '#ff2fa8' };
    case 'pulse':
      return { scale: 0.35 };
    case 'shake':
      return { intensity: 10 };
    case 'zoom':
      return { zoom: 0.85 };
    case 'camera':
      return { x: 0, y: -120 };
    case 'toggle':
      return { enabled: false };
    case 'spawn':
      return { x: 0, y: 0, color: '#2ff3f0', intensity: 16 };
    default:
      return {};
  }
}
