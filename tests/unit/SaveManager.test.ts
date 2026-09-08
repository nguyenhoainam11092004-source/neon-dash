import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStorageAdapter, SaveManager } from '@/save/SaveManager';
import { SAVE } from '@/config/constants';

describe('SaveManager', () => {
  let storage: MemoryStorageAdapter;
  let manager: SaveManager;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
    manager = new SaveManager(storage, 'test-key');
  });

  it('loads default data when nothing has been saved', () => {
    const data = manager.load();
    expect(data.version).toBe(SAVE.SAVE_VERSION);
    expect(data.stats.totalAttempts).toBe(0);
    expect(data.settings.masterVolume).toBeGreaterThan(0);
  });

  it('persists a write and reads it back on a fresh manager', () => {
    manager.load();
    manager.updateSettings({ masterVolume: 0.3 });
    manager.markDirty();
    expect(manager.flush()).toBe(true);

    const reloaded = new SaveManager(storage, 'test-key');
    const data = reloaded.load();
    expect(data.settings.masterVolume).toBe(0.3);
  });

  it('never lowers bestProgress on a worse subsequent attempt', () => {
    manager.load();
    manager.updateProgress('level_1', { bestProgress: 0.8 });
    manager.updateProgress('level_1', { bestProgress: 0.3 });

    expect(manager.getProgress('level_1').bestProgress).toBe(0.8);
  });

  it('raises bestProgress on a better attempt', () => {
    manager.load();
    manager.updateProgress('level_1', { bestProgress: 0.4 });
    manager.updateProgress('level_1', { bestProgress: 0.9 });

    expect(manager.getProgress('level_1').bestProgress).toBe(0.9);
  });

  it('merges collected coins without duplicating ids', () => {
    manager.load();
    manager.updateProgress('level_1', { coinsCollected: ['a', 'b'] });
    manager.updateProgress('level_1', { coinsCollected: ['b', 'c'] });

    expect(manager.getProgress('level_1').coinsCollected.sort()).toEqual(['a', 'b', 'c']);
  });

  it('discards a corrupt save and starts fresh rather than throwing', () => {
    storage.setItem('test-key', '{ this is not valid json');
    const data = manager.load();
    expect(data.version).toBe(SAVE.SAVE_VERSION);
  });

  it('repairs a save with a missing settings block', () => {
    storage.setItem('test-key', JSON.stringify({ version: SAVE.SAVE_VERSION }));
    const data = manager.load();
    expect(data.settings).toBeDefined();
    expect(data.settings.masterVolume).toBeGreaterThan(0);
    expect(data.progress).toEqual({});
  });

  it('import replaces the current document and flush persists it', () => {
    manager.load();
    const imported = manager.export();
    imported.playerName = 'Imported Player';

    const second = new SaveManager(new MemoryStorageAdapter(), 'other-key');
    second.load();
    expect(second.import(imported)).toBe(true);
    expect(second.current.playerName).toBe('Imported Player');
  });

  it('reset restores default data and clears progress', () => {
    manager.load();
    manager.updateProgress('level_1', { bestProgress: 1 });
    manager.reset();

    expect(manager.current.progress).toEqual({});
  });

  it('addStat accumulates across calls', () => {
    manager.load();
    manager.addStat('totalJumps', 5);
    manager.addStat('totalJumps', 3);
    expect(manager.current.stats.totalJumps).toBe(8);
  });
});
