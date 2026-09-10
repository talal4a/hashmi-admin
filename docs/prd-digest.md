# HashmiMart Admin Dashboard — PRD Digest

Source: `HashmiMart_Admin_Dashboard_PRD_v2` (v1.0, 10 September 2026), 19 pages.
This digest is the working summary the build follows. The PDF remains authoritative.

---

## 1. What we are building

A production-grade **Next.js admin dashboard** for the HashmiMart grocery operation, backed by
Firebase Auth + Firestore. Authorized staff run the whole business from it: catalog, categories,
media, inventory, orders, **voice orders**, customers, offers, vendors, banners, analytics,
notifications, settings and audit history. It must read as a polished desktop application, not a
generic CRUD panel.

**Core differentiator — the Media Studio.** Product creation embeds an image pipeline: search stock
providers → select or upload → remove background in-browser → extract palette → generate a product
card background → preview → persist media metadata *and* display colors into Firestore. The mobile
app then renders cards using the saved colors and never recomputes them on-device.

## 2. Product principles (non-negotiable)

| Principle | What it forbids in practice |
|---|---|
| Fast before flashy | No animation may delay a save, order update, search result or navigation |
| Original design | Reference dashboards are inspiration only — no proprietary code, assets or branding |
| Single source of truth | Firestore holds operational data; the mobile app reads published catalog data |
| Media intelligence is catalog data | Cutout + palette + card background are saved *with* the product |
| Auditable admin actions | Sensitive changes record actor, timestamp, before/after summary, reason |
| No secret in the browser | Provider calls and privileged writes go through server-side boundaries only |
| **No fake analytics** | If a metric is not derivable from stored data, show "Not configured" — never invent a number |

## 3. Modules and priority

| Module | Purpose | Priority |
|---|---|---|
| Dashboard | KPIs, charts, alerts, activity, quick actions | P0 |
| Products | CRUD, media studio, bulk actions | P0 |
| Categories | Tree, images, ordering, visibility | P0 |
| Orders | Queue, detail, status timeline, refund/cancel | P0 |
| Voice Orders | Audio playback, transcript/AI detection, correction, convert | P0 |
| Inventory | Stock, low-stock alerts, adjustments, movement history | P0 |
| Admin Users & Roles | RBAC, staff access, invite/disable | P0 |
| Settings | Store, delivery, tax, payment, app config, integrations | P0 |
| Audit Log | Security and operational change history | P0 |
| Customers | Profiles, order history, addresses, support context | P1 |
| Vendors / Stores | Vendor records, availability, assortment | P1 |
| Offers & Coupons | Promotions, discount rules, scheduling | P1 |
| Banners & Home Content | Home hero/content scheduling and ordering | P1 |
| Analytics | Revenue, orders, products, customers, voice usage | P1 |
| Notifications | Transactional log + optional FCM campaigns | P1 |
| Support | Issue queue, optional AI-support conversation visibility | P2 |

## 4. Global shell

- Collapsible left sidebar, cyan active indicator, spring width/layout animation.
- Sticky top bar: global search, Command Palette (Cmd/Ctrl+K), notifications, environment badge, profile.
- Breadcrumbs on deep pages; unsaved-change guard on forms; explicit offline/network-failure state.
- Optimized for 1280px+, fully usable on tablet, emergency mobile support for order/status actions.

## 5. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js App Router + TypeScript |
| Styling | Tailwind CSS + shadcn/ui + Radix, over a HashmiMart token layer |
| Animation | `motion` (imports from `motion/react`) + CSS transitions, reduced-motion aware |
| Forms | React Hook Form + Zod |
| Tables | TanStack Table, server-backed pagination/filtering |
| Server data | Server Components / Route Handlers; TanStack Query where client cache or realtime helps |
| Backend | Firebase Auth + Firestore + Firebase Admin SDK |
| Charts | Recharts, dynamically imported |
| Media cutout | `@bunnio/rembg-web` + `onnxruntime-web` (U2Net family), browser-side |
| Palette | `node-vibrant` |
| Icons / toasts | Lucide React / Sonner |

Project layout: `src/app` (route groups `(auth)` and `(admin)`), `src/components`, `src/features`,
`src/lib` (`firebase/`, `auth/`, `media/providers/`, `validation/`), `src/server`
(`repositories/`, `services/`, `actions/`), `src/types`.

## 6. Data model quick reference

Collections: `admins/{uid}`, `products/{id}`, `categories/{id}`, `orders/{id}` +
`orders/{id}/events/{eventId}`, `voiceOrders/{id}`, `inventoryMovements/{id}`, `customers/{uid}`,
`vendors/{id}`, `offers/{id}`, `coupons/{id}`, `banners/{id}`, `notifications/{id}`,
`auditLogs/{id}`, `appConfig/{doc}`.

Product document shape:

```
products/{productId} {
  name, slug, sku, barcode?, brand?, description?,
  categoryId, subcategoryId?, tags[], searchTokens[],
  unit:          { type, quantity, label },
  pricing:       { price, compareAtPrice?, cost?, currency: 'PKR' },
  inventory:     { track, stockOnHand, reserved, lowStockThreshold },
  media:         { source, original, cutout, palette, processing },
  merchandising: { featured, bestseller, deal, sortScore },
  availability:  { status, publishedAt?, vendorIds[] },
  createdAt, updatedAt, createdBy, updatedBy
}
```

