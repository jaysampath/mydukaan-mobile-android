# ADR 0001 — WatermelonDB over PowerSync

**Status:** accepted · 2026-08-22
**Decides:** which offline-first sync engine backs the local database

---

## Context

Offline-first is non-negotiable. Viewing stock, creating an order, and
recording a cash payment must work with no signal and reconcile on reconnect.
The backend is Supabase Postgres. A separate, equally hard requirement says the
client must **never call tables directly** — all data access goes through a
secured layer with validated inputs and auth checks.

The brief leaned toward PowerSync, on the grounds that it has first-class
offline support and lets us own the write-path conflict logic.

## Decision

**WatermelonDB**, synced through two `SECURITY DEFINER` Postgres functions,
`sync_pull` and `sync_push`.

## Why not PowerSync

PowerSync is a good engine and the offline story is more mature out of the box.
The problem is not quality; it is where authorization ends up living.

PowerSync replicates Postgres tables to the device and scopes what each client
receives using **Sync Rules** — a YAML configuration evaluated by the PowerSync
Service, outside Postgres. That would give this project two authorization
systems describing the same tenant boundary:

- RLS policies in Postgres, and
- Sync Rules in PowerSync.

They can drift. A new table gets an RLS policy and no sync rule, or the
reverse. Supabase's security advisor cannot see Sync Rules, so half the tenant
boundary would sit outside every check we run. For a multi-tenant SaaS where
the failure mode is *one business seeing another's customers and cash
positions*, splitting the boundary in two is the wrong trade.

It also reads tables into the client by design, which sits awkwardly against
"never call tables directly from the client" — and adds a third-party service,
a cost curve, and a Postgres logical-replication slot.

## Why WatermelonDB fits

The pull/push endpoints are ordinary Postgres functions. That means:

- **One authorization boundary.** Tenant scope is `business_id =
  app.current_business_id()`, enforced by RLS, evaluated inside the sync
  functions because they are owned by a role without `BYPASSRLS`. The security
  advisor and our own lint suite can see all of it.
- **The requirement is met literally.** Tables live in a schema PostgREST does
  not expose, and the client roles hold no privileges on it. `.from('orders')`
  cannot resolve.
- **We own the write path**, which was the actual goal behind the PowerSync
  guidance. `sync_push` is our code: it strips server-owned columns, forces
  `business_id` and `created_by`, refuses writes to pull-only tables, enforces
  append-only, and allocates document numbers.
- No extra vendor, no extra cost, no replication slot.

## What this costs

We write the sync endpoints ourselves — roughly 200 lines of SQL — and own
their correctness. Two things in there are genuinely subtle and are documented
where they live:

- **Cursor safety.** The pull cursor lags `now()` by 5 seconds, so a
  transaction that stamps `updated_at` before our snapshot but commits after it
  is still inside the next window. Without the lag such a row is invisible
  forever.
- **Partial records.** The first implementation used
  `jsonb_populate_record(null::app.<table>, payload)`, which returns NULL for
  absent columns and so defeated every column DEFAULT. Fixed in migration
  `0008` by building the INSERT column list from the keys each record actually
  carries.

The second one was found by the test suite, not in production. That is the
argument for having written the suite first.

## What makes the cost small

The data model does most of the work. Stock and payments are **append-only
ledgers** — current stock is `SUM(qty_base)`, outstanding is `Σ(orders) −
Σ(payments)`. Two devices working offline both produce INSERTs. There is no
contested UPDATE, so there is no lost-update problem and no merge policy to
invent. Record ids are device-generated UUID v4, so two phones offline for a
week cannot collide.

Had stock been a mutable `quantity` column, this choice would have been much
harder and PowerSync's conflict machinery would have earned its keep.

## Revisit if

- Sync volume grows past what row-at-a-time push handles comfortably (this is a
  single wholesale business; it is nowhere close).
- We need real-time push-to-device rather than pull-on-reconnect.
- Maintaining `sync_pull` / `sync_push` starts costing more than a vendor
  would.
