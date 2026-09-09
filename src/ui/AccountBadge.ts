import Phaser from 'phaser';
import { PALETTE } from '@/config/constants';
import { authService } from '@/online/AuthService';
import { Button } from './Button';
import { FONT_STACK, TYPE, UI_COLORS, hex } from './Theme';

export interface AccountBadgeOptions {
  /** Called when a sign-in attempt fails to start (e.g. no Supabase project configured). */
  onError?: (message: string) => void;
}

/**
 * A sign-in/sign-out control, usable from any scene.
 *
 * `x, y` is the control's *right* edge, growing leftward — the natural anchor
 * for a corner badge, and the one contract that stays correct whichever of
 * the two very differently-sized shapes below is showing.
 *
 * Rebuilds itself whenever the account's sign-in state changes. That has to
 * be event-driven rather than read once at construction time: Google's OAuth
 * redirect can land back on whichever scene happens to be active, not only
 * the one the player clicked "sign in" from.
 */
export class AccountBadge extends Phaser.GameObjects.Container {
  private readonly onError?: (message: string) => void;
  private control?: Phaser.GameObjects.GameObject & { destroy: () => void };
  private readonly unsubscribe: () => void;

  constructor(scene: Phaser.Scene, x: number, y: number, options: AccountBadgeOptions = {}) {
    super(scene, x, y);
    this.onError = options.onError;

    const rebuild = (): void => this.rebuild();
    authService.events.on('signed-in', rebuild);
    authService.events.on('signed-out', rebuild);
    this.unsubscribe = () => {
      authService.events.off('signed-in', rebuild);
      authService.events.off('signed-out', rebuild);
    };
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.unsubscribe());

    this.rebuild();
    scene.add.existing(this);
  }

  private rebuild(): void {
    this.control?.destroy();
    const user = authService.currentUser;

    if (!user) {
      const width = 220;
      const button = new Button(this.scene, -width / 2, 0, {
        label: authService.isConfigured ? 'SIGN IN WITH GOOGLE' : 'SIGN-IN UNAVAILABLE',
        width,
        height: 38,
        color: PALETTE.CYAN,
        variant: 'ghost',
        fontSize: 11,
        enabled: authService.isConfigured,
        onClick: () => void this.signIn(),
      });
      this.add(button);
      this.control = button;
      return;
    }

    const buttonWidth = 120;
    const gap = 14;
    const signOut = new Button(this.scene, -buttonWidth / 2, 0, {
      label: 'SIGN OUT',
      width: buttonWidth,
      height: 34,
      color: PALETTE.GREY,
      fontSize: 11,
      onClick: () => void this.signOut(),
    });
    const name = this.scene.add
      .text(-buttonWidth - gap, 0, user.name, {
        fontFamily: FONT_STACK,
        fontSize: `${TYPE.caption.size}px`,
        fontStyle: '700',
        color: hex(UI_COLORS.text),
      })
      .setOrigin(1, 0.5);

    const container = this.scene.add.container(0, 0, [name, signOut]);
    this.add(container);
    this.control = container;
  }

  private async signIn(): Promise<void> {
    const result = await authService.signInWithGoogle();
    // A successful call navigates the page away to Google; there is nothing
    // left to update here, only the failure path returns to code.
    if (!result.ok) this.onError?.(result.error ?? 'Sign-in failed');
  }

  private async signOut(): Promise<void> {
    await authService.signOut();
  }
}