Media sub-document:

```
media: {
  source:     { provider, providerId, sourcePageUrl, author, attributionText },
  original:   { url, storageId, width, height, mimeType },
  cutout:     { url, storageId, width, height, mimeType },
  palette:    { dominant, vibrant, muted, light, dark, cardBg, textColor },
  processing: { backgroundRemoved, model, modelVersion, processedAt }
}
```

Modeling rules: snapshot order items so history never mutates; server timestamps for
`createdAt`/`updatedAt`; treat counters as recomputable accelerators, not truth; subcollections for
event and movement histories, never unbounded arrays; add composite indexes only once real query
patterns exist.

## 7. Order status model

```
pending → confirmed → preparing → ready → out_for_delivery → delivered
   └────────────────→ cancelled
confirmed / preparing / delivered → refund workflow (business rules apply)
```

Invalid jumps are blocked. Every transition writes an event with actor + timestamp.

## 8. Roles

`super_admin` (everything) · `catalog_manager` (products, categories, media, pricing, inventory) ·
`order_manager` (orders, fulfillment, bounded refund/cancel, customers read) · `support_agent`
(customers read, voice/support queues, limited order help) · `analyst` (read-only + export).

## 9. Server boundaries

| Endpoint / action | Behavior |
|---|---|
| `POST /api/auth/session` | Verify Firebase ID token + active admin role, mint HttpOnly session cookie |
| `DELETE /api/auth/session` | Revoke session cookie; optionally revoke refresh tokens |
| `GET /api/media/search` | Query providers, normalize, cache 24h, strip secret fields |
| `POST /api/media/provider-event` | Provider-required tracking (e.g. Unsplash download event) |
| `POST /api/media/upload` | Auth-check admin, upload processed media or issue signed params |
| `createProduct` | Validate schema, enforce role, write product + audit entry atomically |
| `updateOrderStatus` | Validate transition, update order, write event + inventory effects transactionally |
| `adjustInventory` | Validate delta/reason, transactionally update stock and append movement |

## 10. Environment variable policy

Server-only (never `NEXT_PUBLIC_`): `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`,
`FIREBASE_ADMIN_PRIVATE_KEY`, `PIXABAY_API_KEY`, `PEXELS_API_KEY`, `UNSPLASH_ACCESS_KEY`,
`UNSPLASH_SECRET_KEY` (only if an OAuth flow needs it).
Client-safe: the `NEXT_PUBLIC_FIREBASE_*` web config only.

Values live in `.env.local` (git-ignored) for local work and in the deployment provider's encrypted
settings for production. **No credential value is recorded in this repository** — see
`docs/design-extraction.md` §7.

## 11. Provider compliance

| Provider | Rule that constrains us |
|---|---|
| Pixabay | Cache queries 24h; permanent hotlinking not allowed → store permitted selections in our storage |
| Pexels | Respect rate limits; show attribution and link back per API terms |
| Unsplash | API uses require **hotlinked** URLs and a download-event ping; treat as referenced media unless a confirmed-compliant workflow says otherwise; attribute Unsplash + photographer |
| Upload | Preferred for branded packshots — ownership and source are unambiguous |

Do not blindly download, alter and re-host every provider result.

## 12. Phase plan

| Phase | Deliverable | Exit criteria |
|---|---|---|
| 0 Foundation | Setup, tokens, Firebase client/admin, session auth, RBAC, shell, error/toast | Admin signs in and reaches a protected shell |
| 1 Catalog | Products, categories, schema/repositories, validation, tables, forms | A manually-uploaded product publishes into Firestore |
| 2 Media Studio | Provider search, metadata, cutout, palette, generated background, storage | End-to-end image workflow works |
| 3 Orders | Queue, detail, status events, voice review/conversion | Real orders can be fulfilled |
| 4 Inventory | Stock model, movement log, low-stock center, transactional adjustments | Stock integrity holds across order transitions |
| 5 Merchandising | Offers, coupons, banners, vendors, customers | Business team manages storefront content |
| 6 Analytics | KPIs, charts, filters, export, activity/audit log | Dashboard reflects real operational data |
| 7 Hardening | E2E/security/a11y/perf, secret rotation, prod rules and indexes | Production readiness checklist passes |

Fastest-value order: Auth/RBAC → Shell → Products/Categories → Media Studio → mobile catalog
integration → Orders/Voice → Inventory → Offers/Banners → Analytics → Hardening.

## 13. Out of scope for V1

Full ERP/accounting · warehouse batch/lot/expiry optimization · real-time 3D dashboard graphics ·
autonomous AI pricing/refund/order decisions without human confirmation · copying code or assets
from the reference dashboards · storing production secrets in Firestore, localStorage,
`NEXT_PUBLIC_*` or repo files.

## 14. Definition of done

Catalog, categories, orders, voice orders and inventory are operable without the Firebase Console.
Images are searched/uploaded, processed, palette-matched, previewed and persisted with structured
metadata. The mobile app consumes published data and saved display colors with no mock-data
coupling. KPIs and charts come from real stored data. Animation feels premium but never blocks work,
and reduced-motion is honored. Secrets are rotated, server-only and absent from the client bundle.
RBAC, audit logging, validation, error states, tests and production Firestore rules are in place.
