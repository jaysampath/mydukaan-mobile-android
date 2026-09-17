> **Historical.** A dated report of Phase 0, kept as written. Two of the
> decisions it records were reversed on 2026-09-17 — WatermelonDB and the sync
> layer were removed entirely. See
> [ADR 0003](./adr/0003-remove-offline-sync.md) and
> [the archive](./archive/offline-sync-architecture.md). Current state is in
> `README.md` and the root `CLAUDE.md`.

# Implementation summary — Phase 0

**Date:** 2026-08-22
**Scope delivered:** the five "first tasks" from the project brief.
**Status:** Phase 0 complete and verified server-side. Stopped before feature
work, as instructed, pending the two-device sign-off.

---

## 1. What was asked, and where it landed

| Brief item | Outcome |
|---|---|
| Scaffold Expo (TypeScript), local-build config, no EAS secrets | Done. Local Gradle debug APK builds. |
| Stand up Supabase **dev**, define the secure access pattern | Done. 8 migrations applied and verified. |
| Write `/docs/supabase-access.md` and `/docs/build-and-release.md` | Done. |
| Decide WatermelonDB vs PowerSync, justify, wire Phase 0 proof | **WatermelonDB.** [ADR 0001](adr/0001-watermelondb-over-powersync.md). |
| Multi-tenant schema, `business_id` + RLS everywhere, append-only ledgers | Done. 14 tables, RLS enabled **and forced** on all. |
| Stop at a working Phase 0 demo and confirm | **Here.** |

Two questions were put to you before any irreversible work: the sync engine
(you chose WatermelonDB) and the iOS workflow (placeholder for now).

---

## 2. Decisions worth knowing about

### 2.1 WatermelonDB over PowerSync — against the brief's lean

Your brief leaned PowerSync. I recommended WatermelonDB and you confirmed it.

The deciding factor was **requirement #2** ("never call tables directly from
the client"). PowerSync replicates Postgres tables to the device and scopes
each client with **Sync Rules** — a YAML config evaluated outside Postgres.
That would put tenant isolation in two places (RLS *and* Sync Rules) that can
drift, with half the boundary invisible to Supabase's security advisor. For a
multi-tenant SaaS whose failure mode is one business seeing another's cash
position, splitting the boundary is the wrong trade.

WatermelonDB syncs through two ordinary Postgres functions, so there is exactly
one authorization boundary and we own the write path — which was the real goal
behind the PowerSync guidance anyway.

**What it cost:** ~200 lines of SQL we own. **What made it cheap:** the
append-only ledger model. Two offline devices produce two INSERTs, never a
contested UPDATE, so there is no lost-update problem and no merge policy to
invent. Had stock been a mutable `quantity` column this decision would have
been much harder.

### 2.2 Expo SDK 54, not 57 — a deliberate downgrade

SDK 57 is current. I pinned 54.

WatermelonDB 0.28.0 is from April 2025, and its Expo config plugin's last
*stable* release (2.3.3) is from May 2024 — predating the New Architecture
entirely. SDK 57 / RN 0.86 is far newer than both. The whole app rests on the
local database working on cheap Android hardware; that is not a component to
run unproven.

SDK 54 (RN 0.81) is close in time to WatermelonDB 0.28.0, still actively
patched by Expo, and — now verified in this repo — the plugin wires the JSI
package into `MainApplication.kt`, `settings.gradle`, and `app/build.gradle`
correctly on it. Worth revisiting once the sync path has real-device mileage.

### 2.3 Tables in a private schema, not `public`

Rather than relying on discipline to avoid `.from('orders')`, tables live in
schema `app`, which PostgREST does not expose and where `anon`/`authenticated`
hold **no privileges at all** — not even `USAGE`. The call cannot resolve.

Layered underneath: RLS `ENABLED` **and `FORCED`** on every table, with API
functions owned by `app_api` — a role deliberately **without `BYPASSRLS`** — so
policies are still evaluated inside every function. Gate 1 is configuration;
gate 2 is why a misconfiguration is not a breach.

---

## 3. What was built

### Backend — 8 migrations on the dev project (`upwwipwgfzqswjcmqrha`)

```
20260822073315_0001_foundation           schema app, app_api role, JWT identity helper
20260822073334_0002_core_schema          businesses, profiles, catalog, parties
20260822073352_0003_operations           purchases, packing runs, orders, order items
20260822073411_0004_ledgers              stock_ledger + payments (append-only) + balance views
20260822073429_0005_rls_and_grants       RLS + policies + privilege revocation + assertions
20260822073501_0006_sync_rpc             sync_pull / sync_push
20260822073613_0007_operation_rpcs       the business API
20260822073827_0008_sync_push_partial_rows   bug fix, see §5
```

