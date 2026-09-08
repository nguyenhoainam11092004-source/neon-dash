import { describe, expect, it } from 'vitest';
import { levelSerializer } from '@/levels/LevelSerializer';
import type { LevelData } from '@/types/LevelTypes';

function sampleLevel(): LevelData {
  const level = levelSerializer.createBlank('Test Level', 'Tester');
  level.objects.push(
    { id: 'obj_1', type: 'block', x: 100, y: 500, rotation: 0, scale: 1 },
    { id: 'obj_2', type: 'spike', x: 200, y: 500, rotation: 0, scale: 1 },
  );
  level.triggers.push({
    id: 'trg_1',
    type: 'move',
    target: 'obj_1',
    activation: 'touchX',
    x: 150,
    delay: 0,
    duration: 1,
    easing: 'easeInOut',
    value: { x: 0, y: -80 },
  });
  return level;
}

describe('LevelSerializer', () => {
  it('round-trips a level through serialize and deserialize losslessly', () => {
    const level = sampleLevel();
    const json = levelSerializer.serialize(level);
    const restored = levelSerializer.deserialize(json);

    expect(restored.name).toBe(level.name);
    expect(restored.objects).toHaveLength(2);
    expect(restored.objects[0]?.id).toBe('obj_1');
    expect(restored.triggers).toHaveLength(1);
    expect(restored.triggers[0]?.target).toBe('obj_1');
  });

  it('fills in defaults for a minimal document', () => {
    const level = levelSerializer.parse({ name: 'Minimal' });

    expect(level.name).toBe('Minimal');
    expect(level.difficulty).toBe('Normal');
    expect(level.startMode).toBe('cube');
    expect(level.startSpeed).toBe('normal');
    expect(level.startGravity).toBe('down');
    expect(Array.isArray(level.objects)).toBe(true);
    expect(level.objects).toHaveLength(0);
    expect(level.id.length).toBeGreaterThan(0);
  });

  it('rejects a non-object document', () => {
    expect(() => levelSerializer.parse(null)).toThrow();
    expect(() => levelSerializer.parse('a string')).toThrow();
  });

  it('reports a readable error for malformed JSON', () => {
    expect(() => levelSerializer.deserialize('{ not json')).toThrow(/not valid JSON/i);
  });

  it('substitutes an unknown object type with a safe default rather than throwing', () => {
    const level = levelSerializer.parse({
      objects: [{ id: 'x', type: 'not-a-real-type', x: 0, y: 0 }],
    });
    expect(level.objects[0]?.type).toBe('block');
  });

  it('clamps an out-of-range scale to the valid interval', () => {
    const level = levelSerializer.parse({
      objects: [{ id: 'x', type: 'block', x: 0, y: 0, scale: 999 }],
    });
    expect(level.objects[0]?.scale).toBeLessThanOrEqual(40);
  });

  it('createBlank produces a document with no objects or triggers', () => {
    const level = levelSerializer.createBlank();
    expect(level.objects).toHaveLength(0);
    expect(level.triggers).toHaveLength(0);
    expect(level.groundY).toBeGreaterThan(level.ceilingY);
  });
});
