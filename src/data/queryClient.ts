import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';

import { API_CONTRACT_VERSION } from '../api/contract';
import { shouldRetry } from './errors';

/**
 * The cache.
 *
 * This is app caching, NOT sync. The difference is the whole of ADR 0003:
 *
 *   * Reads are cached and persisted, so a cold start on a cheap phone shows
 *     the order list immediately instead of a spinner, and a weak connection
 *     retries rather than failing. This is the part of the old local-database
 *     benefit that survives.
 *   * Writes are never queued. There is no outbox, no local mutation state and
 *     nothing to reconcile. A write that cannot reach the server fails, says so,
 *     and leaves the form filled in so it can be tried again.
 *
 * The second point is deliberate and is worth defending. react-query's default
 * `networkMode: 'online'` PAUSES a mutation while offline and fires it on
 * reconnect. That is lovely for a to-do app and wrong here: a `record_payment`
 * that silently fires twenty minutes later, after the user has walked away
 * believing it failed, is worse than a refusal. Financial mutations set
 * `networkMode: 'always'` so they fail fast and honestly -- see
 * src/data/mutations.ts.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A considered refusal is final. Only transport failures are retried.
        retry: (attempt, error) => shouldRetry(error, attempt),
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        // Long enough that moving between tabs does not refetch everything on a
        // metered connection; short enough that a list is never visibly stale.
        // Money queries override this to 0 individually.
        staleTime: 30_000,
        gcTime: 24 * 60 * 60 * 1000,
        // The phone is the only device; a window focus event means the user
        // came back to the app, which is a good moment to refresh.
        refetchOnReconnect: true,
      },
      mutations: {
        // Never blind-retry a write. Every operation RPC is idempotent on a
        // caller-minted id, so a retry is SAFE -- but it should be the user's
        // decision, because they are the one who knows whether they still want
        // it to happen.
        retry: false,
      },
    },
  });
}

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'mydukaan-cache',
  throttleTime: 2000,
});

/**
 * Bumping the API contract wipes the cache.
 *
 * Without this, a persisted payload written by the previous contract would be
 * handed to code that expects the new shape, and the failure would be a
 * `undefined` rupee figure rather than an error.
 */
export const cacheBuster = `contract-${API_CONTRACT_VERSION}`;

/**
 * Clears everything on sign-out.
 *
 * THE most important function in this file. Without it, signing out and signing
 * in as a different business leaves the previous tenant's customers, orders and
 * khata in AsyncStorage, and the new user sees them until each query refetches.
 * On a shared phone in a shop that is a cross-tenant data leak, and it is one
 * the server cannot prevent -- the data is already on the device.
 *
 * The old WatermelonDB code had the identical hazard and never handled it: the
 * Phase 0 screen's sign-out called auth.signOut() and left the local database
 * exactly where it was.
 */
export async function clearCache(client: QueryClient): Promise<void> {
  client.cancelQueries();
  client.clear();
  await persister.removeClient();
}
