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

### Skipping sign-in while you set things up

To open the dashboard without logging in at all, add this to `.env.local` and
restart:

```bash
DEV_AUTH_BYPASS=true
```

Every request is then treated as a signed-in super admin. A production build
refuses it no matter how the variable is set, the server logs a warning on first
use, and the topbar shows a red **Login off** badge so the state is never a
mystery. Delete the line to restore normal sign-in.

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

**The admin picks one picture. Nothing else is asked of them.** Squaring the
image, removing the background, trimming the empty surround, reading the colours
off the product and choosing a card background that passes contrast all run
automatically, in that order, in `src/lib/media/pipeline.ts`. The manual
stages — crop, rotate, model choice, the erase/restore brush, a colour
override — are still there, folded away behind "Fine-tune", as an escape hatch
rather than the route through.

The order matters: the cutout has to exist before the palette is read, because
colours taken from the untouched photo describe the photographer's backdrop
rather than the product.

- Provider keys never reach the browser. All three providers are reached only
  through `/api/media/search`, which normalizes results and caches queries for
  24 hours as Pixabay's terms require.
- **Provider images are loaded through `/api/media/proxy`**, never directly.
  Canvas work needs same-origin pixels: `cdn.pixabay.com` sends no
  `Access-Control-Allow-Origin` header at all, and a third-party image either
  refuses to load or taints the canvas — and a tainted canvas can be neither cut
  out nor sampled for colour. The proxy fetches only from a fixed host list,
  checked before *and* after redirects, so it cannot become a general-purpose
  request forwarder.
- **Unsplash results stay hotlinked** and fire the required download event, as
  their API guidelines mandate. Pixabay and Pexels selections are copied into
  HashmiMart storage.
- Background removal runs in the admin's browser via `@bunnio/rembg-web` over
  `onnxruntime-web`, so there is no per-image cost. Progress is real — it comes
  from the inference callback, never a timer.
- **Inference is pinned to the WASM execution provider.** Every U2Net-family
  model pools with `ceil_mode` enabled — `u2netp.onnx` alone has 33 such
  layers — and onnxruntime-web's WebGPU MaxPool kernel computes that output
  shape without implementing the padding it implies, so the run throws. Enabling
  WebGPU therefore breaks the cutout on every machine that has a GPU while
  leaving it working on machines that do not, which is a hard failure to
  notice. Revisit when the runtime implements it.
- Colours come from `src/lib/media/quantize.ts`: a median-cut quantiser over the
  cutout's own RGBA, so transparent pixels are ignored and the swatches describe
  the product. Being a pure function, it is unit-tested rather than judged by
  eye.
- A removal failure never ends the run. The photo is used as it is, the colours
  are taken from the whole picture instead, and the studio says exactly what
  happened.
- Every generated card background is mixed toward white until it clears the
  4.5:1 AA bar against its own computed foreground. There is a test asserting
  this for ten adversarial input colours.

**Serving the models.** Nothing needs to be done. `/api/media/model/<file>`
fetches the pinned `.onnx` artifact on first use, checks it against the byte
length and SHA-256 in `src/lib/media/model-catalog.ts`, and keeps it on disk;
every later request is served locally. `npm run fetch-models` does the same
ahead of time, and a file placed in `public/models/` always wins — which is what
an air-gapped deployment would use. `NEXT_PUBLIC_REMBG_MODEL_BASE_URL` points
the browser somewhere else entirely if you would rather serve them from a CDN.

The ONNX Runtime `.wasm` files are copied out of `node_modules` into
`public/ort/` by `scripts/prepare-media-runtime.mjs`, which runs on `postinstall`
and before `dev` and `build`. Both directories are generated and git-ignored.

**When something looks wrong,** Settings → *Media pipeline check* runs the whole
thing for real on a picture it draws itself — provider search, the proxy, the
model, an actual cutout, an actual colour read — and names the step that failed.

### Category pictures

A category tile wants a pile of mixed goods, not one strawberry on white, and a
plain search gives mostly the latter — measured against the live providers,
"fruits" returned two group photos in ten. Three things address that, and the
first two are worth more than the third:

1. **A better question.** A category search opens on `<name> assortment` rather
   than the bare name. Same measurement: seven group photos in eight. The
   alternatives are offered as chips; "collection" is not among them, because it
   drifted a fruit search onto walnuts.
2. **Assortments first.** `src/lib/media/group-shot.ts` scores each result from
   the text the providers already send — Pixabay's tags, Pexels' and Unsplash's
   descriptions — and sorts group photos above single items, badging them so the
   order is explained rather than mysterious. With both in play the first eight
   results were eight group photos. The scale is deliberately coarse: a finer
   one rewarded Pixabay's long tag lists over the single sentence the others
   send, and one provider took over the top of the grid.
3. **Build it from the catalogue instead.** Every product that has been through
   the media studio has a background-free cutout, so a category's tile can be
   composed from its own products — the arrangement in
   `src/lib/media/collage.ts`, the picker under the *From this category* tab.
   Products that have no cutout yet get one on the way through. This is the only
   option that shows the shop's actual goods, so it is where the studio opens
   when the category has products with pictures.

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
