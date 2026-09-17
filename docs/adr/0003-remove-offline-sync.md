# 0003 — Remove offline sync

- **Status:** accepted, 2026-09-17
- **Supersedes:** [0001 — WatermelonDB over PowerSync](./0001-watermelondb-over-powersync.md),
  [0002 — Sync mode flag](./0002-sync-mode-flag.md)
- **Detail:** the removed design is captured in
  [`docs/archive/offline-sync-architecture.md`](../archive/offline-sync-architecture.md)

## Context

The original brief listed "offline-first is non-negotiable" as a locked decision, and Phase 0
was built to prove it: WatermelonDB on the device, `sync_pull` / `sync_push` on the server, a
hand-mirrored local schema, a drift check to keep the mirror honest, and a compatibility
contract so old builds could not be bricked by a schema change.

ADR 0002 already retreated from it once, putting offline *writes* behind a build-time flag
defaulting to `pull_only`. Local SQLite became a read cache; every write went through an
online RPC. That left the machinery in place but unused, along with two hard blockers
(`src/domain` unwritten, the `sync_push` re-derive gap) that had to be cleared before the
flag could ever be flipped.

What forced the decision now: the app has no UI beyond a proof-of-sync screen, and the owner
cannot enter stock, take an order, pack, dispatch or collect cash. Getting there means
building screens — and the offline machinery is a tax on every one of them:

- Reads came from a local mirror of the Postgres schema that is maintained **by hand**. Every
  new column is two commits in two repos plus a contract bump.
- `jsi: true` on the SQLite adapter made WatermelonDB a native module, so Expo Go did not
  work and every developer needed a custom dev client build.
- `src/domain` — a TypeScript mirror of every SQL write rule — was never written, and the
  debt grows with every write RPC added. Thirteen operation RPCs exist today; each is a rule
  that would need a twin.
- The `sync_push` gap carried an explicit warning in `docs/supabase-access.md` not to build
  the order UI without closing it first.

Against that: the intended users all have Android phones with internet.

## Decision

**Remove offline sync entirely.** No WatermelonDB, no local SQLite, no `sync_pull` /
`sync_push`. The app talks to Postgres functions over HTTPS and needs a connection.

Reads are cached with `@tanstack/react-query` persisted to AsyncStorage. That is app caching,
not sync: a screen renders the last-known result immediately and refetches in the background,
and a weak connection retries with backoff. **Writes are never queued** — they are online-only
and fail with a clear message otherwise. There is no local mutation state, so there is nothing
to reconcile and no conflict logic.

## Consequences

**Gained**

- No local schema mirror, so no drift risk and no drift check to maintain.
- `src/domain` is never needed. The rules stay in SQL, in one place.
- **Expo Go works again.** WatermelonDB's JSI adapter was the only thing forcing a custom dev
  client. (It returns at the billing phase — `react-native-purchases` is not in Expo Go.)
- The `sync_push` re-derive gap becomes unreachable rather than dormant, which unblocks the
  order UI.
- Roughly 900 lines of client code and 400 lines of SQL retired.

**Lost**

- A shop with dead signal cannot take an order during that window. This is the real cost and
  it is accepted knowingly, not overlooked. If it turns out to bite in practice, §8 of the
  archive document is the starting point for reversing this.

**Paid instead**

- All reads previously came from local SQLite. There were only three server-side read RPCs,
  and **nothing returned the caller's own business and profile** — which role gating, the
  packing feature flag and the read-only banner all depend on. So this removal required
  ~13 new read RPCs (migration 0017).
- That is 13 new places tenant scoping could be got wrong. Mitigated the way the operator API
  is: a mechanical assertion in `supabase/tests/security_and_sync.sql` that every
  `public.list_*` / `public.get_*` function references `app.current_business_id`, so one that
  forgets fails the suite rather than shipping.

## What survives from the old design

- **Append-only ledgers.** Stock is `SUM(qty_base)`; outstanding is
  `Σ(orders) − Σ(payments)`. This was originally chosen to make offline conflict-free, but it
  is good design independently — corrections are auditable and nothing is ever overwritten —
  and it is the hardest prerequisite to re-establish if offline ever returns.
- **Caller-minted UUIDs.** Every operation RPC takes the record id from the caller. The reason
  changes from "offline devices must not collide" to "a phone that loses signal mid-call can
  retry safely", but the mechanism is identical and still load-bearing.
- **`public.schema_contract()`.** The local schema mirror is gone; the risk it guarded is not.
  An old APK meeting a changed RPC return shape still breaks, and users cannot be forced to
  update. It is now an *API* contract, read by the app from `get_my_context()`.
- **The security model, unchanged.** Tables stay in the private `app` schema, RLS stays
  ENABLED and FORCED, functions stay `SECURITY DEFINER` owned by `app_api` (no `BYPASSRLS`),
  no RPC takes `business_id`, and no `service_role` key exists anywhere.

## Notes

The brief's "offline-first is non-negotiable" line is now historical. It is struck in
`README.md` with a pointer here rather than deleted, so the reversal is visible to anyone who
reads the brief later and wonders why the code disagrees with it.
