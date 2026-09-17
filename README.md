# My Dukaan

Mobile app for small Indian wholesale businesses. Replaces a paper bahi-khata
for the loop:

> procure bulk stock → stock into outlet → receive multi-item orders → pack bulk
> into retail packets → deliver → collect cash (often partial, over several
> days) → close the order when fully paid.

V1 ships for one wholesale spice/provisions business, but the schema and access
layer are multi-tenant from day one: many businesses, each with isolated users,
data, and billing. The 5-seat cap is one tenant's limit, not the app's.

**"My Dukaan" is a working name.** Everything brand-shaped lives in
`branding.json`.

---

## Status: the loop is built, not yet run on a device

**There is no offline support and no local database.** Every read and every
write is an online RPC. This reverses the original brief's "offline-first is
non-negotiable" — see [ADR 0003](docs/adr/0003-remove-offline-sync.md) for why,
and [the archive](docs/archive/offline-sync-architecture.md) for what was
removed and how it worked.

Reads are cached with React Query, persisted to AsyncStorage, so screens render
the last-known result immediately and refetch behind it. That is app caching,
not sync: **writes are never queued**, and a write that cannot reach the server
fails and says so.

| | |
|---|---|
| Expo app, local-build config, no EAS | done |
| Supabase dev project: schema, RLS, secure access layer | done, verified |
| The read layer — 17 RPCs (migration 0017) | done, verified |
| Opening stock and corrections (0018) | done, verified |
| Owner-side staff management + seat fix (0019) | done, verified |
| Backend contract suites | 98/98 assertions |
| App shell: expo-router, theme, i18n, auth, role routing | done |
| The end-to-end loop, owner + packer + delivery | done |
| Mobile test suite | 82 pure + 14 HTTP contract |
| `expo export` bundles (1393 modules) | done |
| **Walked on real hardware** | **not yet** |
| Purchases & suppliers screens | RPCs + typed client ready, no UI |
| Reports, exports, billing | not started |

### Run it

```bash
npm start              # Expo Go works now — no custom dev client needed
npm run verify         # typecheck + the pure suite, no network
npm run test:contract  # HTTP shape check against the dev project
```

Sign in as `owner.a@dev.local` / `devpassword123`, or `packer.a@dev.local` to see
the packer's app.

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
npm start                       # then open it in Expo Go
```

No `prebuild` and no custom dev client: nothing in the app needs native code
that Expo Go does not already carry. That changes when RevenueCat lands, because
`react-native-purchases` is not in Expo Go — at that point
`npx expo prebuild --clean && npx expo run:android` comes back.

For a physical device over adb (the fastest way to check real budget hardware):

```bash
npm run dev
```

Then:

```bash
npm run verify        # typecheck + pure tests, no network
npm run verify:full   # also the HTTP contract check against dev
```

The database, the API and their tests live in the **`mydukaan-backend`** repo.
The operator portal lives in **`mydukaan-admin`**.

---

## How it is put together

```
branding.json           the only file with the product name or colours in it
app.config.ts           picks dev/prod at BUILD time from .env.$APP_ENV; AUTH_MODE
app/                    expo-router. Route groups are role-shaped
  _layout.tsx           QueryClient + persister, session, error boundary
  index.tsx             the ONE place that decides where anyone goes
  (auth)/               sign-in, claim-invite, blocked, update-required
  (owner)/              OWNER + MANAGER: today, orders, stock, khata, more
  (pack)/               PACKER: a queue and a pick list. Nothing else
  (deliver)/            DELIVERY: today's run, collect cash
src/
  env.ts                build-time config, read once
  api/
    supabase.ts         Supabase client. Private on purpose -- no .from() anywhere
    rpc-error.ts        RpcError, alone, so error logic is testable in Node
    rpc.ts              writes: one fn per operation RPC
    reads.ts            reads: one fn per read RPC
    contract.ts         API_CONTRACT_VERSION and the version comparison (pure)
    ids.ts              newId() -- mint at intent, not at submit
  data/
    queryClient.ts      cache, retry policy, and clearCache() on sign-out
    queries.ts          one hook per read; staleTime by cost of staleness
    mutations.ts        one hook per write; networkMode 'always' for money
    invalidate.ts       the fan-out, as data, unit-tested
    errors.ts           shouldRetry + mapRpcError (pure)
    keys.ts             query-key factory
    online.ts           NetInfo -> react-query's onlineManager
  auth/
    session.tsx         who is signed in
    context.tsx         what they may do, from get_my_context
    roles.ts            the capability matrix (pure). UX, not security
    landing.ts          resolveLanding (pure) -- unit-tested routing
    strategies.ts       password | otp behind one interface
  theme/
    tokens.ts           colours from branding.json; scale and contrast here
    components/         Screen, Button, ArmedButton, Money, Qty, Field, ...
  format/               money, qty, date -- pure and tested
  i18n/                 t() from the first screen; en only for now
  receipt/html.ts       the printable receipt for expo-print
docs/
  build-and-release.md  toolchain, local builds, release
  adr/                  decisions and why
  archive/              the offline architecture, as removed
