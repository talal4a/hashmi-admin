import "server-only";

import { can } from "@/lib/auth/permissions";
import type { AdminUser } from "@/types";
import { OPEN_STATUSES, allOrders } from "@/server/repositories/orders";
import { allProducts, isLowStock, isOutOfStock } from "@/server/repositories/products";
import { listNotifications, listVoiceOrders } from "@/server/repositories/misc";
import type { ShellCounts } from "@/components/admin-shell/shell-context";

/** Badge counts for the sidebar and topbar; each honours the caller's role. */
export async function getShellCounts(admin: AdminUser): Promise<ShellCounts> {
  const [orders, products, voiceOrders, notifications] = await Promise.all([
    can(admin, "orders.view") ? allOrders() : Promise.resolve([]),
    can(admin, "inventory.view") ? allProducts() : Promise.resolve([]),
    can(admin, "voice.view") ? listVoiceOrders() : Promise.resolve([]),
    can(admin, "notifications.view") ? listNotifications() : Promise.resolve([]),
  ]);

  return {
    pendingOrders: orders.filter((o) => o.status === "pending" || OPEN_STATUSES.includes(o.status))
      .length,
    voicePending: voiceOrders.filter((v) => v.reviewStatus === "unreviewed" || v.reviewStatus === "in_review")
      .length,
    lowStock: products.filter((p) => isLowStock(p) || isOutOfStock(p)).length,
    unreadNotifications: notifications.filter((n) => !n.isRead).length,
  };
}
