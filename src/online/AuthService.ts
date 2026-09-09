import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { EventBus } from '@/utils/EventBus';
import { logger } from '@/utils/Logger';

export interface AuthUser {
  id: string;
  email: string | null;
  /** Display name from the identity provider; falls back to the email or id. */
  name: string;
  avatarUrl: string | null;
}

export interface AuthEvents extends Record<string, unknown> {
  'signed-in': { user: AuthUser };
  'signed-out': Record<string, never>;
}

function toAuthUser(user: User): AuthUser {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const name =
    (typeof meta?.full_name === 'string' && meta.full_name) ||
    (typeof meta?.name === 'string' && meta.name) ||
    user.email ||
    user.id;
  const avatarUrl =
    (typeof meta?.avatar_url === 'string' && meta.avatar_url) ||
    (typeof meta?.picture === 'string' && meta.picture) ||
    null;

  return { id: user.id, email: user.email ?? null, name, avatarUrl };
}

/**
 * Account state, backed by Supabase Auth.
 *
 * Google is the only sign-in method wired up: the game asks Supabase to run
 * the OAuth handshake and only ever reads the session it hands back, so
 * NEON DASH never sees, stores, or validates a credential itself. `init()`
 * must run once at boot — it both restores an existing session (a page
 * reload otherwise looks signed-out for a moment) and consumes the
 * `access_token` Google's redirect leaves in the URL fragment after login.
 */
export class AuthService {
  readonly events = new EventBus<AuthEvents>();

  private user: AuthUser | null = null;
  private ready = false;

  get currentUser(): AuthUser | null {
    return this.user;
  }

  get isSignedIn(): boolean {
    return this.user !== null;
  }

  get isConfigured(): boolean {
    return isSupabaseConfigured();
  }

  /** Restores any existing session and starts listening for sign-in/out. Call once at boot. */
  async init(): Promise<void> {
    if (this.ready) return;
    this.ready = true;

    const client = getSupabaseClient();
    if (!client) return;

    const { data, error } = await client.auth.getSession();
    if (error) logger.warn('AuthService', 'Could not restore session', error);
    this.applySession(data.session ?? null, false);

    client.auth.onAuthStateChange((_event, session) => {
      this.applySession(session, true);
    });
  }

  private applySession(session: Session | null, notify: boolean): void {
    const next = session ? toAuthUser(session.user) : null;
    const wasSignedIn = this.user !== null;
    this.user = next;

    if (!notify) return;
    if (next && !wasSignedIn) this.events.emit('signed-in', { user: next });
    else if (!next && wasSignedIn) this.events.emit('signed-out', {});
  }

  /**
   * Starts the Google sign-in flow.
   *
   * This navigates the page away to Google's consent screen — there is no
   * result to return here. The redirect back is what `init()`'s
   * `onAuthStateChange` subscription picks up.
   */
  async signInWithGoogle(): Promise<{ ok: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) {
      return { ok: false, error: 'Online sign-in is not configured for this build.' };
    }

    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async signOut(): Promise<void> {
    const client = getSupabaseClient();
    if (!client) return;
    await client.auth.signOut();
  }
}

export const authService = new AuthService();
