import { describe, expect, it } from 'vitest';

import { RpcError } from '../api/rpc-error';
import { isReadOnlyRefusal, mapRpcError, shouldRetry } from './errors';
import { keys } from './keys';
import { invalidatedBy } from './invalidate';
import { contractPermitsUse } from '../api/contract';

const rpcError = (code: string, hint?: string, message = 'server said no') =>
  new RpcError(message, code, hint, 'some_fn');

describe('shouldRetry', () => {
  it('does not retry an authorization refusal', () => {
    // Retrying a 42501 turns "no permission" into a four-second hang.
    expect(shouldRetry(rpcError('42501'))).toBe(false);
  });

  it('does not retry a read-only refusal', () => {
    expect(shouldRetry(rpcError('42501', 'read_only'))).toBe(false);
  });

  it('does not retry validation, rule or not-found', () => {
    expect(shouldRetry(rpcError('22023'))).toBe(false);
    expect(shouldRetry(rpcError('23514'))).toBe(false);
    expect(shouldRetry(rpcError('P0002'))).toBe(false);
    expect(shouldRetry(rpcError('23505'))).toBe(false);
  });

  it('does retry a transport failure', () => {
    expect(shouldRetry(new TypeError('Network request failed'))).toBe(true);
  });

  it('retries an unrecognised server code, which might be transient', () => {
    expect(shouldRetry(rpcError('57014'))).toBe(true);
  });

  it('stops at the attempt limit', () => {
    expect(shouldRetry(new TypeError('Network request failed'), 3, 3)).toBe(false);
    expect(shouldRetry(new TypeError('Network request failed'), 2, 3)).toBe(true);
  });
});

describe('mapRpcError', () => {
  it('says the data is still there when the subscription lapsed', () => {
    // The product promise: read-only, never a data lock. The copy has to say so.
    const e = mapRpcError(rpcError('42501', 'read_only'));
    expect(e.kind).toBe('read_only');
    expect(e.retryable).toBe(false);
    expect(e.message).toMatch(/still here/i);
  });

  it('separates a role refusal from a lapsed subscription', () => {
    expect(mapRpcError(rpcError('42501')).kind).toBe('forbidden');
  });

  it('passes a business-rule message through verbatim', () => {
    // The server knows which SKU was short and by how much; this layer does not.
    const msg = 'not enough stock of Turmeric 500g: have 2, order needs 4';
    expect(mapRpcError(rpcError('23514', undefined, msg)).message).toBe(msg);
  });

  it('keeps the hint so a screen can branch on seat_limit or last_owner', () => {
    expect(mapRpcError(rpcError('23514', 'seat_limit')).hint).toBe('seat_limit');
    expect(mapRpcError(rpcError('23514', 'last_owner')).hint).toBe('last_owner');
  });

  it('passes a validation message through verbatim', () => {
    const msg = 'this item already has an opening balance; record an ADJUSTMENT instead';
    expect(mapRpcError(rpcError('22023', 'use_adjustment', msg)).message).toBe(msg);
  });

  it('recognises not-found', () => {
    expect(mapRpcError(rpcError('P0002')).kind).toBe('not_found');
  });

  it('recognises being offline from a transport error', () => {
    const e = mapRpcError(new TypeError('Network request failed'));
    expect(e.kind).toBe('offline');
    expect(e.retryable).toBe(true);
    expect(e.message).toMatch(/no connection/i);
  });

  it('falls back without leaking an internal message', () => {
    expect(mapRpcError(new Error('TypeError: undefined is not an object')).kind).toBe('unknown');
  });
});

describe('isReadOnlyRefusal', () => {
  it('is true only for the lapsed-subscription hint', () => {
    expect(isReadOnlyRefusal(rpcError('42501', 'read_only'))).toBe(true);
    expect(isReadOnlyRefusal(rpcError('42501'))).toBe(false);
    expect(isReadOnlyRefusal(new Error('nope'))).toBe(false);
  });
});

describe('contractPermitsUse', () => {
  it('permits a server that predates the contract', () => {
    expect(contractPermitsUse(undefined, 1)).toBe(true);
  });

  it('permits an equal or older requirement', () => {
    expect(contractPermitsUse(1, 1)).toBe(true);
    expect(contractPermitsUse(1, 2)).toBe(true);
  });

  it('refuses a build the server has moved past', () => {
    expect(contractPermitsUse(2, 1)).toBe(false);
  });
});

describe('query keys', () => {
  it('nests lists under a prefix so a prefix invalidation catches them', () => {
    expect(keys.orders.list(['PLACED']).slice(0, 1)).toEqual(keys.orders.all);
    expect(keys.customers.ledger('c1').slice(0, 1)).toEqual(keys.customers.all);
  });

  it('distinguishes different filters', () => {
    expect(keys.orders.list(['PLACED'])).not.toEqual(keys.orders.list(['PACKED']));
    expect(keys.customers.list('ravi')).not.toEqual(keys.customers.list('x'));
  });

  it('treats null and empty search as the same cache entry', () => {
    expect(keys.customers.list(null)).toEqual(keys.customers.list(''));
  });
});

describe('invalidatedBy', () => {
  const flat = (op: Parameters<typeof invalidatedBy>[0], ids = {}) =>
    invalidatedBy(op, ids).map((k) => k.join('/'));

  it('moves stock, the order and the day summary on dispatch', () => {
    // Dispatch writes SALE_OUT rows, so stock is derived differently afterwards.
    const r = flat('dispatch_order', { orderId: 'o1' });
    expect(r).toContain('orders');
    expect(r).toContain('orders/detail/o1');
    expect(r).toContain('stock');
    expect(r).toContain('daySummary/today');
  });

  it('moves the khata as well as the order when cash is recorded', () => {
    // The classic miss: the order screen updates, the khata list does not.
    const r = flat('record_payment', { orderId: 'o1', customerId: 'c1' });
    expect(r).toContain('payments');
    expect(r).toContain('customers');
    expect(r).toContain('customers/ledger/c1');
    expect(r).toContain('orders/detail/o1');
    expect(r).toContain('daySummary/today');
  });

  it('moves both bulk and packed stock after a packing run', () => {
    const r = flat('create_packing_run');
    expect(r).toContain('stock');
    expect(r).toContain('materials');
    expect(r).toContain('skus');
    expect(r).toContain('packingRuns');
  });

  it('moves stock after receiving a purchase, not just the purchase list', () => {
    const r = flat('receive_purchase');
    expect(r).toContain('purchases');
    expect(r).toContain('stock');
  });

  it('refreshes the context after a staff change, because seats live there', () => {
    const r = flat('invite_member');
    expect(r).toContain('members');
    expect(r).toContain('context');
  });

  it('refreshes receipts after settings change, for the GSTIN toggle', () => {
    const r = flat('update_business_settings');
    expect(r).toContain('context');
    expect(r).toContain('orders');
  });

  it('refreshes the context after claiming an invite, so routing re-runs', () => {
    expect(flat('claim_invite')).toContain('context');
  });

  it('moves stock after an adjustment', () => {
    const r = flat('record_stock_adjustment');
    expect(r).toContain('stock');
    expect(r).toContain('materials');
  });
});
