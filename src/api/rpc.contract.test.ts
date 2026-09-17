import { beforeAll, describe, expect, it } from 'vitest';

import { API_CONTRACT_VERSION } from './contract';

/**
 * The cross-repo contract check.
 *
 * This is the replacement for src/db/schema.contract.test.ts, which diffed the
 * local WatermelonDB schema against `describe_sync_schema()`. That test existed
 * because the app mirrored the Postgres schema by hand and the two repos deploy
 * on different schedules.
 *
 * Removing offline sync removed the mirror -- but not the risk. Every screen now
 * destructures a server-side jsonb payload by string key, and nothing compiles
 * that boundary. If the backend renames `balance` to `amount_due`, TypeScript is
 * perfectly happy: the app renders `undefined` where a rupee figure belongs, on
 * the screen where someone is collecting cash.
 *
 * So the safety net moved rather than disappearing. This asserts, over real
 * HTTP against the dev project, that every field the app reads still exists and
 * still has the type the app assumes.
 *
 * Deliberately NOT using src/api/reads.ts to make the calls: those functions
 * import the Supabase client, which drags in the React Native module graph and
 * cannot load in Node. Raw fetch keeps this runnable in CI with nothing but the
 * publishable key.
 *
 *   npm run test:contract     (needs .env.dev and a seeded dev project)
 */

const URL_BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const EMAIL = process.env.TEST_OWNER_EMAIL ?? 'owner.a@dev.local';
const PASSWORD = process.env.TEST_OWNER_PASSWORD ?? 'devpassword123';

/** 'iso' means a string new Date() can parse -- see the note in format/date.ts. */
type Expected = 'string' | 'number' | 'boolean' | 'iso' | 'array' | 'object';

let token: string;