Migration `0005` ends with assertions that **fail the migration** if any table
in `app` lacks ENABLE+FORCE RLS, lacks a policy, or if `app_api` ever gains
`BYPASSRLS`. Gaps break the deploy rather than shipping quietly.

**13 RPCs** form the complete data surface: `sync_pull`, `sync_push`,
`bootstrap_business`, `update_business_settings`, `receive_purchase`,
`run_conversion`, `create_order`, `dispatch_order`, `set_order_status`,
`record_payment`, `get_receipt`, `get_stock_snapshot`, `get_customer_ledger`.

Every one takes the record's UUID **from the caller**, so a phone that loses
signal mid-call can retry safely. None takes a `business_id`.

### Client

```
branding.json / branding.config.ts   the only files naming the product
app.config.ts                        picks dev/prod at BUILD time from .env.$APP_ENV
src/env.ts                           build-time config, read once, validated
src/api/supabase.ts                  client is PRIVATE — .from() is unreachable by design
src/api/rpc.ts                       the entire data-access surface, typed
src/db/{schema,models,migrations}.ts local SQLite mirror + WatermelonDB models
src/db/index.ts                      database instance, UUID v4 id generator
src/sync/sync.ts                     synchronize() wired to the two RPCs
src/features/phase0/Phase0Screen.tsx the offline-sync proof screen
```

### Docs and tests

- `docs/supabase-access.md` — the security model, the two write paths, the sync
  protocol's three subtle decisions, dev/prod isolation, an add-a-table checklist.
- `docs/build-and-release.md` — toolchain and why each version, local Android
  Gradle, signing, iOS TODO, the two-device acceptance procedure, troubleshooting.
- `docs/adr/0001-watermelondb-over-powersync.md`
- `supabase/tests/security_and_sync.sql` — privilege assertions plus an
  advisor-equivalent lint (8 rules) that must return zero rows.
- `supabase/seed/dev_seed.sql` — two businesses, three users, a real slice of the
  workflow. Dev currently sits in exactly this state.
- `scripts/sync-contract-test.mjs` — exercises the real HTTP API end to end.

---

## 4. Verification — what was actually run

Migrations were dropped and **replayed from zero** to prove they work on a
fresh database, which is what prod will need.

### Security (impersonating real JWTs via `role` + `request.jwt.claims`)

| Check | Result |
|---|---|
| `authenticated` has `USAGE` on schema `app` | DENIED |
| `authenticated` can SELECT `app.businesses` | DENIED |
| `authenticated` can INSERT `app.stock_ledger` | DENIED |
| `anon` can SELECT `app.orders` | DENIED |
| `anon` can EXECUTE `sync_push` / `dispatch_order` | DENIED |
| `authenticated` can EXECUTE `sync_pull` | ALLOWED |
| `app_api` can SELECT `app.orders` | ALLOWED |
| `app_api` can DELETE `app.orders` | DENIED |
| `app_api` has `BYPASSRLS` | NO |
| Advisor-equivalent lint, 8 rules | **0 findings** |
| `anon` GET `/rest/v1/businesses` over real HTTP | refused |

### Attacks attempted, all repelled

| Attack | Outcome |
|---|---|
| Payload with spoofed `business_id`, `created_by`, `created_at: 0` | All three overwritten server-side; row landed in the caller's own tenant with a server timestamp |
| `_status` / `_changed` (WatermelonDB internals) in payload | Never reached the database |
| Business B overwriting business A's row by id | `42501` — RLS policy violation; A's row unchanged |
| Packer pushing a `profiles` row to make itself OWNER | `42501` — table not writable from a client |
| Deleting a `stock_ledger` row through sync | `42501` — append-only |
| Direct privileged `UPDATE` on `stock_ledger` | `42501` — trigger refused |
| Packer calling `create_order` | `42501` — role PACKER may not perform this operation |

### Tenant isolation

Business B's first `sync_pull` returned exactly **one** business (its own) and
**zero** rows of A's raw materials, customers, or ledger entries.

### The Phase 0 semantic — device A to device B

Device A (owner) pushed a packed SKU and two ledger rows. Device B (packer,
same business, older cursor) pulled and received **1 SKU + 2 ledger rows**,
with correct values. The incremental cursor returned zero rows on a repeat pull
and advanced correctly.

### Business rules

