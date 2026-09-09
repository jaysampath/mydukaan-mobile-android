import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '../env';

/**
 * The Supabase client.
 *
 * It is deliberately NOT exported. Nothing in this app calls `.from()` -- the
 * database tables live in the `app` schema, which is not exposed through
 * PostgREST, so a table call would fail anyway. Keeping the client private
 * means that fact is enforced by the module boundary rather than by discipline.
 *
 * Data access goes through `src/api/rpc.ts`. Auth goes through `auth` below.
 */
const client: SupabaseClient = createClient(env.supabaseUrl, env.supabasePublishableKey, {
  auth: {
    // Budget Android phones get killed aggressively in the background, so the
    // session has to survive a cold start without a network round trip.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No deep-link callback flow in a phone/OTP app.
    detectSessionInUrl: false,
  },
  global: {
    headers: { 'x-client-info': 'mydukaan-mobile' },
  },
});

export const auth = client.auth;

/**
 * Calls a Postgres function in the exposed `public` schema. This is the only
 * data path in the app.
 *
 * Errors are rethrown as RpcError so callers can branch on the Postgres
 * SQLSTATE rather than parsing message strings. 42501 is the one that matters
 * most: it covers "not your tenant", "wrong role", and "subscription lapsed".
 */
export class RpcError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
    readonly hint: string | undefined,
    readonly fn: string,
  ) {
    super(message);
    this.name = 'RpcError';
  }

  /** True when the server refused on authorization grounds, not bad input. */
  get isForbidden(): boolean {
    return this.code === '42501';
  }

  /** True when the refusal was specifically "your subscription lapsed". */
  get isReadOnly(): boolean {
    return this.hint === 'read_only';
  }
}

export async function callRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    throw new RpcError(error.message, error.code, error.hint ?? undefined, fn);
  }
  return data as T;
}

/** True when there is a signed-in user. */
export async function getUserId(): Promise<string | null> {
  const { data } = await client.auth.getUser();
  return data.user?.id ?? null;
}
