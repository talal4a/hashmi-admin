# Reference-Site Inspection Report (PRD §23)

Performed before implementation, as PRD §23 requires. Both reference sites were
inspected from this environment on 10 September 2026.

| Reference | URL | Access result |
| --- | --- | --- |
| Comanda POS | `https://pos-eight-silk.vercel.app/index.php` | **Signed in successfully.** Full server-rendered HTML of every module inspected, plus the complete CSS token/component layer. |
| HashmiMart (existing) | `https://hashmimart.vercel.app/` | **Partially inspected.** The site is a client-rendered SPA; headless-browser navigation could not complete from this environment (the egress relay closed every TLS tunnel to the host after ~6s, so no page ever rendered). Inventory below was therefore derived by static analysis of the site's own publicly served JavaScript bundle, which contains the admin route table, role matrix, domain model and UI copy. No customer data was read and the site's backend was not queried. |

Recorded per PRD §23: where a reference could not be fully opened, the fact is
recorded rather than inventing unseen detail.

---

## 1. Navigation map

### 1.1 Comanda POS (visual/interaction reference)

Sidebar is grouped under section labels, with an expandable submenu group and a
count badge on Orders.

| Group | Items |
| --- | --- |
| Overview | Dashboard, Orders (submenu: Invoice Search), Customers |
| Products | Categories, Items |
| Finance | Expenses, Receivables, PLS & Reports |
| System | Users, Settings, My Profile |

Top bar: sidebar collapse toggle, global search ("Search orders, customers,
items…"), primary action button (New Order), notification bell with unread
count and dropdown feed, user menu with avatar initials + role.

### 1.2 HashmiMart existing admin (functional-parity reference)

Route table read directly from the bundle: `/admin/:section` with a horizontal
tab nav rather than a sidebar.

| Key | Path | Label |
| --- | --- | --- |
| `orders` | `/admin/orders` | Orders |
| `products` | `/admin/products` | Products |
| `productCategories` | `/admin/product-categories` | Product Categories |
| `discounts` | `/admin/discounts` | Discounts |
| `societies` | `/admin/societies` | Societies |
| `wishlist` | `/admin/wishlist` | Wishlist (with count badge) |

Role matrix in the bundle:

| Role | Sections |
| --- | --- |
| `superadmin` | orders, products, productCategories, discounts, societies, wishlist |
| `ordermanager` | orders only |
| `user` | no admin access |

Header treatment: `Dashboard` / "Manage your store orders, products & more".

---

## 2. Component inventory

### 2.1 Comanda POS

| Component | Observed behaviour |
| --- | --- |
| Stat card | Icon tile (tinted square, 44px, 12px radius), large figure, label, 7-point sparkline canvas; hover lifts `translateY(-2px)` and deepens shadow. |
| Card | White, 1px very-light border, 18px radius, `shadow-xs`; header row with title + sub + right-aligned action. |
| Table card | Toolbar (title/sub + actions) above a `table-responsive-wrap`; `table-stack` collapses to labelled rows on mobile via `data-label`. |
| Status chip | Pill, 0.72rem, uppercase, 700 weight, tinted background + darker text. Variants: new, preparing, ready, served, cancelled, plus semantic accent/navy/success/warning/danger/info/neutral. |
| Type tag | Bordered small tag with icon — dine-in / takeaway / delivery, each with its own border+bg+text triple. |
| Search field | Icon-prefixed input; password variant has a show/hide toggle button. |
| Modals | Bootstrap dialogs for Delete X, Order Details, Take Payment, Move to Khata (Credit), Record Repayment, Import preview. |
| Import/Export | Every list module ships Export Excel + Import Excel with a **Preview** step before Import commits. |
| Notification dropdown | 360px panel, head with unread badge + "Mark all as read", per-item icon tile, title, relative date, footer "View all activity". |
| Empty states | Explicit per-module copy ("No orders match your criteria."). |
| Pagination | Server-rendered list pages with search + status select filters. |

Design tokens read from the reference's own `variables.css` (recorded for
contrast, **not** reused — HashmiMart gets its own scale): navy 950→100 sidebar
ramp, paper `#f4f5fa` canvas, ink 900→100 text/border ramp, orange accent
`#ff6a2b`, success/warning/danger/info triples, Sora display + Inter body +
JetBrains Mono numerals, radius 4/8/12/18/999, four-step shadow scale, sidebar
264px → 88px collapsed, topbar 76px, 150ms/260ms durations on
`cubic-bezier(.4,0,.2,1)`, and a `prefers-reduced-motion` block that zeroes all
durations.

### 2.2 HashmiMart existing

Product card (emoji fallback + image, price with struck-through original and
sale price, discount chip, out-of-stock badge, quantity stepper), admin product
card with icon buttons, admin stats row, admin pill filters, admin order card
with a voice box, order status page, notification cards (unread dot, delete),
support chat bubbles with voice recording, hero slider with counter, install
prompt, spotlight onboarding tooltip, wishlist, society selector at checkout.

---

## 3. Workflow inventory

