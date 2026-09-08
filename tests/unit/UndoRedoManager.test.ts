import { describe, expect, it } from 'vitest';
import { UndoRedoManager, type Command } from '@/editor/UndoRedoManager';

function counterCommand(counter: { value: number }, delta: number): Command {
  return {
    label: `add ${delta}`,
    execute: () => {
      counter.value += delta;
    },
    undo: () => {
      counter.value -= delta;
    },
  };
}

describe('UndoRedoManager', () => {
  it('executes a command immediately', () => {
    const counter = { value: 0 };
    const manager = new UndoRedoManager();
    manager.execute(counterCommand(counter, 5));
    expect(counter.value).toBe(5);
  });

  it('undo reverses the most recent command', () => {
    const counter = { value: 0 };
    const manager = new UndoRedoManager();
    manager.execute(counterCommand(counter, 5));
    manager.execute(counterCommand(counter, 3));

    manager.undo();
    expect(counter.value).toBe(5);
  });

  it('redo re-applies an undone command', () => {
    const counter = { value: 0 };
    const manager = new UndoRedoManager();
    manager.execute(counterCommand(counter, 5));
    manager.undo();
    manager.redo();
    expect(counter.value).toBe(5);
  });

  it('a new command clears the redo stack', () => {
    const counter = { value: 0 };
    const manager = new UndoRedoManager();
    manager.execute(counterCommand(counter, 5));
    manager.undo();
    manager.execute(counterCommand(counter, 2));

    expect(manager.canRedo).toBe(false);
    expect(counter.value).toBe(2);
  });

  it('undo and redo on an empty history are no-ops that return null', () => {
    const manager = new UndoRedoManager();
    expect(manager.undo()).toBeNull();
    expect(manager.redo()).toBeNull();
  });

  it('merges consecutive commands when mergeWith accepts', () => {
    const counter = { value: 0 };
    const manager = new UndoRedoManager();

    // Mirrors how MoveCommand.mergeWith absorbs the previous command's delta
    // into itself, rather than merely replacing it.
    let totalDelta = 0;
    const makeMergeable = (delta: number): Command => {
      let ownDelta = delta;
      return {
        label: 'merge-move',
        execute: () => {
          counter.value += delta;
        },
        undo: () => {
          counter.value -= ownDelta;
        },
        mergeWith: (previous) => {
          if (previous.label !== 'merge-move') return false;
          ownDelta += totalDelta;
          return true;
        },
      };
    };

    manager.execute(makeMergeable(1));
    totalDelta = 1;
    manager.execute(makeMergeable(1));
    totalDelta = 2;
    manager.execute(makeMergeable(1));

    expect(counter.value).toBe(3);
    expect(manager.depth).toBe(1);

    manager.undo();
    expect(counter.value).toBe(0);
  });

  it('respects a bounded history limit', () => {
    const counter = { value: 0 };
    const manager = new UndoRedoManager(3);

    for (let i = 0; i < 10; i += 1) {
      manager.execute(counterCommand(counter, 1));
    }

    expect(manager.depth).toBe(3);
  });

  it('logs and continues when a command throws during execute', () => {
    const manager = new UndoRedoManager();
    const badCommand: Command = {
      label: 'throws',
      execute: () => {
        throw new Error('boom');
      },
      undo: () => {},
    };

    expect(() => manager.execute(badCommand)).not.toThrow();
    expect(manager.canUndo).toBe(false);
  });

  it('exposes labels for the next undo and redo actions', () => {
    const counter = { value: 0 };
    const manager = new UndoRedoManager();
    manager.execute(counterCommand(counter, 1));
    expect(manager.nextUndoLabel).toBe('add 1');

    manager.undo();
    expect(manager.nextRedoLabel).toBe('add 1');
  });
});