async function rpc(fn: string, args: Record<string, unknown> = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: KEY as string,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${fn} -> ${res.status} ${JSON.stringify(body)}`);
  return body;
}

/** Asserts the named keys exist on `node` and hold the expected JS type. */
function expectShape(label: string, node: unknown, shape: Record<string, Expected>) {
  expect(node, `${label} should be an object`).toBeTypeOf('object');
  expect(node, `${label} should not be null`).not.toBeNull();
  const obj = node as Record<string, unknown>;

  for (const [key, kind] of Object.entries(shape)) {
    expect(obj, `${label}.${key} is missing`).toHaveProperty(key);
    const value = obj[key];
    // A nullable column is allowed to be null; the point is the key exists and,
    // when populated, is the right type.
    if (value === null || value === undefined) continue;

    switch (kind) {
      case 'iso':
        expect(typeof value, `${label}.${key} should be an ISO string`).toBe('string');
        expect(
          Number.isNaN(Date.parse(value as string)),
          `${label}.${key} should parse as a date, got ${String(value)}`,
        ).toBe(false);
        break;
      case 'array':
        expect(Array.isArray(value), `${label}.${key} should be an array`).toBe(true);
        break;
      case 'object':
        expect(typeof value, `${label}.${key} should be an object`).toBe('object');
        break;
      default:
        expect(typeof value, `${label}.${key} should be a ${kind}`).toBe(kind);
    }
  }
}

const PAGE_ENVELOPE: Record<string, Expected> = {
  rows: 'array',
  has_more: 'boolean',
  limit: 'number',
  offset: 'number',
};

describe.skipIf(!URL_BASE || !KEY)('the read layer still has the shape the app reads', () => {
  beforeAll(async () => {
    const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: KEY as string, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const body = await res.json();
    if (!body?.access_token) {
      throw new Error(
        `Could not sign in as ${EMAIL}. Has supabase/seed/dev_seed.sql been applied? ` +
          `Got: ${JSON.stringify(body)}`,
      );
    }
    token = body.access_token;
  }, 30_000);

  it('get_my_context carries everything the shell depends on', async () => {
    const ctx = await rpc('get_my_context');
    expectShape('context', ctx, {
      user_id: 'string',
      membership_state: 'string',
      profile: 'object',
      business: 'object',
      is_read_only: 'boolean',
      seats: 'object',
      contract: 'object',
      is_platform_admin: 'boolean',
      server_time: 'iso',
    });
    expectShape('context.profile', ctx.profile, {
      user_id: 'string',
      full_name: 'string',
      role: 'string',
      is_active: 'boolean',
    });
    expectShape('context.business', ctx.business, {
      id: 'string',
      name: 'string',
      show_gstin_on_receipt: 'boolean',
      currency: 'string',
      subscription_status: 'string',
      seat_limit: 'number',
      features: 'object',
    });
    expectShape('context.seats', ctx.seats, {
      limit: 'number',
      used: 'number',
      available: 'number',
    });
  });

  it('this build is not behind the server contract', async () => {
    const ctx = await rpc('get_my_context');
    expect(
      ctx.contract.min_client,
      `Server requires client contract ${ctx.contract.min_client}, this build is ` +
        `${API_CONTRACT_VERSION}. Bump API_CONTRACT_VERSION in src/api/contract.ts ` +
        `after checking every read payload the app destructures.`,
    ).toBeLessThanOrEqual(API_CONTRACT_VERSION);
  });

  it('list_customers returns an envelope of customers with balances', async () => {
    const page = await rpc('list_customers', {});
    expectShape('list_customers', page, PAGE_ENVELOPE);
    if (page.rows.length > 0) {
      expectShape('customer', page.rows[0], {
        id: 'string',
        name: 'string',
        created_at: 'iso',
        outstanding: 'number',
      });
    }
  });

  it('list_raw_materials carries quantity and the reorder flag', async () => {
    const rows = await rpc('list_raw_materials', {});
    expect(Array.isArray(rows)).toBe(true);
    if (rows.length > 0) {
      expectShape('raw material', rows[0], {
        id: 'string',
        name: 'string',
        base_unit: 'string',
        reorder_level_base: 'number',
        is_active: 'boolean',
        qty_base: 'number',
        below_reorder: 'boolean',
      });
    }
  });

  it('list_packed_skus carries pack size, price and packets on hand', async () => {
    const rows = await rpc('list_packed_skus', {});
    expect(Array.isArray(rows)).toBe(true);
    if (rows.length > 0) {
      expectShape('packed sku', rows[0], {
        id: 'string',
        raw_material_id: 'string',
        raw_material_name: 'string',
        name: 'string',
        pack_size_base: 'number',
        sale_price: 'number',
        is_active: 'boolean',
        qty_packets: 'number',
      });
    }
  });

  it('list_orders carries the money and the timestamps', async () => {
    const page = await rpc('list_orders', {});
    expectShape('list_orders', page, PAGE_ENVELOPE);
    if (page.rows.length > 0) {
      expectShape('order', page.rows[0], {
        id: 'string',
        customer_id: 'string',
        customer_name: 'string',
        status: 'string',
        total_amount: 'number',
        paid: 'number',
        balance: 'number',
        item_count: 'number',
        placed_at: 'iso',
      });
    }
  });

  it('get_order carries items, payments and allowed_transitions', async () => {
    const page = await rpc('list_orders', { p_limit: 1 });
    if (page.rows.length === 0) return;
    const detail = await rpc('get_order', { p_order_id: page.rows[0].id });

    expectShape('order detail', detail, {
      order: 'object',
      customer: 'object',
      items: 'array',
      payments: 'array',
      paid: 'number',
      balance: 'number',
      allowed_transitions: 'array',
    });
    expectShape('order detail.order', detail.order, {
      id: 'string',
      status: 'string',
      total_amount: 'number',
      placed_at: 'iso',
    });
    if (detail.items.length > 0) {
      expectShape('order item', detail.items[0], {
        id: 'string',
        packed_sku_id: 'string',
        name: 'string',
        pack_size_base: 'number',
        qty_packets: 'number',
        unit_price: 'number',
        line_total: 'number',
        // The dispatch screen shows "4 needed, 20 on hand" from this.
        qty_on_hand: 'number',
      });
    }
  });

  it('get_stock_snapshot separates bulk from packets', async () => {
    const snap = await rpc('get_stock_snapshot');
    expectShape('stock', snap, { raw: 'array', packed: 'array' });
    if (snap.raw.length > 0) {
      expectShape('raw stock', snap.raw[0], {
        raw_material_id: 'string',
        name: 'string',
        base_unit: 'string',
        qty_base: 'number',
        reorder_level_base: 'number',
        below_reorder: 'boolean',
      });
    }
    if (snap.packed.length > 0) {
      expectShape('packed stock', snap.packed[0], {
        packed_sku_id: 'string',
        name: 'string',
        pack_size_base: 'number',
        sale_price: 'number',
        qty_packets: 'number',
      });
    }
  });

  it('get_day_summary carries every tile on the home screen', async () => {
    expectShape('day summary', await rpc('get_day_summary', {}), {
      on: 'string',
      orders_placed: 'number',
      orders_to_pack: 'number',
      orders_to_dispatch: 'number',
      orders_out: 'number',
      cash_collected: 'number',
      outstanding_total: 'number',
      low_stock_count: 'number',
    });
  });

  it('list_customer_balances carries the khata total', async () => {
    const page = await rpc('list_customer_balances', { p_only_outstanding: false });
    expectShape('balances', page, { ...PAGE_ENVELOPE, outstanding_total: 'number' });
    if (page.rows.length > 0) {
      expectShape('balance', page.rows[0], {
        customer_id: 'string',
        name: 'string',
        total_billed: 'number',
        total_paid: 'number',
        outstanding: 'number',
      });
    }
  });

  it('get_customer_ledger paginates orders and payments', async () => {
    const customers = await rpc('list_customers', { p_limit: 1 });
    if (customers.rows.length === 0) return;
    const ledger = await rpc('get_customer_ledger', {
      p_customer_id: customers.rows[0].id,
    });
    expectShape('ledger', ledger, { balance: 'object', orders: 'object', payments: 'object' });
    expectShape('ledger.orders', ledger.orders, PAGE_ENVELOPE);
    expectShape('ledger.payments', ledger.payments, PAGE_ENVELOPE);
  });

  it('list_payments carries the day-book total', async () => {
    const page = await rpc('list_payments', {});
    expectShape('payments', page, { ...PAGE_ENVELOPE, range_total: 'number' });
  });

  it('list_members carries the roster, invites and seats', async () => {
    const members = await rpc('list_members');
    expectShape('members', members, { members: 'array', invites: 'array', seats: 'object' });
    expectShape('members.seats', members.seats, {
      limit: 'number',
      used: 'number',
      available: 'number',
    });
  });

  it('never returns business_id in any read payload', async () => {
    // The invariant the whole security model rests on: a client cannot name a
    // tenant, so it cannot name the wrong one. This caught a real leak in
    // get_customer_ledger, which was fixed by migration 0020.
    const findKey = (node: unknown, key: string): boolean => {
      if (Array.isArray(node)) return node.some((n) => findKey(n, key));
      if (node && typeof node === 'object') {
        return Object.keys(node).some((k) => k === key || findKey((node as never)[k], key));
      }
      return false;
    };

    const customers = await rpc('list_customers', { p_limit: 1 });
    const payloads = [
      await rpc('get_my_context'),
      customers,
      await rpc('list_orders', {}),
      await rpc('get_stock_snapshot'),
      await rpc('list_customer_balances', { p_only_outstanding: false }),
      await rpc('list_payments', {}),
      await rpc('list_members'),
      await rpc('get_day_summary', {}),
      ...(customers.rows.length > 0
        ? [await rpc('get_customer_ledger', { p_customer_id: customers.rows[0].id })]
        : []),
    ];

    for (const payload of payloads) {
      expect(findKey(payload, 'business_id')).toBe(false);
    }
  });
});
