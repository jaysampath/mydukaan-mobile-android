# My Dukaan

Offline-first mobile app for small Indian wholesale businesses. Replaces a
paper bahi-khata for the loop:

> procure bulk stock → stock into outlet → receive multi-item orders → pack bulk
> into retail packets → deliver → collect cash (often partial, over several
> days) → close the order when fully paid.

V1 ships for one wholesale spice/provisions business, but the schema and access
layer are multi-tenant from day one: many businesses, each with isolated users,
data, and billing. The 5-seat cap is one tenant's limit, not the app's.

**"My Dukaan" is a working name.** Everything brand-shaped lives in
`branding.json`.

---

## Status: Phase 0

Per the phased brief, nothing feature-shaped is built until offline sync is
proven. Current state:

| | |
|---|---|
| Expo app, local-build config, no EAS | done |
| Supabase dev project: schema, RLS, secure access layer | done, verified |
| Sync engine decision | WatermelonDB — [ADR 0001](docs/adr/0001-watermelondb-over-powersync.md) |
| `sync_pull` / `sync_push` | done, tested at SQL and HTTP layers |
| Phase 0 demo screen | done |
| **Phase 0 two-device sign-off** | **not yet run — needs two devices** |
| Phases 1–7 | not started, blocked on the above |

Full write-up of what was built, what was verified, and what is still open:
[docs/IMPLEMENTATION-SUMMARY.md](docs/IMPLEMENTATION-SUMMARY.md).

The acceptance test is written up in
[docs/build-and-release.md](docs/build-and-release.md#the-phase-0-acceptance-test--on-two-real-devices).

---

## Getting started

```bash
npm install
cp .env.example .env.dev        # fill from the dev Supabase project
npx expo prebuild --clean
npx expo run:android            # WatermelonDB is native; Expo Go will not work
```

Then, to verify the backend:

```bash
npm run typecheck
node --env-file=.env.dev scripts/sync-contract-test.mjs
# plus supabase/tests/security_and_sync.sql against dev
```

---

## How it is put together

```
branding.json           the only file with the product name or colours in it
app.config.ts           picks dev/prod at BUILD time from .env.$APP_ENV
src/
  env.ts                build-time config, read once
  api/
    supabase.ts         Supabase client. Private on purpose -- no .from() anywhere
    rpc.ts              the complete data-access surface, one fn per RPC
  db/
    schema.ts           local SQLite schema (mirrors Postgres, minus business_id)
    models.ts           WatermelonDB models
    migrations.ts       local schema migrations, wired from v1
    index.ts            the database instance; UUID v4 id generator
  sync/sync.ts          synchronize() wired to the two RPCs
  features/phase0/      the offline-sync proof screen
supabase/
  migrations/           applied in filename order, append-only once applied
  tests/                the checks a schema change must pass
  seed/                 dev fixtures
scripts/
  sync-contract-test.mjs  exercises the real HTTP API end to end
docs/
  supabase-access.md    READ FIRST -- the security model
  build-and-release.md  toolchain, local builds, release
  adr/                  decisions and why
```

### The four ideas everything else follows from

**1. Stock is a ledger, not a number.** Every in/out/adjustment is a row;
current quantity is `SUM(qty_base)`. There is no mutable `quantity` column
anywhere. Two devices adding stock offline produce two INSERTs that merge
without conflict — a mutable column would produce a lost update. Same for cash:
customer outstanding is `Σ(order totals) − Σ(payments)` across all orders,
never a stored balance.

**2. Stock leaves on dispatch.** Not on order confirmation. The `SALE_OUT`
ledger rows are written when the order goes `OUT_FOR_DELIVERY`.
`PLACED → PACKED → OUT_FOR_DELIVERY → DELIVERED → PAYMENT_PENDING → CLOSED`.

**3. The client never touches a table.** Tables live in schema `app`, which
PostgREST does not expose and on which `anon`/`authenticated` hold no
privileges. All access is through `SECURITY DEFINER` functions owned by a role
without `BYPASSRLS`, so RLS still applies inside them. `business_id` is derived
from the JWT and never accepted from a client.
See [docs/supabase-access.md](docs/supabase-access.md).

**4. Business logic is platform-agnostic.** Stock, orders, ledger, and payment
rules contain no `Platform.OS` checks. Platform branching lives only in the
presentation layer — `Platform.select` for small deltas, `.ios.tsx` /
`.android.tsx` splits for anything that genuinely diverges.

---

## Locked decisions

- Offline-first is non-negotiable. Viewing stock, creating an order, and
  recording a payment all work with no signal.
- Cash only. No payment gateway, no PCI surface.
- Stock deduction on **dispatch**.
- English only at launch; i18n scaffolding stays in place for Hindi/Telugu.
- Internal staff tool. No customer-facing app in V1.
- The packing/conversion module is toggleable per business
  (`businesses.features`).
- **The GSTIN toggle on receipts is free and prominent, and is never
  paywalled.** Receipts are payment confirmations, not tax invoices — they say
  so on the document (`document_type: PAYMENT_RECEIPT`).
- One plan (~₹749/mo, 5 seats, everything) plus a "Talk to us" link. 30-day full
  trial, monthly or yearly. **A lapse makes the app read-only. It never locks
  anyone out of their data** — and `sync_push` stays open on a lapsed
  subscription so work already done on a phone can still reach the server.

---

## Known gaps

Things a reader should not assume are done:

- **Phone/OTP auth is not enabled** on the dev Supabase project, and no SMS
  provider is configured. The Phase 0 screen uses email/password as a
  stand-in. Phase 1 needs the provider set up.
- **Anonymous sign-in is disabled**, so `scripts/sync-contract-test.mjs` cannot
  provision its own users. It fails with instructions. The same behaviours are
  covered by the SQL suite, which needs no auth provider.
- **The iOS GitHub Actions workflow has not been supplied yet.**
  `docs/build-and-release.md` has a marked TODO listing exactly what to adapt.
- **Android release signing is not wired up.** The keystore must be generated
  and referenced from `~/.gradle/gradle.properties`; because `android/` is
  regenerated by prebuild, this wants a small config plugin before first
  release.
- **Seat invites** (the 5-seat cap) are Phase 1. The cap is on
  `businesses.seat_limit` but nothing enforces it yet.
- `src/domain` — the platform-agnostic offline write path described in
  `docs/supabase-access.md` — is not written. Phase 2 onwards.
- **`sync_push` does not re-derive `orders.status` or `orders.total_amount`.**
  A client can push a `CLOSED` order with no payments behind it. Not a
  cross-tenant issue and it cannot corrupt the ledgers, but it must be closed
  before the order UI ships — see
  [docs/supabase-access.md](docs/supabase-access.md#known-gap-in-the-push-path).
