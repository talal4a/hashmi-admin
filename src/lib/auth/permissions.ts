import type { AdminUser, Permission, Role } from "@/types";

/**
 * Role → permission matrix (PRD §10.2).
 * The server is the authority: every privileged read and write re-checks this,
 * the client only uses it to decide what to render.
 */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: [
    "dashboard.view",
    "products.view",
    "products.write",
    "products.publish",
    "categories.view",
    "categories.write",
    "orders.view",
    "orders.write",
    "orders.refund",
    "voice.view",
    "voice.write",
    "inventory.view",
    "inventory.write",
    "customers.view",
    "customers.write",
    "vendors.view",
    "vendors.write",
    "marketing.view",
    "marketing.write",
    "analytics.view",
    "notifications.view",
    "notifications.write",
    "support.view",
    "admins.view",
    "admins.write",
    "settings.view",
    "settings.write",
    "audit.view",
  ],
  catalog_manager: [
    "dashboard.view",
    "products.view",
    "products.write",
    "products.publish",
    "categories.view",
    "categories.write",
    "inventory.view",
    "inventory.write",
    "marketing.view",
    "marketing.write",
    "analytics.view",
    "vendors.view",
  ],
  order_manager: [
    "dashboard.view",
    "orders.view",
    "orders.write",
    "orders.refund",
    "voice.view",
    "voice.write",
    "inventory.view",
    "customers.view",
    "products.view",
    "notifications.view",
    "support.view",
  ],
  support_agent: [
    "dashboard.view",
    "orders.view",
    "voice.view",
    "voice.write",
    "customers.view",
    "support.view",
    "notifications.view",
    "products.view",
  ],
  analyst: ["dashboard.view", "analytics.view", "products.view", "orders.view", "customers.view"],
};

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super admin",
  catalog_manager: "Catalog manager",
  order_manager: "Order manager",
  support_agent: "Support agent",
  analyst: "Analyst",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin: "All modules, staff management, integrations, destructive settings.",
  catalog_manager: "Products, categories, media, pricing, inventory.",
  order_manager: "Orders, fulfilment, refund/cancel within limits, customers read.",
  support_agent: "Customers read, voice/support queues, limited order assistance.",
  analyst: "Read-only dashboard, analytics and export.",
};

export const ALL_ROLES = Object.keys(ROLE_PERMISSIONS) as Role[];

export function permissionsForRole(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function effectivePermissions(user: Pick<AdminUser, "role" | "permissionsOverride">): Permission[] {
  const base = permissionsForRole(user.role);
  if (!user.permissionsOverride?.length) return base;
  return Array.from(new Set([...base, ...user.permissionsOverride]));
}

export function can(
  user: Pick<AdminUser, "role" | "permissionsOverride"> | null | undefined,
  permission: Permission,
): boolean {
  if (!user) return false;
  return effectivePermissions(user).includes(permission);
}

export function canAny(
  user: Pick<AdminUser, "role" | "permissionsOverride"> | null | undefined,
  permissions: Permission[],
): boolean {
  return permissions.some((p) => can(user, p));
}
