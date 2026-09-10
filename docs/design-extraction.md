# Design & Feature Extraction — PRD §23 Deliverable

Required before UI implementation begins. PRD §23 mandates a reference-site inspection plus five
inventories (navigation map, component inventory, workflow inventory, motion inventory, parity
checklist), and states: *"If a site is temporarily unavailable, record that fact and continue from
the PRD rather than inventing unseen details."*

That clause is in force. **Both reference sites are unreachable from this environment.** Everything
below is derived from the PRD text only. Sections marked 🔒 **BLOCKED** cannot be completed until
someone with access supplies the observations.

---

## 1. Reference-site inspection log

| Reference | URL | Credentials supplied | Result | Date |
|---|---|---|---|---|
| POS / Comanda UI reference | `pos-eight-silk.vercel.app/index.php` | yes (owner-supplied, testing-only) | ❌ Not reachable | 2026-09-10 |
| Existing HashmiMart website | `hashmimart.vercel.app` | yes (owner-supplied, testing-only) | ❌ Not reachable | 2026-09-10 |

**Cause — network egress policy, not a credential or site problem.** The build environment routes
all outbound HTTPS through a policy-enforcing proxy that answered `403` to the `CONNECT` tunnel for
both hosts:

```
pos-eight-silk.vercel.app:443  — connect_rejected (gateway answered 403 to CONNECT)
hashmimart.vercel.app:443      — connect_rejected (gateway answered 403 to CONNECT)
```

The block is not specific to these sites: the same denial applies to every general-web host tested
(`example.com`, `vercel.com`, `nextjs.org`, `motion.dev`). Only package registries — npm, PyPI,
crates.io, proxy.golang.org — are on the allowlist. The login pages were never reached, so the
supplied credentials were never exercised and no session was established.

