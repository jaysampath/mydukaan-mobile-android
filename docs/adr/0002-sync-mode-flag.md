> **Superseded by [ADR 0003](./0003-remove-offline-sync.md)** (2026-09-17).
> The `SYNC_MODE` flag is gone; so is the local database it gated. The two hard
> blockers recorded below (`src/domain`, and the `sync_push` re-derive gap) are
> both moot — the first is cancelled rather than deferred, and the second was
> closed by deleting the surface rather than repairing it.

# 0002 — Offline writes behind SYNC_MODE, defaulting to pull_only

- **Status:** accepted
- **Date:** 2026-09-09
- **Supersedes nothing.** Narrows the scope of [0001](0001-watermelondb-over-powersync.md).

## Context

Phase 0 proved the sync mechanism but the two-device acceptance test was never
run, and Phases 1–7 were all blocked behind it. Offline write support is also
the single most expensive commitment in the architecture: `docs/supabase-access.md`
describes two write paths, and the second one requires `src/domain` — a
platform-agnostic TypeScript mirror of every business rule that already exists
in SQL.

That mirror was never written. Building it means every stock, order, pricing and
payment rule exists twice, in two languages, and the two must not drift.

Offline capability is not currently the constraint on the business. Onboarding
the first tenant is.

## Decision

`SYNC_MODE` is a build-time flag, baked in from `.env.$APP_ENV` alongside
`APP_ENV`. It has two values, and the default is `pull_only`.

**`pull_only`** — `sync_pull` runs normally, so local SQLite stays a fast read
cache and every screen reads from it. `sync_push` is never called. Writes go
through the online RPCs via `src/api/writes.ts`, which fail with a typed
`OfflineWriteBlockedError` when there is no connection.

**`full`** — the Phase 0 behaviour. WatermelonDB pushes local writes and the
device can work with no signal.

It is a build-time flag rather than a runtime setting for the same reason
`APP_ENV` is: which writes are possible is not something a running app should be
able to change its mind about, and a runtime toggle would need both code paths
live in one binary.

## Consequences

**What this buys.**

- `src/domain` is not needed. The rules stay in SQL, stated once.
- The open `sync_push` re-derive gap — a client can push a `CLOSED` order with
  no payments behind it — becomes unreachable. The client never pushes order
  status, so the server is the only writer and its invariants hold. This
  un-blocks Phase 4, which `docs/supabase-access.md` said not to start.
- Phases 2–5 become almost entirely UI work over RPCs that already exist.

**What it costs.**

- The app needs a connection to write. For a wholesaler in a market with patchy
  signal this is a real regression against the original brief, and it is the
  reason this is a flag and not a deletion.
- Every write rule added while the flag is off is a rule that will need a
  TypeScript twin if offline writes come back. The debt grows with each phase.
  That is the deliberate trade: cheap now, more expensive later, and the later
  cost is proportional to how much gets built in between.

**What must be true before flipping to `full`.** Both are hard blockers:

1. `src/domain` exists and mirrors the write rules for the tables the client
   pushes.
2. `sync_push` re-derives `orders.total_amount` from `order_items` and refuses a
   `CLOSED` status the payment rows do not support. See
   `docs/supabase-access.md#known-gap-in-the-push-path` in `mydukaan-backend`.

## Alternatives considered

**Remove WatermelonDB entirely and read through RPCs.** Simpler to reason
about, but it is a rewrite of the data layer, and turning offline support back
on would be a second rewrite. It also gives up the local cache that makes the
app feel fast on a budget phone — which is a user-visible loss for no
architectural gain.

**Leave sync fully on and just skip the acceptance test.** Rejected because it
does not remove the `src/domain` requirement or the `sync_push` gap; it only
hides them until the order UI ships, which is exactly when they become
expensive.

## Enforcement

`sync_push` is not merely skipped in `pull_only` — the push handler asserts the
change set is empty and throws `UnexpectedLocalChangesError` naming the dirty
tables if it is not. Silently discarding a local write would lose a user's work
with no trace. If that error appears, a screen is calling `database.write()`
where it should call `src/api/writes.ts`.
