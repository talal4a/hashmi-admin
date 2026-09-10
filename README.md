# HashmiMart Admin Dashboard

A production-grade admin dashboard for the HashmiMart grocery operation: catalog,
categories, media, inventory, orders, voice orders, customers, offers, vendors,
banners, analytics, notifications, settings and audit history — built to the
supplied PRD.

Next.js App Router · TypeScript · Tailwind CSS v4 · Firebase Auth + Firestore ·
Motion · Recharts · Zod.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # fill in what you have
npm run dev                    # http://localhost:3000
```

The dashboard runs immediately, with or without Firebase.

### Without Firebase (default)

If the Firebase Admin credentials are absent, the app uses a **local development
datastore** — a JSON file under `.hm-data/` seeded with realistic HashmiMart
data (30 products, 10 categories, 64 orders, 9 voice requests, 6 customers, 6
delivery areas, coupons, banners and audit history). Document shapes are
identical to the Firestore ones, so nothing above the repository layer changes
when you attach a real project.

The topbar shows a **Local data** badge whenever this backend is active.

To sign in, set a development password in `.env.local`:

```bash
DEV_ADMIN_PASSWORD=pick-something
AUTH_SESSION_SECRET=$(openssl rand -base64 48)
```

Then sign in as any seeded admin to see a different role's view:

| Email | Role |
| --- | --- |
| `admin@hashmimart.example` | Super admin |
| `catalog@hashmimart.example` | Catalog manager |
| `orders@hashmimart.example` | Order manager |
| `support@hashmimart.example` | Support agent |

Delete `.hm-data/` to reset to the seed.

### With Firebase

You need two things: the **server credential** and the **client web config**.

**Server credential — pick either.** The file is easier locally; environment
variables are what deployment needs. If both exist, the file wins.

*Option A, a file:* save the JSON from Project Settings → Service Accounts →
Generate new private key as `service-account.json` in the project root. It is
git-ignored, and the app finds it with no configuration. To keep it elsewhere,
set `FIREBASE_SERVICE_ACCOUNT_PATH` to its path.

That file grants full read and write over your database and bypasses every
security rule, so never commit it and never put it in `public/`.

*Option B, environment variables:* set `FIREBASE_ADMIN_PROJECT_ID`,
`FIREBASE_ADMIN_CLIENT_EMAIL` and `FIREBASE_ADMIN_PRIVATE_KEY`. The private key
must be one line, in double quotes, with its `\n` markers intact.

**Client web config:** the `NEXT_PUBLIC_FIREBASE_*` block, copied from Project
Settings → General → Your apps. Not secret, and required for sign-in.

With both in place the badge changes to **Firestore**.
Sign-in then goes through Firebase Email/Password; the browser's ID token is
exchanged server-side for an HttpOnly session cookie, and local sign-in is
disabled.

Create the admin records first (a document per admin in `admins/`, keyed by
email); the first sign-in binds each record to its Firebase Auth uid.

Deploy the rules and indexes:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint, zero warnings tolerated |
| `npm test` | Vitest suite (121 tests) |
| `npm run check:secrets` | Scans the built client bundle for server-only secrets |
| `npm run check:rbac` | Route-level authorization sweep (needs `npm run dev` running) |
| `npm run verify` | All of the above, in order |

---

## Architecture

```
src/
  app/
    (auth)/login              Sign-in
    (admin)/                  Every admin route, behind one server-side guard
    api/auth/session          ID token -> HttpOnly session cookie
    api/media/search          Provider search (keys stay server-side)
    api/media/upload          Validated media upload
    api/media/provider-event  Provider-required tracking events
    api/media/file/[id]       Authenticated delivery for local media
  components/
    admin-shell/  ui/  dashboard/  products/  categories/
    media-studio/ orders/ inventory/ customers/ marketing/
    analytics/ system/
  lib/
    auth/         RBAC matrix, session, rate limiting
    firebase/     client config, Admin SDK (server-only)
    media/        palette maths, background removal, provider clients
    validation/   Zod schemas — one per write boundary
    utils/        formatting, pricing
  server/
    datastore/    Firestore and local backends behind one interface
    repositories/ Data access
    services/     Inventory, analytics, media storage
    actions/      Server actions — every one re-checks permission
  types/          The domain model