| Workflow | Comanda POS | HashmiMart existing |
| --- | --- | --- |
| Add/edit product | Items list → Add Item modal → image, name, category, price, stock, status | Admin Products → create/edit with name, category (retail/wholesale mode), product category, price, sale price, unit, stock, image URL, description, wholesale option ladder, in-stock toggle |
| Add/edit category | Categories → Add Category; delete blocked/confirmed | Product Categories CRUD; "Cannot delete: category has products" |
| Order management | Orders list with status filter + search, stat row (New / In Progress / Completed / Delivery), order details modal, status update, Take Payment, Move to Khata (credit), delete | Orders list with pill filters, status set `pending → confirmed → delivered`, `cancelled`; voice orders flagged with audio playback |
| Stock update | Item stock column, inline edit | In-stock toggle ("Mark In Stock") on admin product card |
| Customer lookup | Customers list: Name, Email, Phone, Orders, Total Spent, Type; stats Total/New this month/VIP/Total spent | Profiles table; customer snapshot carried on the order (name, phone, society, address) |
| Content/offers | — | Discounts module (percentage / amount), sale price on product |
| Delivery config | Settings: currency, tax rate, service charge, discount rate, delivery fee, timezone, default order type, notification toggles | Societies (delivery areas) picked at checkout; delivery charges; estimated delivery minutes |
| Finance | Expenses, Receivables (khata/credit), P&L reports with Monthly/Quarterly/Yearly and saved reports | — |
| Users | Users list with role, joined, status; add/delete | Role matrix superadmin / ordermanager / user |

---

## 4. Motion inventory

Where motion earns its place in the HashmiMart admin:

| Surface | Motion |
| --- | --- |
| Sidebar | Spring width change 264→88px; active pill glides between items (shared layout id); labels fade out on collapse. |
| Page transition | 120–220ms fade + 4px translate on route change. |
| KPI cards | Count-up only after real data resolves; hover lift. |
| Charts | One reveal per data change; skipped under reduced motion. |
| Tables | Rows do not animate in bulk; only the changed row flashes on optimistic update. |
| Image search grid | Staggered 20–35ms reveal, capped at the first ~24 cards. |
| Media processing | Real staged progress (download → cutout → palette → upload), never a fake timer. |
| Save/publish | Button morphs idle → saving → success, driven by the actual request. |
| Drag reorder | Spring lift + shadow + placeholder shift for categories and banners. |
| Command palette / drawers | Shared-layout expansion with backdrop blur. |
| Success burst | Small cyan check sweep on publish and order-fulfilled only. |
| Reduced motion | A global media query zeroes durations, as the reference itself does. |

---

## 5. Parity checklist — legacy HashmiMart features

| Legacy feature | Decision |
| --- | --- |
| Orders + status set (pending/confirmed/delivered/cancelled) | **Carried forward and improved** — extended to the PRD's `pending → confirmed → preparing → ready → out_for_delivery → delivered` plus `cancelled`/`refunded`, with a constrained transition map and an event timeline. |
| Voice orders (`is_voice_order`, `audio_url`) | **Carried forward and improved** — dedicated queue, waveform player, transcript, detected items with confidence, correction, conversion to a structured order. |
| Products with retail/wholesale modes and wholesale option ladders | **Carried forward** — kept as a shopping-mode field plus a wholesale quantity ladder on the product. |
| Product categories | **Carried forward and improved** — adds parent/child tree, drag ordering, media + palette, counts, delete guard. |
| Discounts | **Merged** into Offers & Coupons (fixed / percentage / free delivery, scope, schedule, usage limits). |
| Societies (delivery areas) | **Carried forward** — kept as its own module under Delivery, and surfaced as an order filter. |
| Wishlist (admin view with badge) | **Carried forward** — as a demand-signal report inside Customers/Analytics rather than its own top-level nav item. |
| Notifications with `audience: staff \| customer`, unread state | **Carried forward** — transactional log plus admin campaigns. |
| Support chat / conversations + voice notes | **Carried forward** — Support module (P2), read-only conversation visibility. |
| Emoji product image fallback | **Carried forward** — used as the fallback tile when a product has no media. |
| Payment methods: Cash on Delivery, JazzCash | **Carried forward** — payment method on the order and in settings. |
| Profiles (name, phone, addresses) | **Carried forward** — Customers module; identity fields read-only. |
| PWA install prompt, hero slider, spotlight onboarding | **Out of scope for admin** — storefront concerns; the hero slider is administered through the Banners module. |
| Khata / receivables, expenses, P&L (Comanda only) | **Intentionally retired** — restaurant-POS finance features outside this PRD's grocery-admin scope. |
| Dine-in / table orders (Comanda only) | **Intentionally retired** — not a grocery delivery concept. |

---

## 6. What HashmiMart's admin takes from each

- **From Comanda:** the shell proportions (fixed collapsible sidebar, sticky
  topbar, section-labelled nav), the stat-card anatomy, the toolbar-above-table
  pattern, the chip/tag vocabulary, the confirm-before-destructive rule, and the
  import **preview-before-commit** step.
- **From HashmiMart:** every domain concept and every piece of terminology —
  societies, shopping modes, wholesale ladders, voice orders, PKR formatting.
- **Original to HashmiMart admin:** the cyan/deep-navy palette, the type scale,
  spacing, radii, motion system and component architecture. Neither reference's
  code, assets or branding is copied.
