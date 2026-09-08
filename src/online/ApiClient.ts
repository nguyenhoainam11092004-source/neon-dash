import { logger } from '@/utils/Logger';
import { safeJsonParse } from '@/utils/ValidationUtils';

/** A request that failed, in a shape callers can branch on. */
export interface ApiError {
  status: number;
  message: string;
  /** True for network failures and timeouts, where a retry may succeed. */
  transient: boolean;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface ApiClientOptions {
  /** Base URL of the API. Empty means the backend is not configured. */
  baseUrl?: string;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
  /** Retries for transient failures. */
  retries?: number;
}

/**
 * The single place the game talks to a server.
 *
 * No backend is deployed yet, and this deliberately does not pretend
 * otherwise: with no base URL configured every call returns a clear
 * "not configured" error rather than hanging or throwing. That keeps the
 * online features honest — the UI can be built and tested against real
 * failure paths today, and pointing at a live API later is a configuration
 * change rather than a rewrite.
 *
 * Auth tokens are held in memory only. Persisting a bearer token to
 * localStorage would leave it readable by any script that manages to run on
 * the page, and a rhythm game has no need for a session that survives a reload.
 */
export class ApiClient {
  private baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private token: string | null = null;

  constructor(options: ApiClientOptions = {}) {
    // Read from the build environment; never hard-code an endpoint or a key.
    this.baseUrl = (options.baseUrl ?? import.meta.env?.VITE_API_BASE_URL ?? '').replace(
      /\/+$/,
      '',
    );
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.retries = options.retries ?? 2;
  }

  /** True when a backend has been configured for this build. */
  get isConfigured(): boolean {
    return this.baseUrl.length > 0;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  /** Stores the bearer token for subsequent requests. */
  setToken(token: string | null): void {
    this.token = token;
  }

  get isAuthenticated(): boolean {
    return this.token !== null;
  }

  get<T>(path: string, query?: Record<string, string | number | boolean>): Promise<ApiResult<T>> {
    const search = query
      ? `?${new URLSearchParams(
          Object.entries(query).map(([key, value]) => [key, String(value)]),
        ).toString()}`
      : '';
    return this.request<T>('GET', `${path}${search}`);
  }

  post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
    return this.request<T>('POST', path, body);
  }

  put<T>(path: string, body: unknown): Promise<ApiResult<T>> {
    return this.request<T>('PUT', path, body);
  }

  delete<T>(path: string): Promise<ApiResult<T>> {
    return this.request<T>('DELETE', path);
  }

  /**
   * Performs one request, retrying transient failures with a growing delay.
   *
   * Only network-level failures and 5xx responses are retried. Retrying a 4xx
   * would just repeat a request the server has already refused on its merits.
   */
  private async request<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
    if (!this.isConfigured) {
      return {
        ok: false,
        error: {
          status: 0,
          message: 'No backend configured. Set VITE_API_BASE_URL to enable online features.',
          transient: false,
        },
      };
    }

    let lastError: ApiError = { status: 0, message: 'Request never ran', transient: true };

    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 250 * Math.pow(2, attempt - 1)));
      }

      const result = await this.attempt<T>(method, path, body);
      if (result.ok) return result;

      lastError = result.error;
      if (!result.error.transient) return result;
    }

    return { ok: false, error: lastError };
  }

  private async attempt<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (this.token) headers.Authorization = `Bearer ${this.token}`;

      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        // The API is a separate origin; never send ambient cookies with it.
        credentials: 'omit',
        mode: 'cors',
      });

      const text = await response.text();

      if (!response.ok) {
        // Prefer the server's own message when it sends one.
        const parsed = safeJsonParse<{ message?: string }>(text);
        return {
          ok: false,
          error: {
            status: response.status,
            message:
              (parsed.ok ? parsed.value?.message : undefined) ??
              `HTTP ${response.status} ${response.statusText}`,
            transient: response.status >= 500 || response.status === 429,
          },
        };
      }

      if (text.length === 0) return { ok: true, data: undefined as T };

      const parsed = safeJsonParse<T>(text);
      if (!parsed.ok) {
        return {
          ok: false,
          error: {
            status: response.status,
            message: `Malformed response: ${parsed.error}`,
            transient: false,
          },
        };
      }

      return { ok: true, data: parsed.value };
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      const message = aborted
        ? `Request timed out after ${this.timeoutMs} ms`
        : error instanceof Error
          ? error.message
          : 'Network request failed';

      logger.debug('ApiClient', `${method} ${path} failed: ${message}`);
      return { ok: false, error: { status: 0, message, transient: true } };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const apiClient = new ApiClient();
