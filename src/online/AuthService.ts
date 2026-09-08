import type { ApiClient, ApiResult } from './ApiClient';
import { apiClient } from './ApiClient';
import { sanitizeText } from '@/utils/ValidationUtils';

export interface AuthUser {
  id: string;
  username: string;
  createdAt: string;
}

export interface AuthSession {
  user: AuthUser;
  token: string;
  /** Unix seconds at which the token stops being accepted. */
  expiresAt: number;
}

/**
 * Account handling for the online features.
 *
 * The client's role is narrow on purpose: collect credentials, hand them to the
 * server, and hold the returned token in memory. It never hashes a password
 * itself, never decides whether a session is valid, and never stores a token
 * where another script could read it. Those are all server responsibilities,
 * and a client that takes them on is a client that can be lied to.
 */
export class AuthService {
  private readonly api: ApiClient;
  private session: AuthSession | null = null;

  constructor(api: ApiClient = apiClient) {
    this.api = api;
  }

  get currentUser(): AuthUser | null {
    return this.session?.user ?? null;
  }

  get isSignedIn(): boolean {
    if (!this.session) return false;
    // A token past its expiry is not worth sending; treat it as signed out.
    return this.session.expiresAt * 1000 > Date.now();
  }

  async register(username: string, password: string): Promise<ApiResult<AuthSession>> {
    const clean = sanitizeText(username, 24);
    if (clean.length < 3) {
      return {
        ok: false,
        error: { status: 400, message: 'Username must be at least 3 characters', transient: false },
      };
    }
    if (password.length < 8) {
      return {
        ok: false,
        error: { status: 400, message: 'Password must be at least 8 characters', transient: false },
      };
    }

    const result = await this.api.post<AuthSession>('/auth/register', {
      username: clean,
      password,
    });
    if (result.ok) this.adopt(result.data);
    return result;
  }

  async login(username: string, password: string): Promise<ApiResult<AuthSession>> {
    const result = await this.api.post<AuthSession>('/auth/login', {
      username: sanitizeText(username, 24),
      password,
    });
    if (result.ok) this.adopt(result.data);
    return result;
  }

  /** Tells the server to revoke the token, then forgets it locally either way. */
  async logout(): Promise<void> {
    if (this.session) {
      await this.api.post('/auth/logout', {});
    }
    this.session = null;
    this.api.setToken(null);
  }

  /** Exchanges a nearly expired token for a fresh one. */
  async refresh(): Promise<boolean> {
    if (!this.session) return false;
    const result = await this.api.post<AuthSession>('/auth/refresh', {});
    if (!result.ok) {
      this.session = null;
      this.api.setToken(null);
      return false;
    }
    this.adopt(result.data);
    return true;
  }

  private adopt(session: AuthSession): void {
    this.session = session;
    this.api.setToken(session.token);
  }
}

export const authService = new AuthService();
