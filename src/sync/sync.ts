import { synchronize } from '@nozbe/watermelondb/sync';
import type { SyncDatabaseChangeSet } from '@nozbe/watermelondb/sync';
import NetInfo from '@react-native-community/netinfo';

import { database } from '../db';
import { syncPull, syncPush, type SyncChanges } from '../api/rpc';
import { RpcError } from '../api/supabase';

/**
 * The whole sync layer.
 *
 * Reads and writes both go through two Postgres functions. There is no direct
 * table access, so tenant scope and write validation are enforced in one place
 * on the server rather than being re-derived on every device.
 */

export type SyncState =
  | { status: 'idle'; lastSyncedAt: Date | null }
  | { status: 'syncing' }
  | { status: 'error'; error: string; lastSyncedAt: Date | null };

let inFlight: Promise<void> | null = null;
let lastSyncedAt: Date | null = null;

export function getLastSyncedAt(): Date | null {
  return lastSyncedAt;
}

export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  // isInternetReachable is null while the check is still pending; treat that as
  // "probably online" and let the request itself decide. Refusing to try is
  // worse than trying and failing, because a failure is retried anyway.
  return Boolean(state.isConnected) && state.isInternetReachable !== false;
}

/**
 * Runs one sync cycle. Safe to call from anywhere, as often as you like:
 * concurrent calls share the in-flight promise rather than racing, which
 * matters because sync is triggered from several places (app foreground,
 * connectivity regained, manual pull-to-refresh, after a write).
 */
export function sync(): Promise<void> {
  if (inFlight) return inFlight;

  inFlight = runSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(): Promise<void> {
  await synchronize({
    database,

    pullChanges: async ({ lastPulledAt }) => {
      const result = await syncPull(lastPulledAt ?? null);
      return {
        changes: result.changes as unknown as SyncDatabaseChangeSet,
        timestamp: result.timestamp,
      };
    },

    pushChanges: async ({ changes, lastPulledAt }) => {
      // Strip tables with nothing to say, so the request body stays small on a
      // 2G connection in a market.
      const payload: SyncChanges = {};
      for (const [table, set] of Object.entries(changes)) {
        const c = set as { created: unknown[]; updated: unknown[]; deleted: string[] };
        if (c.created.length || c.updated.length || c.deleted.length) {
          payload[table] = c;
        }
      }
      if (Object.keys(payload).length === 0) return;

      await syncPush(payload, lastPulledAt ?? null);
    },

    // The server puts every changed row in `updated` and never in `created`.
    // Deciding server-side which rows are "new to this device" is not possible
    // without tracking per-device state, and getting it wrong produces
    // "Diverged from server" errors that strand a device permanently. Letting
    // the client treat an unknown id as a create is both simpler and safe.
    sendCreatedAsUpdated: true,

    // Records that changed locally while a pull was in flight are kept and
    // pushed on the next cycle rather than being overwritten by the server
    // copy. For our data model this is nearly always moot -- the ledgers are
    // insert-only, so there is no field for two devices to disagree about.
    conflictResolver: (_table, local, remote, resolved) => resolved,
  });

  lastSyncedAt = new Date();
}

/**
 * Syncs, but swallows the "you are offline" case.
 *
 * Offline is the normal state for this app, not an error worth showing anyone.
 * A genuine server refusal -- wrong tenant, wrong role, lapsed subscription --
 * is rethrown, because those need to reach the user.
 */
export async function syncIfOnline(): Promise<boolean> {
  if (!(await isOnline())) return false;

  try {
    await sync();
    return true;
  } catch (error) {
    if (error instanceof RpcError && error.isForbidden) throw error;

    // Anything else is a transport problem. The next cycle picks it up; the
    // local database already has the user's work.
    console.warn('[sync] deferred', error);
    return false;
  }
}

/**
 * Syncs whenever the device regains connectivity. Returns an unsubscribe.
 * Call once, when the session starts.
 */
export function startAutoSync(onStateChange?: (s: SyncState) => void): () => void {
  const notify = (s: SyncState) => onStateChange?.(s);

  const attempt = async () => {
    notify({ status: 'syncing' });
    try {
      await syncIfOnline();
      notify({ status: 'idle', lastSyncedAt });
    } catch (error) {
      notify({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        lastSyncedAt,
      });
    }
  };

  void attempt();

  const unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      void attempt();
    }
  });

  return unsubscribe;
}
