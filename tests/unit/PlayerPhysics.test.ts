import { describe, expect, it } from 'vitest';
import { PHYSICS, SIM } from '@/config/constants';
import { CollisionWorld } from '@/player/CollisionWorld';
import { PlayerPhysics } from '@/player/PlayerPhysics';
import { createPlayerState } from '@/player/PlayerState';
import { GameModeManager } from '@/player/GameModeManager';
import { Block } from '@/obstacles/Block';
import { Spike } from '@/obstacles/Spike';
import type { GameModeContext } from '@/gameModes/GameMode';
import type { InputState } from '@/types/PlayerTypes';

function makeContext(overrides: Partial<GameModeContext> = {}): GameModeContext {
  return {
    dt: SIM.FIXED_DT,
    runSpeed: 480,
    gravity: PHYSICS.GRAVITY,
    groundY: 600,
    ceilingY: -600,
    emit: () => {},
    ...overrides,
  };
}

const noInput: InputState = { pressed: false, held: false, released: false };

describe('PlayerPhysics', () => {
  it('lands the player on the floor and marks them grounded', () => {
    const world = new CollisionWorld();
    const physics = new PlayerPhysics(world);
    const state = createPlayerState({ x: 0, y: 590 });
    state.lifecycle = 'running';

    const context = makeContext();
    // Run enough ticks for gravity to bring the player down to the floor.
    let result;
    for (let i = 0; i < 30; i += 1) {
      result = physics.step(state, context);
      if (state.grounded) break;
    }

    expect(state.grounded).toBe(true);
    expect(state.position.y).toBeLessThanOrEqual(context.groundY);
    expect(result?.died).toBe(false);
  });

  it('kills the player who overlaps a lethal spike', () => {
    const world = new CollisionWorld();
    const spike = new Spike({
      id: 'spike_1',
      type: 'spike',
      x: 480,
      y: 600,
      rotation: 0,
      scale: 1,
    });
    world.add(spike);

    const physics = new PlayerPhysics(world);
    const state = createPlayerState({ x: 480, y: 600 });
    state.lifecycle = 'running';
    state.grounded = true;

    const context = makeContext();
    const result = physics.step(state, context);

    expect(result.died).toBe(true);
    expect(result.killer).toBe(spike);
  });

  it('does not kill the player who is clear of a spike', () => {
    const world = new CollisionWorld();
    world.add(new Spike({ id: 'spike_1', type: 'spike', x: 5000, y: 600, rotation: 0, scale: 1 }));

    const physics = new PlayerPhysics(world);
    const state = createPlayerState({ x: 0, y: 566 });
    state.lifecycle = 'running';

    const context = makeContext();
    const result = physics.step(state, context);

    expect(result.died).toBe(false);
  });

  it('stops the player landing on top of a solid block', () => {
    const world = new CollisionWorld();
    // A block whose top sits well above the ground line.
    world.add(
      new Block({
        id: 'block_1',
        type: 'block',
        x: 500,
        y: 500,
        rotation: 0,
        scale: 1,
        props: { width: 4, height: 1 },
      }),
    );

    const physics = new PlayerPhysics(world);
    const modes = new GameModeManager('cube');
    const state = createPlayerState({ x: 500, y: 400 });
    state.lifecycle = 'running';
    state.velocity.x = 0;

    const context = makeContext({ runSpeed: 0 });

    let result;
    for (let i = 0; i < 60; i += 1) {
      // PlayerPhysics integrates whatever velocity the active mode set; it does
      // not apply gravity itself, so the mode must run first, as it does in
      // Player.tick().
      modes.update(state, noInput, context);
      result = physics.step(state, context);
      if (state.grounded) break;
    }

    expect(state.grounded).toBe(true);
    expect(result?.died).toBe(false);
    // Resting on top of the block means well above the floor's own y.
    expect(state.position.y).toBeLessThan(context.groundY);
  });

  it('produces identical results for the same inputs regardless of caller order', () => {
    // Determinism check: running the same scripted input twice from the same
    // start must produce the same final position, which is what the online
    // leaderboard's server-side replay depends on.
    const runOnce = (): { x: number; y: number } => {
      const world = new CollisionWorld();
      const physics = new PlayerPhysics(world);
      const modes = new GameModeManager('cube');
      const state = createPlayerState({ x: 0, y: 566 });
      state.lifecycle = 'running';
      const context = makeContext();

      for (let tick = 0; tick < 120; tick += 1) {
        const input: InputState =
          tick === 10 ? { pressed: true, held: true, released: false } : noInput;
        modes.update(state, input, context);
        physics.step(state, context);
      }
      return { x: state.position.x, y: state.position.y };
    };

    const first = runOnce();
    const second = runOnce();
    expect(first).toEqual(second);
  });
});