```

### The four ideas everything else follows from

**1. Stock is a ledger, not a number.** Every in/out/adjustment is a row;
current quantity is `SUM(qty_base)`. There is no mutable `quantity` column
anywhere, and corrections insert a row with the opposite sign. Same for cash:
customer outstanding is `Σ(order totals) − Σ(payments)` across all orders,
never a stored balance. This was chosen to make offline writes conflict-free
and kept after offline went away, because auditable corrections and
never-overwritten history are worth having on their own.

**2. Stock leaves on dispatch.** Not on order confirmation. The `SALE_OUT`
ledger rows are written when the order goes `OUT_FOR_DELIVERY`.
`PLACED → PACKED → OUT_FOR_DELIVERY → DELIVERED → PAYMENT_PENDING → CLOSED`.
Which is why dispatch is a whole screen with an arming delay: it cannot be
undone, and there is no reversal RPC yet.

**3. The client never touches a table.** Tables live in schema `app`, which
PostgREST does not expose and on which `anon`/`authenticated` hold no
privileges. All access is through `SECURITY DEFINER` functions owned by a role
without `BYPASSRLS`, so RLS still applies inside them. `business_id` is derived
from the JWT, never accepted from a client, and never returned in a payload.
See `docs/supabase-access.md` in the `mydukaan-backend` repo.

**4. The server is the only authority, and states its rules once.** The client
holds no copy of a business rule. `is_read_only` comes from
`app.has_write_access()`, the legal next actions come from `get_order`'s
`allowed_transitions`, wastage is derived by `create_packing_run`, and the
signed stock delta is derived by `record_stock_adjustment`. Role checks in
`src/auth/roles.ts` exist so nobody is shown a button that will refuse them --
they are UX, and the RPC re-checks every one.

---

## Locked decisions

- ~~Offline-first is non-negotiable.~~ **Reversed on 2026-09-17** — see
  [ADR 0003](docs/adr/0003-remove-offline-sync.md). Struck rather than deleted,
  so the reversal is visible to anyone reading the original brief.
- Cash only. No payment gateway, no PCI surface.
- Stock deduction on **dispatch**.
- English only at launch; i18n scaffolding stays in place for Hindi/Telugu.
- Internal staff tool. No customer-facing app in V1.
- Android only for now. The code stays platform-agnostic so iOS can be added
  without rework, but no time is spent on it.
- The packing/conversion module is toggleable per business
  (`businesses.features`), and the app reads that flag.
- **The GSTIN toggle on receipts is free and prominent, and is never
  paywalled.** Receipts are payment confirmations, not tax invoices — they say
  so on the document (`document_type: PAYMENT_RECEIPT`).
- One plan (~₹749/mo, 5 seats, everything) plus a "Talk to us" link. 30-day full
  trial, monthly or yearly. **A lapse makes the app read-only. It never locks
  anyone out of their data** — every read stays open, and the banner says the
  data is still theirs.

---

## Known gaps

Things a reader should not assume are done:

- **There is no offline support.** A shop in a market with no signal cannot take
  an order or record a payment during that window. Reads fall back to the
  persisted cache; writes fail fast and say so. This is a deliberate reversal of
  the original brief, recorded in ADR 0003 — not an oversight, and worth
  revisiting if a real customer loses a day's orders to it.
- **Nobody has walked the loop on real hardware.** It typechecks, 96 tests pass
  and `expo export` bundles 1393 modules, but that is not the same thing.
- **`cancel_order` does not exist.** Cancelling a dispatched order would flip
  the status while the `SALE_OUT` rows stand, so the stock would never come
  back. `get_order` withholds the `cancel` action past dispatch to make that
  structural rather than a convention. Needs a reversal RPC before real tenants.
- **Phone/OTP auth is not enabled.** `AUTH_MODE=password` today. The OTP
  strategy is real code behind the same interface, but the provider is off and
  Indian SMS needs TRAI DLT entity, sender-ID and template approval — weeks of
  calendar time, unstarted. Start it in parallel with anything else.
- **Purchases and suppliers have no screens.** The RPCs and typed clients exist;
  stock currently gets in through opening balances and packing runs.
- **Reports, exports and billing are untouched.** RevenueCat also brings the
  custom dev client back, since `react-native-purchases` is not in Expo Go.
- **Android release signing is not wired up.** The keystore must be generated
  and referenced from `~/.gradle/gradle.properties`; because `android/` is
  regenerated by prebuild, this wants a small config plugin before first release.
- **No rendering or navigation tests.** The suite covers pure logic and the HTTP
  contract; nothing exercises a component tree. Adding `@testing-library/react-native`
  means running Jest alongside Vitest, which was judged not worth it while the
  screens are still moving.

### No longer gaps

- The app has navigation, a theme, i18n and role-gated shells. `App.tsx` is gone;
  expo-router owns the entry point.
- The invite-claim flow has a screen, and it routes on
  `get_my_context().membership_state` rather than by string-matching a server
  error message.
- `src/domain` is not merely deferred, it is **cancelled**. With no offline
  writes there is no second place for a business rule to live.
- The `sync_push` re-derive gap is closed by deletion rather than repair, which
  is what unblocked building the order UI at all.
- Seat enforcement: `businesses.seat_limit` is checked when an invite is issued,
  claimed, when a member is reactivated, and when the limit is lowered — and
  pending invites now reserve a seat, so an owner can no longer over-issue codes
  and have the failure land on a new hire's phone.
- Expo Go works. WatermelonDB's JSI adapter was the only thing forcing a custom
  dev client.
