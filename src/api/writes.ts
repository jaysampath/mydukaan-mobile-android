import * as Crypto from 'expo-crypto';

import * as rpc from './rpc';
import { RpcError } from './supabase';
import { offlineWritesEnabled } from '../env';
import { isOnline, sync } from '../sync/sync';

/**
 * Every write the app can perform.
 *
 * In pull_only mode (the default -- see docs/adr/0002-sync-mode-flag.md) this
 * is the ONLY write path. Screens call these; they must never call
 * `database.write()` directly, because local rows would have no way to reach
 * the server and `sync()` would refuse the cycle.
 *
 * Each function does three things:
 *
 *   1. Mints the record's UUID on the device. Every operation RPC takes the id
 *      from the caller, so a phone that loses signal mid-call can retry the
 *      exact same call and the server treats it as the same operation rather
 *      than performing it twice.
 *   2. Calls the RPC, which enforces role, tenant and business invariants.
 *   3. Refreshes the local read cache, so the UI updates from one source.
 *
 * The returned id is the caller's to keep: hold it and retry with it if the
 * call fails, rather than generating a new one.
 */

/**
 * Thrown when a write is attempted with no connection while offline writes are
 * off.
 *
 * This is a real, expected state for this app -- markets have no signal -- so
 * it is a typed error the UI is expected to handle with a plain message, not a
 * crash and not a silent no-op that looks like success.
 */
export class OfflineWriteBlockedError extends Error {
  constructor(readonly operation: string) {
    super(`"${operation}" needs a connection. Your saved data is still available to read.`);
    this.name = 'OfflineWriteBlockedError';
  }
}

export function newId(): string {
  return Crypto.randomUUID();
}

/**
 * Runs a write, then refreshes the read cache.
 *
 * The refresh is deliberately not awaited as part of the result: the write has
 * already committed on the server by then, and making the caller wait for a
 * full pull on a 2G connection would make every save feel broken. A failed
 * refresh is not a failed write -- the next sync cycle picks it up.
 */
async function write<T>(operation: string, run: () => Promise<T>): Promise<T> {
  if (!offlineWritesEnabled && !(await isOnline())) {
    throw new OfflineWriteBlockedError(operation);
  }

  const result = await run();

  void sync().catch((error) => {
    console.warn(`[writes] ${operation} committed, refresh deferred`, error);
  });

  return result;
}

/** True when the server refused because the subscription lapsed. */
export function isReadOnlyRefusal(error: unknown): boolean {
  return error instanceof RpcError && error.isReadOnly;
}

// --- Settings ---------------------------------------------------------------

export function updateBusinessSettings(settings: rpc.BusinessSettings): Promise<unknown> {
  return write('Update settings', () => rpc.updateBusinessSettings(settings));
}

// --- Inventory & packing ----------------------------------------------------

export function receivePurchase(purchaseId: string): Promise<unknown> {
  return write('Receive stock', () => rpc.receivePurchase(purchaseId));
}

export function runConversion(packingRunId: string): Promise<unknown> {
  return write('Run packing', () => rpc.runConversion(packingRunId));
}

// --- Orders -----------------------------------------------------------------

export async function createOrder(args: {
  orderId?: string;
  customerId: string;
  items: rpc.OrderItemInput[];
  notes?: string;
}): Promise<{ orderId: string; orderNo: number; totalAmount: number }> {
  const orderId = args.orderId ?? newId();
  const result = await write('Create order', () =>
    rpc.createOrder(orderId, args.customerId, args.items, args.notes),
  );
  return {
    orderId: result.order_id,
    orderNo: result.order_no,
    totalAmount: result.total_amount,
  };
}

/**
 * DISPATCH -- the moment stock actually leaves.
 *
 * Idempotent on the server: calling twice deducts once and reports
 * `alreadyDispatched` the second time, which is what a retry after a dropped
 * connection needs.
 */
export async function dispatchOrder(orderId: string): Promise<{ alreadyDispatched: boolean }> {
  const result = await write('Dispatch order', () => rpc.dispatchOrder(orderId));
  return { alreadyDispatched: result.already_dispatched };
}

export function setOrderStatus(
  orderId: string,
  status: rpc.SettableOrderStatus,
): Promise<unknown> {
  return write('Update order', () => rpc.setOrderStatus(orderId, status));
}

// --- Cash -------------------------------------------------------------------

export async function recordPayment(args: {
  paymentId?: string;
  customerId: string;
  amount: number;
  orderId?: string | null;
  paidOn?: string | null;
  note?: string | null;
}): Promise<{ paymentId: string; customerOutstanding: number }> {
  const paymentId = args.paymentId ?? newId();
  const result = await write('Record payment', () =>
    rpc.recordPayment({ ...args, paymentId }),
  );
  return { paymentId, customerOutstanding: result.customer_outstanding };
}
