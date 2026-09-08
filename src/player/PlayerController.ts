import Phaser from 'phaser';
import type { InputState } from '@/types/PlayerTypes';

/**
 * Turns keyboard, mouse and touch into a single, simulation-friendly input.
 *
 * Input arrives on browser events at whatever rate the device produces them,
 * while the simulation runs at a fixed rate that may tick several times per
 * frame. The controller therefore *latches* presses and releases: a tap that
 * happens between ticks is still seen by exactly one tick, and never by two.
 */
export class PlayerController {
  private readonly scene: Phaser.Scene;

  /** How many input sources are currently down. Multi-touch counts once each. */
  private downCount = 0;

  /** Set by an event, consumed by the next simulation tick. */
  private pendingPress = false;
  private pendingRelease = false;

  private readonly state: InputState = { pressed: false, held: false, released: false };
  private enabled = true;
  private readonly detach: (() => void)[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.attach();
  }

  private attach(): void {
    const keyboard = this.scene.input.keyboard;

    if (keyboard) {
      // Space is the primary key; the arrows and W are accepted because players
      // arrive with different habits and none of them cost anything.
      const keys = ['SPACE', 'UP', 'W', 'ENTER'];
      for (const name of keys) {
        const key = keyboard.addKey(name, true, false);
        const onDown = (): void => this.press();
        const onUp = (): void => this.release();
        key.on('down', onDown);
        key.on('up', onUp);
        this.detach.push(() => {
          key.off('down', onDown);
          key.off('up', onUp);
          keyboard.removeKey(key, true);
        });
      }
    }

    const pointerDown = (): void => this.press();
    const pointerUp = (): void => this.release();
    this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, pointerDown);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP, pointerUp);
    // A pointer that leaves the canvas never sends an "up", which would leave the
    // player holding forever.
    this.scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, pointerUp);
    this.detach.push(() => {
      this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, pointerDown);
      this.scene.input.off(Phaser.Input.Events.POINTER_UP, pointerUp);
      this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, pointerUp);
    });

    // Losing focus mid-hold is the other way to get stuck holding.
    const onBlur = (): void => this.releaseAll();
    this.scene.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    this.detach.push(() => this.scene.game.events.off(Phaser.Core.Events.BLUR, onBlur));
  }

  private press(): void {
    if (!this.enabled) return;
    this.downCount += 1;
    // Only the transition from "nothing down" to "something down" is a press.
    if (this.downCount === 1) this.pendingPress = true;
  }

  private release(): void {
    if (!this.enabled) return;
    this.downCount = Math.max(0, this.downCount - 1);
    if (this.downCount === 0) this.pendingRelease = true;
  }

  private releaseAll(): void {
    if (this.downCount > 0) this.pendingRelease = true;
    this.downCount = 0;
  }

  /**
   * Produces the input for one simulation tick.
   *
   * A press and a release that both arrived since the last tick are reported on
   * the same tick, held included, so a very short tap is never swallowed. The
   * pending flags are cleared here, which is why this must be called exactly
   * once per tick.
   */
  sample(): InputState {
    const pressed = this.pendingPress;
    const released = this.pendingRelease;

    this.state.pressed = pressed;
    this.state.released = released;
    // A tap shorter than one tick still counts as held for that tick, otherwise
    // modes that require `held` on the press tick would ignore it.
    this.state.held = this.downCount > 0 || pressed;

    this.pendingPress = false;
    this.pendingRelease = false;

    return this.state;
  }

  /** A read-only view without consuming the pending flags. */
  peek(): Readonly<InputState> {
    return this.state;
  }

  /** True while any source is down; used by the UI, not by the simulation. */
  get isDown(): boolean {
    return this.downCount > 0;
  }

  /** Stops accepting input, e.g. while a level-complete banner is showing. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.releaseAll();
  }

  /** Clears all latched state. Call when respawning. */
  reset(): void {
    this.downCount = 0;
    this.pendingPress = false;
    this.pendingRelease = false;
    this.state.pressed = false;
    this.state.held = false;
    this.state.released = false;
  }

  destroy(): void {
    for (const off of this.detach) off();
    this.detach.length = 0;
  }
}
