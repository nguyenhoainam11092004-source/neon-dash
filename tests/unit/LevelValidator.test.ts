import { describe, expect, it } from 'vitest';
import { levelValidator } from '@/levels/LevelValidator';
import { levelSerializer } from '@/levels/LevelSerializer';

describe('LevelValidator', () => {
  it('passes a well-formed level', () => {
    const level = levelSerializer.createBlank('Valid Level');
    level.objects.push({ id: 'a', type: 'finish', x: 500, y: 500, rotation: 0, scale: 1 });

    const result = levelValidator.validate(level);
    expect(result.status).not.toBe('ERROR');
  });

  it('rejects a non-object document', () => {
    const result = levelValidator.validate('not an object');
    expect(result.status).toBe('ERROR');
  });

  it('flags a missing name as an error', () => {
    const level = levelSerializer.createBlank();
    (level as unknown as Record<string, unknown>).name = '';
    const result = levelValidator.validate(level);
    expect(result.status).toBe('ERROR');
    expect(result.issues.some((issue) => issue.path === 'name')).toBe(true);
  });

  it('flags an out-of-range BPM as an error', () => {
    const level = levelSerializer.createBlank();
    level.bpm = 5;
    const result = levelValidator.validate(level);
    expect(result.status).toBe('ERROR');
    expect(result.issues.some((issue) => issue.path === 'bpm')).toBe(true);
  });

  it('flags a duplicate object id as an error', () => {
    const level = levelSerializer.createBlank();
    level.objects.push(
      { id: 'dup', type: 'block', x: 0, y: 0, rotation: 0, scale: 1 },
      { id: 'dup', type: 'spike', x: 100, y: 0, rotation: 0, scale: 1 },
    );
    const result = levelValidator.validate(level);
    expect(result.status).toBe('ERROR');
    expect(result.issues.some((issue) => issue.message.includes('Duplicate object id'))).toBe(true);
  });

  it('flags a trigger that targets a missing object as an error', () => {
    const level = levelSerializer.createBlank();
    level.triggers.push({
      id: 't1',
      type: 'move',
      target: 'does-not-exist',
      activation: 'touchX',
      delay: 0,
      duration: 1,
      easing: 'linear',
      value: {},
    });
    const result = levelValidator.validate(level);
    expect(result.status).toBe('ERROR');
    expect(result.issues.some((issue) => issue.path.endsWith('.target'))).toBe(true);
  });

  it('warns, but does not error, when a level has no finish object', () => {
    const level = levelSerializer.createBlank();
    level.objects.push({ id: 'a', type: 'block', x: 0, y: 0, rotation: 0, scale: 1 });
    const result = levelValidator.validate(level);
    expect(result.status).not.toBe('ERROR');
    expect(result.issues.some((issue) => issue.message.includes('No finish object'))).toBe(true);
  });

  it('rejects ceiling below ground as an error', () => {
    const level = levelSerializer.createBlank();
    level.groundY = 100;
    level.ceilingY = 200;
    const result = levelValidator.validate(level);
    expect(result.status).toBe('ERROR');
  });

  it('isLoadable matches whether validation reported an error', () => {
    const good = levelSerializer.createBlank();
    expect(levelValidator.isLoadable(good)).toBe(true);
    expect(levelValidator.isLoadable({ objects: 'not-an-array' })).toBe(false);
  });
});
