# Archive: the offline sync architecture (removed)

**Status: removed.** See `docs/adr/0003-remove-offline-sync.md` for the decision and its
rationale. This document exists so the removed design is understandable and recoverable
without archaeology, and so that a future decision to reintroduce offline support starts
from what was actually built rather than from scratch.

Written at the point of removal. Everything described here was working and tested.

## Where the source still lives

| Piece | Status after removal |
|---|---|
| `src/db/`, `src/sync/` (mobile) | **deleted from the working tree.** Recoverable from git history in `mydukaan-mobile` (the sync layer is present through the commit preceding the removal). The substance is reproduced below. |
| `supabase/migrations/…_0006_sync_rpc.sql` | **still present.** Migrations are append-only; the file is never edited. |
| `…_0008_sync_push_partial_rows.sql` | still present |
| `…_0009_schema_contract.sql` | still present |
| `…_0010_describe_sync_schema.sql` | still present |
| The functions those migrations created | **dropped** by `…_0020_retire_sync.sql` |

So the SQL is not lost — it is in the migration history, merely no longer in effect. To
restore it, a new migration would re-create the functions from those files. The mobile code
is the part that genuinely needed capturing, and it is below in full.

---

## 1. What the system did

Reads and writes both went through Postgres functions; the client never touched a table.
Local SQLite (WatermelonDB) held a replica of the tenant's rows, so screens read from disk
and the app worked with no connection.

```
  device                                    server
  ------                                    ------
  WatermelonDB (SQLite, JSI)
        |  synchronize()
        |-- pullChanges ---> public.sync_pull(last_pulled_at)
        |                      -> { changes, timestamp, contract }
        |<-- apply -----------
        |
        |-- pushChanges ---> public.sync_push(changes, last_pulled_at)
                               -> { ok: true }
```

Two modes existed, selected at build time by `SYNC_MODE` (ADR 0002):

- `pull_only` — only `sync_pull` ran. Local SQLite was a read cache; every write went
  through an online RPC in `src/api/writes.ts`. **This was the mode actually shipped.**
- `full` — `sync_push` ran too and the device could write offline. Never enabled; it had
  two recorded hard blockers (see §7).

## 2. The five ideas worth remembering

These are the non-obvious parts. Anyone rebuilding offline support will rediscover each of
them the hard way otherwise.

### 2.1 Append-only ledgers are what make offline conflict-free

Stock is `SUM(qty_base)` over `app.stock_ledger`; customer outstanding is
`Σ(order totals) − Σ(payments)`. There is no mutable `quantity` or `balance` column
anywhere, and corrections insert a row with the opposite sign.

This is the load-bearing design choice. Two offline devices both recording a sale produce
**two INSERTs**, not a lost update. There is no field for them to disagree about, which is
why the conflict resolver below could be a no-op. **This property is worth keeping even
without offline sync** — and it was kept.

### 2.2 Everything arrived in `updated`, never `created`

`sync_pull` put every changed row in `updated` and left `created` empty; the client ran with
`sendCreatedAsUpdated: true` and treated an unknown id as a create.

Deciding server-side which rows are "new to this device" is not possible without tracking
per-device state, and getting it wrong produces WatermelonDB "Diverged from server" errors
that strand a device **permanently**. Letting the client decide was both simpler and safe.

### 2.3 The pull cursor deliberately lagged now() by 5 seconds

```sql
v_lag    constant interval := interval '5 seconds';
v_cursor timestamptz := now() - v_lag;
```

A write transaction that stamped `updated_at` before the snapshot but committed after it
would otherwise be invisible forever. With the lag, the next pull's window still covers it.
Rows could be delivered twice; WatermelonDB applied them idempotently. The assumption was
that a write transaction never takes longer than the lag — all of ours were single-statement
inserts.

### 2.4 The wire format was the server's business, not the client's

`app.to_wire()` / `app.from_wire()` were the choke point that made a hostile payload
harmless. Conventions:

- `*_at` columns crossed the wire as **epoch milliseconds** (what WatermelonDB date fields
  expect). `*_on` columns are calendar dates and stayed ISO strings.