This repeats the limitation already recorded in PRD §20 ("the two supplied private/reference
dashboards could not be fetched or authenticated from the current document-generation environment").

### To unblock

Any one of these closes the gap:

1. Add `pos-eight-silk.vercel.app` and `hashmimart.vercel.app` to the environment's network policy
   allowlist, then re-run this inspection. Chromium and Playwright are already installed here, so a
   scripted sign-in + full-page screenshot pass of every module is a short job once egress opens.
2. Attach screenshots of the reference dashboards (sidebar, dashboard, product list, product form,
   order queue, order detail, category manager, settings) to the session.
3. Run the inspection on a machine with access and paste the observations into §2–§6 below.

Until then, treat §2–§6 as PRD-derived defaults and §6 as unstarted.

---

## 2. Navigation map

**Target HashmiMart admin (from PRD §2.1).** Reference-site columns stay empty until inspection.

| # | Route | Module | Priority | Seen in POS ref | Seen in legacy HashmiMart |
|---|---|---|---|---|---|
| 1 | `/dashboard` | Control Center | P0 | 🔒 | 🔒 |
| 2 | `/products` · `/products/new` · `/products/[id]` | Products + Media Studio | P0 | 🔒 | 🔒 |
| 3 | `/categories` | Category tree | P0 | 🔒 | 🔒 |
| 4 | `/orders` · `/orders/[id]` | Order queue + detail | P0 | 🔒 | 🔒 |
| 5 | `/voice-orders` · `/voice-orders/[id]` | Voice order review | P0 | 🔒 | 🔒 |
| 6 | `/inventory` | Stock, adjustments, movements | P0 | 🔒 | 🔒 |
| 7 | `/admin-users` | RBAC / staff | P0 | 🔒 | 🔒 |
| 8 | `/settings` | Store, delivery, tax, payment, integrations | P0 | 🔒 | 🔒 |
| 9 | `/audit-log` | Change history | P0 | 🔒 | 🔒 |
| 10 | `/customers` · `/customers/[uid]` | Customer profiles | P1 | 🔒 | 🔒 |
| 11 | `/vendors` | Vendors / stores | P1 | 🔒 | 🔒 |
| 12 | `/offers` · `/coupons` | Promotions | P1 | 🔒 | 🔒 |
| 13 | `/banners` | Home content | P1 | 🔒 | 🔒 |
| 14 | `/analytics` | Reporting | P1 | 🔒 | 🔒 |
| 15 | `/notifications` | Transactional log + campaigns | P1 | 🔒 | 🔒 |
| 16 | `/support` | Issue queue | P2 | 🔒 | 🔒 |
| — | `/login` | Auth (outside admin shell) | P0 | 🔒 | 🔒 |

Sidebar grouping proposal: **Operate** (Dashboard, Orders, Voice Orders) · **Catalog** (Products,
Categories, Inventory) · **Grow** (Customers, Offers & Coupons, Banners, Notifications, Analytics) ·
**Configure** (Vendors, Admin Users, Settings, Audit Log). Confirm against the POS reference's own
grouping once reachable.

## 3. Component inventory

Every component the PRD implies, with the states it must ship. This is the build checklist for the
shared UI layer.

### Shell
- **Sidebar** — collapsible, cyan active pill, spring width change, grouped sections, keyboard navigable.
- **Top bar** — global search, Command Palette trigger (Cmd/Ctrl+K), notification bell with unread count, environment badge (dev/staging/prod), admin profile menu.
- **Breadcrumbs** — on every deep page.
- **Command palette** — navigate + quick-create (Add Product, Add Category, Create Offer, Review Voice Orders), shared-layout expansion, backdrop blur.
- **Toast system** — Sonner; success / error / undo affordance.
- **Unsaved-changes guard** — dialog on navigation away from a dirty form.
- **Offline / network-failure banner**.

### Data display
- **KPI card** — label, value, delta vs previous period, sparkline slot, count-up *only after data arrives*, and a "Not configured" variant for metrics with no backing data.
- **Chart set** — line/area (revenue + order volume), donut (status distribution), bar (top categories/products, orders by hour), comparison (cart vs voice, new vs returning). Recharts, dynamically imported, reveal once per data change.
- **Data table** — server-backed pagination/sort/filter, column visibility, row selection, bulk action bar, sticky header, inline edit for safe fields only, virtualized or paginated for long lists.
- **Saved views** — "Low stock", "Drafts", "On sale", "Recently changed"; shareable filter URLs.
- **Status pill** — 8 order states + product status + voice review status; color-coded, text-labelled (never color alone).
- **Activity feed** — product/order/refund/role changes with actor and relative time.
- **Low-stock risk list** — sorted by urgency, one-click inventory action.
- **Audit timeline** — actor, action, before/after summary, timestamp.
- **Empty / loading / error / permission-denied states** — required for every module; skeletons must reserve stable space so nothing jumps.

### Input & forms
- Text, textarea, select, combobox (category picker, product search), multi-select tags, number/currency (PKR), switch, radio group, date & date-range picker, scheduler (start/end), slug field with auto-generate, drag-and-drop reorder list.
- **Section-based product form** — Basics, Pricing, Unit & pack, Inventory, Media, Merchandising, Availability, SEO/share; per-section completion state that morphs to a check.
- **Validation surface** — Zod-driven, inline field errors plus a publish-blocking summary.
- **Confirmation dialog** — required for every destructive action, with reason capture where the PRD demands it (cancel, refund, privileged customer edit).

### Media Studio
- Provider tabs: All · Pixabay · Pexels · Unsplash · Upload.
- Search field: 350ms debounce, 2-char minimum, stale-request cancellation, infinite/paginated grid, recent searches, product-name prefill.
- Result card: thumbnail, provider badge, author/attribution, dimensions, "Use image".
- Cropper: crop / rotate / object-fit.
- Background removal: model-load progress, Before/After compare slider, manual erase/restore brush, retry with another model, skip.
- Palette strip: dominant / vibrant / muted / light / dark + 3 generated card-background candidates + manual hex override.
- **Mobile card preview** — renders exactly as the app will: cutout on generated background, computed text color, discount state, fallback color.
- Progress/stage indicator with cancel, explicit failure messages, and non-destructive fallback to the original image.

### Orders & voice
- Order queue view switcher (All / New / Confirmed / Preparing / Ready / Out for delivery / Delivered / Cancelled / Refunded) with counts.
- Order detail: items, totals, customer + address snapshot, payment, delivery, notes, status timeline, print packing slip / invoice.
- Status transition control that only offers legal next states.
- Realtime new-order indicator (no full table reload).
- Audio player: waveform, progress, playback speed, duration, source timestamp.
- Transcript panel with AI-detected items and per-item confidence; low-confidence items visibly flagged.
- Item correction row: quantity stepper + catalog replacement search.
- Convert-to-order action writing `linkedOrderId` back.

## 4. Workflow inventory

| Workflow | Steps | Acceptance signal |
|---|---|---|
| **Add product** | Products → Add (or ⌘K) → basics/pricing/unit/inventory → auto-draft → Media Studio (search or upload) → capture attribution → crop → remove background → review original vs cutout → palette + 3 backgrounds → pick + preview mobile card → upload assets → write media/palette to Firestore → resolve validation → Publish | Trained admin publishes in ≤ 90s excluding first model load; whole image workflow happens without leaving the form |
| **Add/edit category** | Name, slug, parent, image (same provider modal), optional cutout, palette tint, description, icon, visibility, sort order → preview mirrors mobile card → save | Drag-reorder is optimistic then validated; delete blocked while products reference it |
| **Review order** | New-order indicator → open detail → verify items/address/payment/notes → confirm (optionally reserving stock) or cancel with reason → advance through preparing → ready → out_for_delivery → delivered | Pending order reaches its next valid status in ≤ 3 interactions; every transition writes an event |
| **Review voice order** | Queue → play audio with transcript + detected items → correct low-confidence items against live catalog → convert to structured order → confirm totals | Nothing auto-confirms on uncertain AI detection; `linkedOrderId` written back |
| **Stock update** | Inventory (or dashboard low-stock list) → adjust add/remove/set with reason → transactional write → immutable `inventoryMovement` appended | Stock integrity holds across order confirm/cancel; bulk CSV import shows a dry-run preview before commit |
| **Customer lookup** | Search by name/email/phone/UID → profile with order count, lifetime value, last order, addresses, status → orders, voice orders, refunds, support context | Auth-managed identity fields read-only by default; privileged edits require reason + audit entry |
| **Content management** | Offers/coupons (fixed, percentage, free delivery; validity, minimum order, usage limits, scope) · banners (image, title, CTA/deep link, audience, schedule, drag order) | Preview before publish |
| **Settings** | Store, delivery, tax, payment, app config/feature flags, integrations | Changes write audit entries |
| **RBAC** | Invite/disable staff, assign role, permission overrides | Non-admins blocked from privileged routes and Firestore writes |

## 5. Motion inventory

Budget rule: animate `transform` and `opacity`; no layout thrashing, no expensive filters on
scrolling tables; `prefers-reduced-motion` disables everything non-essential.

| Surface | Motion | Constraint |
|---|---|---|
| Sidebar | Spring width change + active-pill glide | Content reflows without jank |
| Page transition | 120–220ms fade/translate | Never animate whole data tables |
| KPI cards | Number count-up | Only after data arrives — never over a placeholder |
| Charts | Path/bar reveal | Once per data change |
| Product form | Step completion morphs to check | Driven by real validation state |
| Media processing | Stage transitions + real progress | Progress reflects actual model/upload state |
| Image search grid | Staggered 20–35ms reveal | Capped so large pages stay fast |
| Save / publish | Button morphs idle → saving → success | Driven by the real async request |
| Drag reorder | Spring lift, shadow, placeholder shift | Optimistic, then validated write |
| Command palette / drawers | Shared-layout expansion + backdrop blur | — |
| High-value success | Small cyan particles / check sweep | Publish and order-fulfilled only, never routine clicks |
| Model + chart loading | Lazy load | Background-removal model must not enter the initial dashboard bundle |

## 6. Parity checklist — 🔒 BLOCKED

PRD §23 requires listing which legacy HashmiMart features are carried forward, improved, merged or
retired, and adding any useful legacy feature missing from the PRD to the backlog. **This cannot be
produced without access to `hashmimart.vercel.app`** — filling it in from the PRD alone would be
exactly the invention §23 forbids.

Known-from-PRD anchors to verify against the live site once reachable:

| Capability | PRD status | Legacy site check |
|---|---|---|
| Voice ordering (audio → detected items) | In scope, P0 | 🔒 Confirm current flow, retention, confidence display |
| Product card display colors consumed by the mobile app | In scope, core | 🔒 Confirm the field names the app reads today |
| Category browsing / hierarchy depth | In scope, P0 | 🔒 Confirm subcategory depth actually used |
| PKR pricing, compare-at, deal badges | In scope | 🔒 Confirm tax/delivery rules in use |
| Customer accounts and addresses | In scope, P1 | 🔒 Confirm the address shape orders snapshot |
| Multi-vendor / store mode | Optional module | 🔒 Confirm whether HashmiMart actually runs multi-vendor |
| Anything else the legacy admin does | — | 🔒 **Open — this is the point of the inspection** |

## 7. Credential handling

The PRD appendix (§22) and the session message both carry live values: three image-provider API
keys, one Unsplash secret, and two reference-site passwords. Handling in this repo:

- **No credential value is written into any file here** — not in docs, not in an example env file,
  not in commit messages. The PRD PDF stays outside the repository.
- Provider keys belong in `.env.local` (git-ignored, see the root `.gitignore`) for local work and
  in the deployment provider's encrypted settings for production.
- Per PRD §10.3 and §25, treat every one of these values as **already exposed**: they were pasted
  into chat and into a shared document. Rotate or revoke all of them before production, and run a
  repository secret scan before the first deploy.
- The reference-site passwords are testing-only, for inspection. They grant no rights in this
  project and must never be reused as HashmiMart admin credentials.

## 8. Design system draft

PRD §13.1 fixes the direction; the ramps below extend it into usable tokens. Everything here is
derived from the PRD, not from a reference site — revisit after inspection.

### Brand and surface

| Token | Value | Use |
|---|---|---|
| `--brand-500` | `#06B6D4` | Primary cyan: active nav, primary buttons, focus rings, chart accent 1 |
| `--brand-600` | `#0891B2` | Hover/pressed primary |
| `--brand-700` | `#0E7490` | Text on light cyan wash where contrast demands it |
| `--brand-100` | `#CFFAFE` | Selected rows, chips, chart fill |
| `--brand-50` | `#ECFEFF` | Soft page/section background |
| `--surface` | `#FFFFFF` | Cards, tables, drawers |
| `--surface-sunken` | `#F8FAFC` | App background behind cards |
| `--text-strong` | `#0F172A` | Deep navy: headings, table primary text |
| `--text-muted` | `#64748B` | Secondary text, labels, table meta |
| `--border` | `#E2E8F0` | 1px hairlines; cyan-tinted `#CFFAFE` on active/selected |

### Status palette

Eight order states plus catalog and review states need distinguishable, labelled pills:

| State | Fill / text | Notes |
|---|---|---|
| `pending` | amber-50 / amber-700 | Needs action now — the queue's attention color |
| `confirmed` | cyan-50 / cyan-700 | Brand-adjacent, accepted |
| `preparing` | indigo-50 / indigo-700 | In progress |
| `ready` | violet-50 / violet-700 | Awaiting pickup/dispatch |
| `out_for_delivery` | blue-50 / blue-700 | In transit |
| `delivered` | emerald-50 / emerald-700 | Terminal success |
| `cancelled` | slate-100 / slate-600 | Terminal neutral |
| `refunded` | rose-50 / rose-700 | Terminal financial |
| product `draft` / `active` / `archived` | slate / emerald / slate-outline | — |
| voice `unreviewed` / `low-confidence` | amber / rose | Low confidence must be visually loud |

Never encode state by color alone — every pill carries its label, satisfying the §16.2 contrast and
accessibility criteria.

### Shape, depth, density

- Radius: **16px** cards and panels (PRD range 14–20), **12px** controls (range 10–14), **9999px** pills.
- Shadow: `0 1px 2px rgba(15,23,42,.04)` resting cards; `0 8px 24px rgba(15,23,42,.10)` floating
  layers (drawers, palette, popovers). Nothing heavier.
- Density: table row 44–48px, section padding 20–24px, form field gap 16px. Desktop-efficient,
  never cramped.
- Focus: 2px `--brand-500` ring with 2px offset, visible on every interactive element.

### Typography

One sans stack (Inter or the Next.js default `next/font` geist-style pairing), tabular numerals for
every price, quantity, stock and KPI figure so columns align. Scale: 12/13 meta, 14 body and table,
16 section title, 20–24 page title, 28–32 KPI value.

---

## 9. Gate before UI implementation

PRD §23 opens with *"Do not start the final UI implementation from the PRD alone."* That gate is
**not cleared**. Phase 0 work that does not depend on the references can proceed now — Next.js
setup, token layer, Firebase client/admin wiring, session auth, RBAC, Zod validation, repositories
and the Firestore schema — because none of it is visual design. The dashboard shell and module
screens should wait for either reference access or an explicit owner decision to proceed on the PRD
alone, recorded here.
