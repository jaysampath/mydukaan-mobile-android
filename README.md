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

## Status: Phase 0 done, Phase 1 next

**Offline writes are off.** `SYNC_MODE=pull_only` — local SQLite is a fast read
cache fed by `sync_pull`, and every write goes through an online RPC. See
[ADR 0002](docs/adr/0002-sync-mode-flag.md) for what that buys and what it costs.

| | |
|---|---|
| Expo app, local-build config, no EAS | done |
| Supabase dev project: schema, RLS, secure access layer | done, verified |
| Sync engine decision | WatermelonDB — [ADR 0001](docs/adr/0001-watermelondb-over-powersync.md) |
| `sync_pull` + the online write RPCs | done, 33/33 HTTP contract assertions |
| Schema compatibility contract + drift check | done |
| Operator portal and admin API | done — `mydukaan-admin`, `mydukaan-backend` |
| Phase 0 demo screen | done |
| **Two-device sign-off** | **not yet run** — now needs one device + one emulator |
| Phases 1–7 | Phase 1 (shell, auth, seats) is next |

### The three repos

All three sit side by side under a `mydukaan/` parent folder, each its own git
repository.

| | |
|---|---|
| `mydukaan-mobile` | this one — the Expo app |
| `mydukaan-backend` | migrations, the API, the SQL and HTTP test suites |
| `mydukaan-admin` | the operator portal (Next.js → Vercel) |

Backend changes deploy with `supabase db push` and never wait on an App Store
review. What *does* couple them is an old app build meeting a new schema, which
is why the server reports a `{current, min_client}` contract on every pull and
this app refuses to sync — with an update prompt — when it is too old.

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

Then:

```bash
npm run verify
```

The database, the API and their tests live in the **`mydukaan-backend`** repo.
The operator portal lives in **`mydukaan-admin`**.

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
  sync/
    sync.ts             the sync cycle: pull always, push only in full mode
    policy.ts           the decisions it makes -- pure, unit-tested in Node
  api/writes.ts         every write. The ONLY write path in pull_only mode
  features/phase0/      the offline-sync proof screen
docs/
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
See `docs/supabase-access.md` in the `mydukaan-backend` repo.

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
- **Offline writes are off** (`SYNC_MODE=pull_only`). Turning them on needs
  `src/domain` and the `sync_push` re-derive fix first — both recorded as hard
  blockers in [ADR 0002](docs/adr/0002-sync-mode-flag.md).
- **The iOS GitHub Actions workflow has not been supplied yet.**
  `docs/build-and-release.md` has a marked TODO listing exactly what to adapt.
- **Android release signing is not wired up.** The keystore must be generated
  and referenced from `~/.gradle/gradle.properties`; because `android/` is
  regenerated by prebuild, this wants a small config plugin before first
  release.
- **No navigation, theme or i18n.** `App.tsx` renders the Phase 0 screen
  directly. Building the shell is most of Phase 1, and every later phase sits
  on it.
- **No screens for the invite-claim flow.** The backend is ready
  (`claim_invite`); the app cannot yet ask a user for their code.
- `src/domain` is not written, and is not needed while `SYNC_MODE=pull_only`.
- **`sync_push` does not re-derive `orders.status` or `orders.total_amount`.**
  Dormant while offline writes are off — the client never pushes — but it is a
  blocker on `SYNC_MODE=full`.

### No longer gaps

- Seat enforcement: `businesses.seat_limit` is now checked when an invite is
  issued, claimed, when a member is reactivated, and when the limit is lowered.
- The HTTP contract tests: they could not run at all (anonymous sign-in is
  disabled). The seeded users now carry real passwords.