- `from_wire` **stripped** `business_id`, `created_by`, `created_at`, `updated_at`,
  `order_no`, `purchase_no`, `line_total`, and anything matching a leading underscore
  (WatermelonDB's `_status` / `_changed` internals), then stamped `business_id` and
  `created_by` from the JWT-derived values. A client could not name a tenant, so it could
  not name the wrong one.

### 2.5 Document numbers were allocated server-side, at push time

An offline device cannot know the next order number without risking a duplicate. So
`orders.order_no` stayed **null** until the row's first successful push, and `sync_push`
allocated numbers at the end of its run from `app.business_counters`. The local schema
carried `order_no` as optional for exactly this reason.

## 3. The compatibility contract

The app mirrored the Postgres schema by hand in `src/db/schema.ts`, and once the repos were
split that mirroring was no longer one atomic commit. Two guards existed:

**`app.schema_contract()` returning `{current, min_client}`**, reported on every pull.

- `current` bumps on **any** change to the wire shape. Informational.
- `min_client` bumps **only** when an old client genuinely cannot survive — a column removed
  or retyped, a table dropped from `synced_tables()`, a semantic change to a field. Bumping
  it strands every phone that has not updated.

The client refused to sync when `min_client` exceeded its build constant
(`SCHEMA_CONTRACT_VERSION`) and prompted for an update. Additive changes therefore never
bricked an installed app — the whole point of separating the deploy cadences.

**`public.describe_sync_schema()`** declared the local schema the server expected, and
`src/db/schema.contract.test.ts` diffed `src/db/schema.ts` against it over HTTP and failed
on drift. It was the only **anon-callable** RPC in the system, deliberately: it returns table
and column *names*, which are already in cleartext inside every shipped APK, so there was no
marginal disclosure — and it meant the drift check ran with nothing but the publishable key.

Note that it declared *expected local types*, not raw Postgres types, because the server owns
the wire format: `to_wire()` turns any `*_at` column into epoch ms, so `updated_at` is a
Watermelon `number`, not a string. Deriving that client-side would have duplicated the rule
and let the two copies disagree — the exact failure the function existed to catch.

**`public.schema_contract()` survives the removal.** The local schema mirror is gone, but the
risk it guarded is not: an old APK meeting a changed *RPC return shape* still breaks, and you
cannot force users to update. It is now an API contract rather than a schema contract, and
the app reads it from `get_my_context()`.

## 4. The mobile code (deleted)

### 4.1 `src/db/index.ts` — the database instance

The one detail worth preserving is the id generator override:

```ts
import { setGenerator } from '@nozbe/watermelondb/utils/common/randomId';
import * as Crypto from 'expo-crypto';

// WatermelonDB's default generator produces short random strings. We override it
// because the server's primary keys are `uuid`, and because a device offline for a
// week must mint ids that will not collide with ids minted by the other four phones
// in the shop over the same week. UUID v4 gives that; 16 random characters do not,
// at the scale of a multi-tenant deployment.
setGenerator(() => Crypto.randomUUID());

const adapter = new SQLiteAdapter({
  schema, migrations,
  jsi: true,            // keeps SQLite calls off the bridge; on budget Android this is
                        // the difference between a list that scrolls and one that stutters
  dbName: 'mydukaan',
  onSetUpError: (error) => {
    // "No storage" for an offline-first app means silent data loss, so this must surface.
    console.error('[db] WatermelonDB failed to initialise', error);
  },
});

export const database = new Database({ adapter, modelClasses });
```

**`jsi: true` is why a custom dev client was required** and why Expo Go did not work. That
constraint is gone with the removal, until RevenueCat reintroduces it at the billing phase.

Caller-minted UUIDs remain relevant after the removal, for a different reason: every
operation RPC takes the record's UUID from the caller, so a phone that loses signal mid-call
retries the same call safely. `newId()` in `src/api/writes.ts` carries this forward.

### 4.2 `src/db/schema.ts` — the local mirror

13 tables, `SCHEMA_VERSION = 2`, `SCHEMA_CONTRACT_VERSION = 1`. Three deliberate differences
from Postgres:

1. **No `business_id`.** A device is signed into exactly one business and the server derives
   the tenant from the JWT. Carrying it locally would add a field that means nothing and can
   only ever be wrong.
2. **No `deleted_at`.** WatermelonDB owns deletion — the server reported soft-deleted rows in
   the `deleted` array of a pull. Modelling `deleted_at` as a column would fight that.
3. **Server-assigned fields present but read-only** (`order_no`, `purchase_no`, `line_total`)
   — they arrived on the next pull.

Units matched the server: RAW quantities in grams, PACKED in whole packets.

The full table/column list is not reproduced here — it is the `app` schema minus those three
differences, and `mydukaan-backend/docs/supabase-access.md` plus migrations 0002–0004 are the
authoritative source.

### 4.3 `src/db/migrations.ts` — local schema migrations

Empty at version 1 but wired up from the start on purpose: an offline-first app cannot assume
users update promptly. A phone offline for three weeks comes back with an old local schema
and unsynced rows in it, and WatermelonDB needs a migration path to keep those rows rather
than wiping the database. **Adding this after the first release is not possible.**

One migration existed (v1 to v2), adding `businesses.features` — the per-business module
toggles. The server had always sent the column; the device simply never stored it, so the app
could not read its own feature flags. Caught by the drift check, not by a person.

### 4.4 `src/sync/policy.ts` — the pure decisions

Deliberately imported no WatermelonDB, NetInfo or expo-constants, because the React Native
module graph cannot be loaded in a Node test runner. These were the parts worth testing.

```ts
/**
 * Thrown when the server's schema has moved beyond what this build understands.
 * Sync stops rather than continuing, because the alternative is writing rows this
 * build cannot represent into local storage and corrupting it. The only fix is a new
 * app version, so this has to reach the user as an update prompt; retrying silently
 * forever would look like an app that simply does not work.
 */
export class SchemaOutdatedError extends Error {
  constructor(readonly requiredContract: number, readonly buildContract: number) {
    super(
      `This version of the app is too old to sync (server requires schema ` +
        `${requiredContract}, this build has ${buildContract}). Please update.`,
    );
    this.name = 'SchemaOutdatedError';
  }
}

/**
 * Thrown when local changes exist while offline writes are off.
 * Nothing should write to local SQLite outside the sync applier in pull_only mode. If
 * something did, discarding it silently would lose the user's work with no trace, so we
 * fail loudly instead. Hitting this means a screen is calling database.write() where it
 * should call an RPC in src/api/writes.ts.
 */
export class UnexpectedLocalChangesError extends Error {
  constructor(readonly tables: string[]) {
    super(
      `SYNC_MODE=pull_only but local changes exist in: ${tables.join(', ')}. ` +
        `Writes must go through src/api/writes.ts, not database.write().`,
    );
    this.name = 'UnexpectedLocalChangesError';
  }
}

/** Names of the tables in a change set that actually carry something. */
export function nonEmptyTables(changes: Record<string, unknown>): string[] {
  return Object.entries(changes)
    .filter(([, set]) => {
      const c = set as { created: unknown[]; updated: unknown[]; deleted: string[] };
      return c.created.length > 0 || c.updated.length > 0 || c.deleted.length > 0;
    })
    .map(([table]) => table);
}

/**
 * Whether a server contract permits this build to sync.
 *
 * A server older than migration 0009 sends no contract at all; that is the pre-contract
 * world and counts as compatible -- refusing it would strand every device the moment the
 * check shipped. Only `min_client` gates: a higher `current` is an additive change this
 * build can safely ignore.
 */
export function contractPermitsSync(
  serverMinClient: number | undefined,
  buildContract: number,
): boolean {
  return serverMinClient === undefined || serverMinClient <= buildContract;
}
```

`policy.test.ts` held 8 cases over those two functions. Together with the 4 drift-check
cases, that was the **entire** mobile test suite.

### 4.5 `src/sync/sync.ts` — the cycle

```ts
export function sync(): Promise<void> {
  if (inFlight) return inFlight;                  // concurrent callers share the promise
  inFlight = runSync().finally(() => { inFlight = null; });
  return inFlight;
}

async function runSync(): Promise<void> {
  await synchronize({
    database,

    pullChanges: async ({ lastPulledAt }) => {
      const result = await syncPull(lastPulledAt ?? null);

      // Check compatibility BEFORE applying anything.
      const required = result.contract?.min_client;
      if (!contractPermitsSync(required, SCHEMA_CONTRACT_VERSION)) {
        throw new SchemaOutdatedError(required as number, SCHEMA_CONTRACT_VERSION);
      }
      return { changes: result.changes, timestamp: result.timestamp };
    },

    pushChanges: async ({ changes, lastPulledAt }) => {
      if (!offlineWritesEnabled) {
        // Nothing should have written locally. If something did, say so rather than
        // letting WatermelonDB mark it synced and drop it on the floor.
        const dirty = nonEmptyTables(changes);
        if (dirty.length > 0) throw new UnexpectedLocalChangesError(dirty);
        return;
      }
      // Strip tables with nothing to say, so the request body stays small on a 2G
      // connection in a market.
      const payload: SyncChanges = {};
      for (const [table, set] of Object.entries(changes)) {
        const c = set as { created: unknown[]; updated: unknown[]; deleted: string[] };
        if (c.created.length || c.updated.length || c.deleted.length) payload[table] = c;
      }
      if (Object.keys(payload).length === 0) return;
      await syncPush(payload, lastPulledAt ?? null);
    },

    sendCreatedAsUpdated: true,                      // see 2.2
    conflictResolver: (_t, _local, _remote, resolved) => resolved,   // see 2.1 -- a no-op
  });
  lastSyncedAt = new Date();
}
```

Supporting behaviour:

- **`isOnline()`** treated `isInternetReachable === null` (check still pending) as *probably
  online* and let the request itself decide. "Refusing to try is worse than trying and
  failing, because a failure is retried anyway."
- **`syncIfOnline()`** swallowed transport errors — offline was a normal state for this app,
  not an error worth showing anyone — but **rethrew** `SchemaOutdatedError`,
  `UnexpectedLocalChangesError` and `RpcError.isForbidden`, because a wrong tenant, wrong
  role, lapsed subscription or incompatible schema all need to reach the user.
- **`startAutoSync(onStateChange?)`** attempted once, then on every NetInfo reconnect, and
  returned an unsubscribe. `SyncState` was `idle | syncing | error`.

## 5. The server functions (dropped by 0020)

### `public.sync_pull(last_pulled_at bigint default null)` returning jsonb

Owned by `app_api`, `security definer`, `stable`, `set search_path = ''`, granted to
`authenticated`. Final form in migration 0009.

Returned `{changes: {<table>: {created: [], updated: [...], deleted: [ids]}}, timestamp, contract}`.
Iterated `app.synced_tables()`, and for each: selected rows where
`business_id = app.current_business_id() and updated_at > since`, soft-deleted excluded,
mapped through `app.to_wire()`; and separately collected ids of rows soft-deleted since the
cursor into `deleted`. `created` was always empty (§2.2). Timestamp was `now() - 5s` (§2.3).

Raised `42501 'caller is not an active member of any business'` when
`app.current_business_id()` was null. A `last_pulled_at` of null or `<= 0` meant
`-infinity`, i.e. a full initial sync.

### `public.sync_push(changes jsonb, last_pulled_at bigint default null)` returning jsonb

Owned by `app_api`, `security definer`, `set search_path = ''`, granted to `authenticated`.
Final form in migration **0008**, which rewrote 0006's version.

Sequence:

1. Raise `42501` if no tenant; raise `22023` if `changes` is not an object.
2. **Reject unknown or pull-only tables loudly** rather than dropping writes — any key not
   in `app.pushable_tables()` raised `42501`. `businesses` and `profiles` were pull-only:
   changing them is an administrative act with its own RPC and its own role check.
3. Iterate `pushable_tables()` **in FK-safe order** (parents before children), not in the
   order the client sent.
4. `created` and `updated` were concatenated and handled identically — *the server did not
   trust the client's opinion about which was which*.
5. Per record: `app.from_wire()`, require an `id` (else `22023`), then INSERT naming **only
   the columns the record actually carried**, with `on conflict (id)`:
   - append-only tables (`stock_ledger`, `payments`) got `do nothing`. History is immutable,
     and a re-push of a row we already have is exactly what a retrying offline client needs.
   - otherwise `do update set` every carried column except `id`; a record carrying only an
     `id` had nothing to update, so `do nothing`.
6. Deletes were soft (`set deleted_at = now()`) and **refused outright** on append-only
   tables: *"rows in % cannot be deleted; insert a reversing row"*.
7. Allocate `order_no` for every order still null (§2.5).
8. Return `{ok: true}`.

**The bug 0008 fixed is worth understanding, because it is a general trap.** 0006 used one
batched INSERT per table via `jsonb_populate_record(null::app.<table>, payload)`, which
returns NULL for every column absent from the payload. Those NULLs were then inserted
*explicitly*, so column DEFAULTs never applied, and any row omitting a NOT NULL DEFAULT
column failed:

```
null value in column "reorder_level_base" violates not-null constraint
```

Not hypothetical — it fires whenever a device sends a partial record: a targeted update, an
older app version whose local schema predates a column, or any column in Postgres but not in
the WatermelonDB schema. **Offline clients are exactly the population that lags the server
schema**, so this had to be correct rather than usually-correct. The fix builds the column
list from the keys actually present, at the cost of one statement per record instead of one
per table. The volume is one shop's changes since its last sync — tens of rows — so clarity
won.

### `public.describe_sync_schema()` returning jsonb

See §3. The only anon-callable RPC. Returned
`{contract, tables: {<table>: [{name, type, isOptional}]}}` where type is one of
`number` / `boolean` / `string`, excluding `id`, `business_id` and `deleted_at`.

### Private helpers dropped alongside them

`app.from_wire(rec, p_business, p_user)` · `app.synced_tables()` (13 tables, FK-safe order) ·
`app.pushable_tables()` (11 — the above minus `businesses`, `profiles`) ·
`app.append_only_tables()` (`stock_ledger`, `payments`) · `app.client_writable_columns(table)`.

**`app.to_wire()` was kept** — `public.update_business_settings` still returns through it.

## 6. What the removal traded away

**Gained:** no local schema mirror and no drift risk; no `src/domain` TypeScript twin ever
needed; **Expo Go works** (WatermelonDB's JSI adapter was the only thing forcing a custom dev
client); the `sync_push` integrity gap (§7) becomes unreachable rather than merely dormant;
roughly 900 lines of client code and 400 lines of SQL retired.

**Lost:** a shop with dead signal cannot take an order during that window. Accepted
deliberately — see ADR 0003.

**Cost incurred instead:** the read layer. All reads previously came from local SQLite, so
removing sync required ~13 new read RPCs (`get_my_context`, `list_customers`, `list_orders`,
`get_order`, …) in migration 0017. That is the real price of this change, and it is paid in
the one place where tenant scoping could be got wrong 13 new times — which is why 0017 ships
with a mechanical assertion that every `list_*` / `get_*` function references
`app.current_business_id`.

## 7. Open items that died with it

Both were recorded as hard blockers on flipping `SYNC_MODE=full`, in ADR 0002. Neither needs
fixing now; both would return if offline support did.

1. **`src/domain` was never written.** The intent was a platform-agnostic TypeScript mirror
   of every SQL write rule, so an offline device could apply the same rules the server
   applies. Note the shape of the debt: *every* write RPC is a rule that would need a
   TypeScript twin. Keeping the rules in SQL only is exactly what made `pull_only` cheap and
   exactly what would have made the flip to `full` expensive. That trade was deliberate.
2. **`sync_push` did not re-derive `orders.total_amount` or validate `orders.status`.** A
   client could have pushed `CLOSED` with no payments behind it. Not cross-tenant and could
   not corrupt the ledgers, but `docs/supabase-access.md` carried an explicit warning not to
   build the order UI without closing it. With push gone, the order UI is unblocked.

## 8. If offline support is ever reintroduced

- ADR 0001's analysis of **WatermelonDB vs PowerSync** still stands and should be re-read
  before choosing again. The deciding factor was that PowerSync's YAML Sync Rules would split
  the tenant boundary across two systems — RLS *and* Sync Rules — in a way Supabase's
  security advisor cannot see.
- The **append-only ledger model survived the removal**, so the hardest prerequisite is
  already in place (§2.1).
- The read RPCs added in 0017 are a natural pull surface; `sync_pull` would become a batched
  form of them rather than a separate mechanism.
- Re-read §2.2, §2.3 and the 0008 partial-record bug before writing any push path. Each of
  those is a day lost to rediscovery.
- Reinstating a local schema means reinstating the drift check. Do not ship the mirror
  without it; the `businesses.features` miss in §4.3 was caught by the check, not by a person.
