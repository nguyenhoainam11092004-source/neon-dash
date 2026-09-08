import { beforeEach, describe, expect, it } from 'vitest';
import { EditorManager } from '@/editor/EditorManager';
import { levelSerializer } from '@/levels/LevelSerializer';

describe('EditorManager', () => {
  let editor: EditorManager;

  beforeEach(() => {
    editor = new EditorManager(levelSerializer.createBlank('Test', 'Tester'));
  });

  it('places an object of the current brush type', () => {
    editor.setBrush('spike');
    const object = editor.place(100, 200);

    expect(object.type).toBe('spike');
    expect(editor.current.objects).toHaveLength(1);
    expect(editor.current.objects[0]?.x).toBe(100);
  });

  it('undo removes a placed object and redo restores it', () => {
    editor.place(0, 0);
    expect(editor.objectCount).toBe(1);

    editor.undo();
    expect(editor.objectCount).toBe(0);

    editor.redo();
    expect(editor.objectCount).toBe(1);
  });

  it('deleteSelected removes exactly the selected objects', () => {
    const a = editor.place(0, 0);
    const b = editor.place(100, 0);
    editor.place(200, 0);

    editor.selection.set([a.id, b.id]);
    editor.deleteSelected();

    expect(editor.objectCount).toBe(1);
    expect(editor.current.objects[0]?.x).toBe(200);
  });

  it('undo after delete restores the deleted objects', () => {
    const a = editor.place(0, 0);
    editor.selection.set([a.id]);
    editor.deleteSelected();
    expect(editor.objectCount).toBe(0);

    editor.undo();
    expect(editor.objectCount).toBe(1);
    expect(editor.current.objects[0]?.id).toBe(a.id);
  });

  it('moveSelected shifts every selected object by the same delta', () => {
    const a = editor.place(0, 0);
    const b = editor.place(50, 50);
    editor.selection.set([a.id, b.id]);

    editor.moveSelected(10, -5);

    expect(editor.current.objects.find((o) => o.id === a.id)?.x).toBe(10);
    expect(editor.current.objects.find((o) => o.id === b.id)?.y).toBe(45);
  });

  it('consecutive moves of the same selection merge into a single undo step', () => {
    const a = editor.place(0, 0);
    editor.selection.set([a.id]);

    editor.moveSelected(10, 0);
    editor.moveSelected(10, 0);
    editor.moveSelected(10, 0);

    expect(editor.current.objects[0]?.x).toBe(30);
    expect(editor.history.depth).toBeLessThanOrEqual(2); // the place + the merged move

    editor.undo();
    expect(editor.current.objects[0]?.x).toBe(0);
  });

  it('copy and paste duplicates an object with a fresh id', () => {
    const a = editor.place(0, 0);
    editor.selection.set([a.id]);
    expect(editor.copySelection()).toBe(true);

    editor.pasteAt(500, 500);

    expect(editor.objectCount).toBe(2);
    const pasted = editor.current.objects.find((o) => o.id !== a.id);
    expect(pasted).toBeDefined();
    expect(pasted?.x).toBe(500);
    expect(pasted?.y).toBe(500);
  });

  it('pasted triggers are remapped to the new object ids', () => {
    const a = editor.place(0, 0);
    editor.addTrigger('move', a.id, 0);

    editor.selection.set([a.id]);
    editor.copySelection();
    editor.pasteAt(1000, 0);

    const pastedObject = editor.current.objects.find((o) => o.id !== a.id);
    expect(pastedObject).toBeDefined();

    const pastedTrigger = editor.current.triggers.find((t) => t.target === pastedObject?.id);
    expect(pastedTrigger).toBeDefined();
    // The original trigger must still point at the original object.
    expect(editor.current.triggers.find((t) => t.target === a.id)).toBeDefined();
  });

  it('duplicateSelection offsets the copy and selects it', () => {
    const a = editor.place(0, 0);
    editor.selection.set([a.id]);

    expect(editor.duplicateSelection()).toBe(true);
    expect(editor.objectCount).toBe(2);
    expect(editor.selection.ids).not.toContain(a.id);
  });

  it('setProperty is undoable', () => {
    // 'block' is placed with default props { width: 1, height: 1 }.
    const a = editor.place(0, 0);
    expect(editor.current.objects[0]?.props?.width).toBe(1);

    editor.setProperty(a.id, 'width', 4);
    expect(editor.current.objects[0]?.props?.width).toBe(4);

    editor.undo();
    expect(editor.current.objects[0]?.props?.width).toBe(1);
  });

  it('validate reports an error for an empty name', () => {
    editor.setMetadata('name', '');
    const result = editor.validate();
    expect(result.status).toBe('ERROR');
  });

  it('selectInRect selects only objects within the rectangle', () => {
    const inside = editor.place(50, 50);
    editor.place(500, 500);

    editor.selectInRect(0, 0, 100, 100, false);

    expect(editor.selection.ids).toEqual([inside.id]);
  });

  it('objectAt finds the topmost object under a point', () => {
    editor.place(100, 100);
    const top = editor.place(100, 100);

    expect(editor.objectAt(100, 100)?.id).toBe(top.id);
  });

  it('removeTrigger deletes a trigger and undo restores it', () => {
    const a = editor.place(0, 0);
    const trigger = editor.addTrigger('rotate', a.id, 0);
    expect(editor.triggerCount).toBe(1);

    editor.removeTrigger(trigger.id);
    expect(editor.triggerCount).toBe(0);

    editor.undo();
    expect(editor.triggerCount).toBe(1);
  });
});