```

### Data layer

`getDatastore()` returns either a Firestore-backed or a local-file-backed
implementation of the same `Datastore` interface. Read-modify-write cycles go
through `mutate()`, which uses a real Firestore transaction on one backend and a
single-writer queue on the other — so stock arithmetic cannot interleave under
either. There is an integration test that fires twenty simultaneous adjustments
and asserts not a unit is lost.

### Authorization

Roles map to permissions in `src/lib/auth/permissions.ts`. Every admin page
calls `requirePermission(...)` and every server action calls
`assertPermission(...)` before touching data — the client-side checks only
decide what to render. The last active super admin cannot be demoted, disabled
or removed, and no admin can disable or remove their own account.

### The media studio

Search or upload → capture attribution → crop/rotate → remove background in the
browser → extract the palette → generate and choose a card background → preview
the exact mobile card → upload and persist.

- Provider keys never reach the browser. All three providers are reached only
  through `/api/media/search`, which normalizes results and caches queries for
  24 hours as Pixabay's terms require.
- **Unsplash results stay hotlinked** and fire the required download event, as
  their API guidelines mandate. Pixabay and Pexels selections are copied into
  HashmiMart storage.
- Background removal runs in the admin's browser via `@bunnio/rembg-web` over
  `onnxruntime-web`, so there is no per-image cost. Progress is real — it comes
  from the inference callback, never a timer.
- A removal failure never touches the original. The admin can retry with a
  different model, correct the mask by hand with the erase/restore brush, or
  skip removal entirely.
- Every generated card background is mixed toward white until it clears the
  4.5:1 AA bar against its own computed foreground. There is a test asserting
  this for ten adversarial input colours.

**Serving the models.** Background removal needs the U2Net-family `.onnx`
artifacts. Place them in `public/models/` (`u2netp.onnx`, `u2net.onnx`,
`silueta.onnx`, `isnet-general-use.onnx`), or point
`NEXT_PUBLIC_REMBG_MODEL_BASE_URL` at a CDN. Pin the exact artifact version and
review each model's licence independently of the wrapper library before
production. Until an artifact is reachable the studio says so plainly and the
rest of the pipeline still works.

---

## Environment variables

Everything is documented in `.env.example`. The rule that matters:

**No server-only value may ever move to a `NEXT_PUBLIC_*` variable.** Only the
Firebase web config block is client-safe, and it is not secret by design.

`npm run check:secrets` enforces this against the actual build output — it fails
if a server-only variable's *value* or even its *name* appears in
`.next/static`.

---

## Testing

```bash
npm test
```

| Area | What is covered |
| --- | --- |
| Pricing | Discount percentages, offer application, coupon evaluation (windows, limits, caps, minimums), tax-inclusive and tax-exclusive totals |
| Palette | Hex conversion, WCAG contrast, foreground selection, the softening guarantee, candidate generation, fallbacks |
| Order transitions | The full state machine — happy path, skip-ahead blocked, backwards blocked, terminal statuses, where refunds are allowed |
| Validation | Product draft vs publish rules, the publish checklist, categories, coupons, delivery areas, settings invariants, slug and search tokens |
| RBAC | Every role's boundaries, override handling, and denial for a missing user |
| Inventory | Real datastore integration: adds, sets, floor at zero, reason enforcement, reservation lifecycle, fulfilment, audit trail, and concurrency |
| Sessions | Signed-token round-trip, tampered payload, tampered signature, expiry, malformed input |
| Rate limiting | Window behaviour, per-key isolation, expiry, client-key derivation |
| Formatting | Currency, dates and relative times, pinned to exact output so a regression to locale-dependent `Intl` formatting (a hydration-mismatch source) fails here |

Two checks run against real output rather than mocks:

- `npm run check:secrets` scans `.next/static` for the value — or even the name —
  of any server-only variable, after a build.
- `npm run check:rbac` signs in as each seeded role against a running dev server
  and makes 65 route-level assertions: every role sees its own modules, every
  other module renders the permission-denied UI, and no module's data leaks
  across a role boundary. Status codes are deliberately not the signal, because
  Next streams the shell and commits a 200 before the render is interrupted.

---

## Before production

The PRD's cleanup gate (§25), restated as a checklist:

- [ ] **Rotate every credential.** The provider keys supplied for testing must be
      treated as already exposed. Issue fresh ones and store them only in the
      deployment provider's encrypted environment settings.
- [ ] Set a strong `AUTH_SESSION_SECRET`. The app refuses to start in production
      without one.
- [ ] Remove `DEV_ADMIN_PASSWORD` from any deployed environment — it is
      development-only and is ignored once Firebase is configured.
- [ ] Confirm `.env.local` is git-ignored (it is) and run a repository secret
      scan.
- [ ] Run `npm run verify` and confirm the bundle scan passes.
- [ ] Run `npm run check:rbac` against a deployed preview.
- [ ] Deploy `firestore.rules` and `firestore.indexes.json`.
- [ ] Pin and licence-review the background-removal model artifacts.
- [ ] Configure Firebase Storage for media, or keep local delivery behind the
      authenticated route.

---

## Reference-site inspection

`docs/reference-inventory.md` records the inspection the PRD requires before
implementation: the navigation map, component inventory, workflow inventory,
motion inventory and the parity checklist for the existing HashmiMart features.
It also records exactly how far each reference site could be inspected from the
build environment.

Neither reference's code, assets or branding is copied. The visual system —
palette, type scale, spacing, radii, motion and component architecture — is
HashmiMart's own.
