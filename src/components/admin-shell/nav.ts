import type { Permission } from "@/types";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: string;
  permission: Permission;
  /** P0/P1/P2 from PRD §2.1 — used for ordering, not for hiding anything. */
  priority: "P0" | "P1" | "P2";
  badge?: "pendingOrders" | "voicePending" | "lowStock";
  description: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/** Navigation exactly as scoped in PRD §2.1. */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      {
        key: "dashboard",
        label: "Dashboard",
        href: "/dashboard",
        icon: "LayoutGrid",
        permission: "dashboard.view",
        priority: "P0",
        description: "KPIs, charts, alerts, activity and quick actions",
      },
      {
        key: "analytics",
        label: "Analytics",
        href: "/analytics",
        icon: "ChartLine",
        permission: "analytics.view",
        priority: "P1",
        description: "Revenue, orders, products, customers, voice-order usage",
      },
    ],
  },
  {
    label: "Catalog",
    items: [
      {
        key: "products",
        label: "Products",
        href: "/products",
        icon: "Package",
        permission: "products.view",
        priority: "P0",
        description: "Create, edit and archive products with the media studio",
      },
      {
        key: "categories",
        label: "Categories",
        href: "/categories",
        icon: "Tags",
        permission: "categories.view",
        priority: "P0",
        description: "Category tree, images, order and visibility",
      },
      {
        key: "inventory",
        label: "Inventory",
        href: "/inventory",
        icon: "Boxes",
        permission: "inventory.view",
        priority: "P0",
        badge: "lowStock",
        description: "Stock, low-stock alerts, adjustments and movement history",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        key: "orders",
        label: "Orders",
        href: "/orders",
        icon: "Receipt",
        permission: "orders.view",
        priority: "P0",
        badge: "pendingOrders",
        description: "Operational order queue, details, timeline, refunds",
      },
      {
        key: "voice-orders",
        label: "Voice Orders",
        href: "/voice-orders",
        icon: "Mic",
        permission: "voice.view",
        priority: "P0",
        badge: "voicePending",
        description: "Audio playback, transcript review, convert and fulfil",
      },
      {
        key: "customers",
        label: "Customers",
        href: "/customers",
        icon: "Users",
        permission: "customers.view",
        priority: "P1",
        description: "Profiles, order history, addresses and support context",
      },
      {
        key: "support",
        label: "Support",
        href: "/support",
        icon: "MessagesSquare",
        permission: "support.view",
        priority: "P2",
        description: "Issue queue and support conversation visibility",
      },
    ],
  },
  {
    label: "Merchandising",
    items: [
      {
        key: "offers",
        label: "Offers & Coupons",
        href: "/offers",
        icon: "TicketPercent",
        permission: "marketing.view",
        priority: "P1",
        description: "Promotions, discount rules and scheduling",
      },
      {
        key: "banners",
        label: "Banners & Content",
        href: "/banners",
        icon: "GalleryHorizontalEnd",
        permission: "marketing.view",
        priority: "P1",
        description: "Home hero and content scheduling and ordering",
      },
      {
        key: "vendors",
        label: "Vendors & Stores",
        href: "/vendors",
        icon: "Store",
        permission: "vendors.view",
        priority: "P1",
        description: "Vendor records, availability and assortment",
      },
      {
        key: "societies",
        label: "Delivery Areas",
        href: "/societies",
        icon: "MapPinned",
        permission: "settings.view",
        priority: "P1",
        description: "Societies, delivery fees and estimated times",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        key: "notifications",
        label: "Notifications",
        href: "/notifications",
        icon: "Bell",
        permission: "notifications.view",
        priority: "P1",
        description: "Transactional log and admin campaigns",
      },
      {
        key: "admins",
        label: "Admin Users",
        href: "/admins",
        icon: "ShieldCheck",
        permission: "admins.view",
        priority: "P0",
        description: "RBAC, staff access, invite and disable",
      },
      {
        key: "settings",
        label: "Settings",
        href: "/settings",
        icon: "Settings",
        permission: "settings.view",
        priority: "P0",
        description: "Store, delivery, tax, payment, app config, integrations",
      },
      {
        key: "audit",
        label: "Audit Log",
        href: "/audit",
        icon: "ScrollText",
        permission: "audit.view",
        priority: "P0",
        description: "Security and operational change history",
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export function navItemForPath(pathname: string): NavItem | null {
  const matches = ALL_NAV_ITEMS.filter(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  // Longest href wins so /products/new resolves to Products, not Dashboard.
  return matches.sort((a, b) => b.href.length - a.href.length)[0] ?? null;
}
