import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/require-admin";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/admin-shell/page-header";
import { OrderDetail } from "@/components/orders/order-detail";
import { getOrder } from "@/server/repositories/orders";
import { getSettings } from "@/server/repositories/settings";
import { formatDateTime } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const order = await getOrder(id);
  return { title: order ? `Order ${order.displayId}` : "Order" };
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePermission("orders.view");
  const { id } = await params;

  const [order, settings] = await Promise.all([getOrder(id), getSettings()]);
  if (!order) notFound();

  return (
    <>
      <PageHeader
        title={`Order ${order.displayId}`}
        subtitle={`${order.customer.fullName} · placed ${formatDateTime(order.createdAt)}`}
        breadcrumbs={[{ label: "Orders", href: "/orders" }, { label: order.displayId }]}
      />
      <OrderDetail
        order={order}
        canWrite={can(admin, "orders.write")}
        canRefund={can(admin, "orders.refund")}
        storeName={settings.store.name}
        supportPhone={settings.store.supportPhone}
      />
    </>
  );
}
