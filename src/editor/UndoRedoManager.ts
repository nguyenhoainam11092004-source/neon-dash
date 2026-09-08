import { logger } from '@/utils/Logger';

/**
 * One reversible edit.
 *
 * Commands store the minimum needed to undo themselves — the moved object's id
 * and the delta, not a copy of the level — because a snapshot-per-edit history
 * on a ten-thousand-object level would consume hundreds of megabytes within a
 * few minutes of editing.
 */
export interface Command {
  /** Shown in the editor's history, e.g. "Move 4 objects". */
  readonly label: string;
  execute(): void;
  undo(): void;
  /**
   * Optional merge with the command immediately before it.
   *
   * Dragging an object produces one command per frame; merging them means one
   * Ctrl+Z undoes the whole drag rather than one frame of it.
   */
  mergeWith?(previous: Command): boolean;
}

/**
 * The editor's command history.
 *
 * A bounded stack: the oldest entries are dropped rather than the history
 * growing without limit, because an editing session can last hours and no one
 * undoes two thousand steps.
 */
export class UndoRedoManager {
  private readonly undoStack: Command[] = [];
  private readonly redoStack: Command[] = [];
  private readonly limit: number;

  /** Set while executing, so a command's own edits do not record themselves. */
  private suspended = false;

  constructor(limit = 300) {
    this.limit = limit;
  }

  /**
   * Runs a command and records it.
   *
   * Doing anything else — including redoing — clears the redo stack, which is
   * the standard and least surprising behaviour.
   */
  execute(command: Command): void {
    if (this.suspended) {
      command.execute();
      return;
    }

    this.suspended = true;
    try {
      command.execute();
    } catch (error) {
      logger.error('UndoRedoManager', `Command "${command.label}" failed`, error);
      this.suspended = false;
      return;
    }
    this.suspended = false;

    const previous = this.undoStack[this.undoStack.length - 1];
    if (previous && command.mergeWith?.(previous)) {
      // The command absorbed the previous one; replace rather than append.
      this.undoStack[this.undoStack.length - 1] = command;
    } else {
      this.undoStack.push(command);
      if (this.undoStack.length > this.limit) this.undoStack.shift();
    }

    this.redoStack.length = 0;
  }

  undo(): Command | null {
    const command = this.undoStack.pop();
    if (!command) return null;

    this.suspended = true;
    try {
      command.undo();
      this.redoStack.push(command);
    } catch (error) {
      logger.error('UndoRedoManager', `Undo of "${command.label}" failed`, error);
    }
    this.suspended = false;

    return command;
  }

  redo(): Command | null {
    const command = this.redoStack.pop();
    if (!command) return null;

    this.suspended = true;
    try {
      command.execute();
      this.undoStack.push(command);
    } catch (error) {
      logger.error('UndoRedoManager', `Redo of "${command.label}" failed`, error);
    }
    this.suspended = false;

    return command;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Label of the next undo, for the menu. */
  get nextUndoLabel(): string | null {
    return this.undoStack[this.undoStack.length - 1]?.label ?? null;
  }

  get nextRedoLabel(): string | null {
    return this.redoStack[this.redoStack.length - 1]?.label ?? null;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  get depth(): number {
    return this.undoStack.length;
  }
}
