import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require-admin";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/admin-shell/page-header";
import { SocietiesView } from "@/components/marketing/societies-view";
import { listSocieties } from "@/server/repositories/misc";
import { allOrders } from "@/server/repositories/orders";

export const metadata: Metadata = { title: "Delivery Areas" };
export const dynamic = "force-dynamic";

export default async function SocietiesPage() {
  const admin = await requirePermission("settings.view");
  const [societies, orders] = await Promise.all([listSocieties(), allOrders()]);

  const orderCounts: Record<string, number> = {};
  for (const order of orders) {
    const key = order.address.society;
    if (key) orderCounts[key] = (orderCounts[key] ?? 0) + 1;
  }

  const active = societies.filter((s) => s.active).length;

  return (
    <>
      <PageHeader
        title="Delivery Areas"
        subtitle={`${active} accepting orders · ${societies.length} configured`}
      />
      <SocietiesView
        societies={societies}
        orderCounts={orderCounts}
        canWrite={can(admin, "settings.write")}
      />
    </>
  );
}
