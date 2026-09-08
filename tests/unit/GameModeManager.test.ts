import { describe, expect, it } from 'vitest';
import { GameModeManager } from '@/player/GameModeManager';
import { createPlayerState } from '@/player/PlayerState';
import { PHYSICS, SIM } from '@/config/constants';
import type { GameModeContext } from '@/gameModes/GameMode';

function makeContext(): GameModeContext {
  return {
    dt: SIM.FIXED_DT,
    runSpeed: 480,
    gravity: PHYSICS.GRAVITY,
    groundY: 600,
    ceilingY: -600,
    emit: () => {},
  };
}

describe('GameModeManager', () => {
  it('starts in the requested mode', () => {
    const manager = new GameModeManager('ship');
    expect(manager.currentId).toBe('ship');
  });

  it('falls back to cube for an unknown start mode', () => {
    // @ts-expect-error deliberately passing an invalid mode id
    const manager = new GameModeManager('not-a-mode');
    expect(manager.currentId).toBe('cube');
  });

  it('switches modes and runs enter/exit hooks exactly once', () => {
    const manager = new GameModeManager('cube');
    const state = createPlayerState({ x: 0, y: 0 });
    const context = makeContext();

    const changed = manager.switchTo('ship', state, context);
    expect(changed).toBe(true);
    expect(manager.currentId).toBe('ship');
    expect(state.mode).toBe('ship');
  });

  it('treats switching to the already-active mode as a no-op', () => {
    const manager = new GameModeManager('cube');
    const state = createPlayerState({ x: 0, y: 0 });
    const context = makeContext();

    const changed = manager.switchTo('cube', state, context);
    expect(changed).toBe(false);
  });

  it('resets modeData when entering a new mode', () => {
    const manager = new GameModeManager('robot');
    const state = createPlayerState({ x: 0, y: 0 });
    const context = makeContext();

    state.modeData.charge = 999;
    manager.switchTo('cube', state, context);
    manager.switchTo('robot', state, context);

    expect(state.modeData.charge ?? 0).toBe(0);
  });

  it('exposes all seven registered modes', () => {
    const manager = new GameModeManager('cube');
    const ids = manager.all.map((mode) => mode.id).sort();
    expect(ids).toEqual(['ball', 'cube', 'robot', 'ship', 'swing', 'ufo', 'wave']);
  });

  it('cube jumps upward when grounded and jump is held', () => {
    const manager = new GameModeManager('cube');
    const state = createPlayerState({ x: 0, y: 0 });
    state.grounded = true;
    const context = makeContext();

    manager.update(state, { pressed: true, held: true, released: false }, context);

    expect(state.velocity.y).toBeLessThan(0);
  });

  it('ball flips gravity on a grounded tap and does not flip mid-air', () => {
    const manager = new GameModeManager('ball');
    const state = createPlayerState({ x: 0, y: 0 });
    const context = makeContext();

    state.grounded = true;
    manager.update(state, { pressed: true, held: true, released: false }, context);
    expect(state.gravity).toBe('up');

    // Advance the cooldown so a second tap while airborne is not blocked by it.
    state.modeData.flipCooldown = 0;
    state.grounded = false;
    const gravityBefore = state.gravity;
    manager.update(state, { pressed: true, held: true, released: false }, context);
    expect(state.gravity).toBe(gravityBefore);
  });
});