| Check | Result |
|---|---|
| Stock derived from ledger | 40 000 g raw, 20 packets — exact |
| `create_order` prices from the SKU | ₹450 for 5 × ₹90 |
| Dispatch deducts stock | 20 → 15 packets |
| Dispatch retried | `already_dispatched: true`, still 15 — no double deduction |
| ₹200 partial payment on ₹450 | outstanding 250, order stays open |
| ₹250 balance payment | outstanding 0, order auto-`CLOSED` |
| Receipt | correct totals, `document_type: PAYMENT_RECEIPT` |
| GSTIN toggle off | `business.gstin: null` |
| GSTIN toggle on | GSTIN appears — free, no plan check |

### Build

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `expo config` with `APP_ENV=dev` | resolves the dev project |
| `expo config` with `APP_ENV=prod` | **fails loudly** — no silent fallback to dev |
| `expo prebuild --platform android --clean` | succeeds; WatermelonDB JSI wired |
| `./gradlew assembleDebug` | **succeeds** — 154 MB `app-debug.apk` |

---

## 5. Two real bugs the tests caught

**1. `auth.uid()` inside `app_api`-owned functions failed outright.**
`sync_push` raised *permission denied for schema auth*. The `auth` schema is
owned by `supabase_admin`, and `postgres` holds no grant option on it — so
`grant usage on schema auth to app_api` was a **silent no-op**. Fixed by
reading the JWT claim from the request GUC in `app.current_user_id()`, which
has identical semantics and no dependency on Supabase's internal ACLs.

**2. Column defaults never applied on push.**
`sync_push` used `jsonb_populate_record(null::app.<table>, payload)`, which
returns NULL for every absent column. Those NULLs were then inserted
explicitly, so every column DEFAULT was defeated:

```
null value in column "reorder_level_base" violates not-null constraint
```

Not hypothetical — it fires on any partial record, which is exactly what an
older app version whose local schema lags the server sends. Offline clients are
the population most likely to lag. Fixed in migration `0008` by building the
INSERT column list from the keys each record actually carries.

The second bug also surfaced *because* of the first attack test — it masked the
cross-tenant check, which passed once the bug was fixed.

---

## 6. Known gaps — do not assume these are done

| Gap | Impact |
|---|---|
| **`sync_push` does not re-derive `orders.status` / `total_amount`** | A client could push a `CLOSED` order with no payments behind it. Not cross-tenant, cannot corrupt the ledgers. **Must be closed before the order UI ships** (Phase 4/5). |
| **Phone/OTP auth disabled** on dev; no SMS provider | Phase 0 screen uses email/password as a stand-in. Phase 1 blocker. |
| **Anonymous sign-in disabled** | `sync-contract-test.mjs` cannot provision users; it fails with exact instructions. SQL suite covers the same behaviours without auth. |
| **iOS GitHub Actions workflow not supplied** | `build-and-release.md` has a marked TODO listing what to adapt. |
| **Android release signing not wired** | Keystore + a config plugin needed before first release. |
| **Seat invites (5-seat cap) not enforced** | `businesses.seat_limit` exists; nothing checks it. Phase 1. |
| **`src/domain` not written** | The platform-agnostic offline write path. Phase 2 onwards. |
| **Not a git repository** | `.gitignore` is written; `git init` not run without asking. |

---

## 7. What needs you

1. **Enable anonymous sign-in on dev** (or turn off email confirmation) so the
   HTTP contract test can run itself.
2. **Enable the phone provider + SMS** before Phase 1.
3. **Supply the iOS workflow** to drop into `.github/workflows/`.
4. **Confirm `com.launchgrid.apps.mydukaan`** as the bundle id — permanent after first
   store publish. It lives in `branding.json`.
5. **Run the two-device Phase 0 test.** The offline half cannot be proven from
   here. Procedure is in
   [build-and-release.md](build-and-release.md#the-phase-0-acceptance-test--on-two-real-devices).
   Step 7 — both devices offline, both writing, then reconnect — is the one
   that would expose a broken sync design.

---

## 8. Environments

| | dev | prod |
|---|---|---|
| Project ref | `upwwipwgfzqswjcmqrha` | `fwlnsatdqrtyvvnagbqn` |
| Schema state | 8 migrations applied, seeded | **untouched** |
| MCP access | read/write | **read-only** |
| Selected by | `APP_ENV=dev` → `.env.dev` | `APP_ENV=prod` → `.env.prod` |
| App id | `com.launchgrid.apps.mydukaan.dev` | `com.launchgrid.apps.mydukaan` |

Separate projects — not schemas, not key sets. No shared Postgres instance, no
shared auth users, no credential that works on both. Selection is baked in at
build time; there is no runtime switch.

Prod schema deployment goes through the CLI (`npx supabase db push`), never
MCP. Migration filenames use the CLI's `<timestamp>_<nnnn>_<name>.sql`
convention and dev's `schema_migrations` already carries those exact versions,
so `db push` is a no-op on dev and applies the full set to prod.
