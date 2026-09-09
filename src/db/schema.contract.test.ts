import { describe, expect, it, beforeAll } from 'vitest';

import { schema, SCHEMA_CONTRACT_VERSION } from './schema';

/**
 * Schema drift check.
 *
 * The database lives in the mydukaan-backend repo, so a schema change and the
 * local mirror of it are no longer one atomic commit. This is what replaces
 * that atomicity: the server declares the local schema it expects, and this
 * test fails the build if src/db/schema.ts has drifted from it.
 *
 * The server declares expected WatermelonDB column types rather than raw
 * Postgres types on purpose -- it owns the wire format (app.to_wire turns any
 * *_at column into epoch milliseconds), so re-deriving that here would create
 * the second copy of the rule this test exists to catch.
 */

/**
 * Columns the server sends that we deliberately do not store on the device.
 *
 * Every entry is a decision, not an oversight -- that is why the list is
 * explicit and why the test fails on anything not in it. Adding a column here
 * means "the app will never read this", so think before you do.
 */
const INTENTIONALLY_NOT_STORED: Record<string, string[]> = {
  // Audit trail. Useful on the server, never rendered in the app.
  businesses: ['created_by'],
  profiles: ['created_by'],
  raw_materials: ['created_by'],
  packed_skus: ['created_by'],
  customers: ['created_by'],
  suppliers: ['created_by'],
  purchases: ['created_by'],
  purchase_items: ['created_by'],
  packing_runs: ['created_by'],
  orders: ['created_by'],
  order_items: ['created_by'],
  stock_ledger: ['created_by'],
  payments: ['created_by'],
};

type ServerColumn = { name: string; type: string; isOptional: boolean };
type ServerSchema = {
  contract: { current: number; min_client: number };
  tables: Record<string, ServerColumn[]>;
};

let server: ServerSchema;

beforeAll(async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY missing. This test reads .env.dev — see docs/build-and-release.md.',
    );
  }

  const res = await fetch(`${url}/rest/v1/rpc/describe_sync_schema`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) {
    throw new Error(`describe_sync_schema failed: ${res.status} ${await res.text()}`);
  }
  server = (await res.json()) as ServerSchema;
});

const localTables = () =>
  Object.fromEntries(
    Object.values(schema.tables).map((t) => [
      t.name as string,
      Object.values(t.columns).map((c) => ({
        name: c.name as string,
        type: c.type as string,
        isOptional: Boolean(c.isOptional),
      })),
    ]),
  );

describe('local schema matches the server', () => {
  it('is not older than the server requires', () => {
    expect(
      SCHEMA_CONTRACT_VERSION,
      `Server requires client contract >= ${server.contract.min_client}, this build is ` +
        `${SCHEMA_CONTRACT_VERSION}. A breaking schema change shipped — update src/db/schema.ts.`,
    ).toBeGreaterThanOrEqual(server.contract.min_client);
  });

  it('syncs exactly the tables the server sends', () => {
    expect(Object.keys(localTables()).sort()).toEqual(Object.keys(server.tables).sort());
  });

  it.each(Object.keys(localTables()).sort())('%s has the columns the server sends', (table) => {
    const local = localTables()[table];
    const remote = server.tables[table] ?? [];
    const allowed = INTENTIONALLY_NOT_STORED[table] ?? [];

    const localNames = new Set(local.map((c) => c.name));
    const missing = remote
      .map((c) => c.name)
      .filter((n) => !localNames.has(n) && !allowed.includes(n));
    expect(missing, `${table}: server sends these but the device does not store them`).toEqual([]);

    const remoteByName = new Map(remote.map((c) => [c.name, c]));
    const unknown = local.map((c) => c.name).filter((n) => !remoteByName.has(n));
    expect(unknown, `${table}: the device stores these but the server never sends them`).toEqual([]);

    const mistyped = local
      .filter((c) => remoteByName.has(c.name))
      .filter((c) => {
        const r = remoteByName.get(c.name)!;
        return r.type !== c.type || r.isOptional !== c.isOptional;
      })
      .map((c) => {
        const r = remoteByName.get(c.name)!;
        return `${c.name}: local ${c.type}${c.isOptional ? '?' : ''} vs server ${r.type}${r.isOptional ? '?' : ''}`;
      });
    expect(mistyped, `${table}: type or nullability disagrees with the server`).toEqual([]);
  });
});
