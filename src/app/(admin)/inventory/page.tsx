import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require-admin";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/admin-shell/page-header";
import { InventoryView } from "@/components/inventory/inventory-view";
import { allProducts } from "@/server/repositories/products";
import { listCategories } from "@/server/repositories/categories";
import { listMovements } from "@/server/repositories/misc";

export const metadata: Metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const admin = await requirePermission("inventory.view");
  const [products, categories, movements] = await Promise.all([
    allProducts(),
    listCategories(),
    listMovements(undefined, 200),
  ]);

  const tracked = products.filter((p) => p.inventory.track);
  const attention = tracked.filter(
    (p) => p.inventory.stockOnHand <= p.inventory.lowStockThreshold,
  ).length;

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle={
          attention > 0
            ? `${attention} product${attention === 1 ? "" : "s"} at or below threshold`
            : `${tracked.length} tracked products, all above threshold`
        }
      />
      <InventoryView
        products={products}
        categories={categories}
        movements={movements}
        canWrite={can(admin, "inventory.write")}
      />
    </>
  );
}
