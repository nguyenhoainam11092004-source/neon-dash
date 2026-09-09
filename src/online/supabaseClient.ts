import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Lazily-created, shared Supabase client.
 *
 * `undefined` means "not attempted yet"; `null` means "attempted, and this
 * build has no project configured". Distinguishing the two means the
 * environment variables are only read once, while still allowing a build
 * with no `VITE_SUPABASE_*` set to run the game normally instead of crashing
 * on startup — the same "not configured" convention `ApiClient` uses, so
 * Google sign-in can be built and tested today and pointed at a real project
 * later without a code change.
 */
let client: SupabaseClient | null | undefined;

/** True once a Supabase project has been configured for this build. */
export function isSupabaseConfigured(): boolean {
  return getSupabaseClient() !== null;
}

export function getSupabaseClient(): SupabaseClient | null {
  if (client !== undefined) return client;

  const url = import.meta.env?.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

  if (!url || !key) {
    client = null;
    return client;
  }

  client = createClient(url, key, {
    auth: {
      // Keeps a signed-in player across a page reload — unlike the bearer
      // tokens in ApiClient, this is Supabase's own session token, scoped
      // only to what its Row Level Security policies allow, so persisting it
      // does not carry the same blanket-access risk a raw API token would.
      persistSession: true,
      autoRefreshToken: true,
      // Lets the client pick the session up from the URL fragment Google
      // redirects back with, without a dedicated callback route.
      detectSessionInUrl: true,
    },
  });
  return client;
}
