import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/admin-shell/page-header";
import { OrderTable } from "@/components/orders/order-table";
import { listOrders, type OrderFilters } from "@/server/repositories/orders";
import { listSocieties } from "@/server/repositories/misc";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("orders.view");
  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const filters: OrderFilters = {
    search: one("q"),
    status: (one("status") as OrderFilters["status"]) ?? "open",
    source: (one("source") as OrderFilters["source"]) ?? "all",
    paymentMethod: one("payment") ?? "all",
    society: one("society") ?? "all",
    from: one("from"),
    to: one("to"),
    minValue: one("min") ? Number(one("min")) : undefined,
    sort: (one("sort") as OrderFilters["sort"]) ?? "created_desc",
  };

  const pageIndex = Math.max(0, Number(one("page") ?? 0) || 0);

  const [page, societies] = await Promise.all([
    listOrders(filters, pageIndex, PAGE_SIZE),
    listSocieties(),
  ]);

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle={`${page.counts.open} open · ${page.counts.pending} awaiting action · ${page.counts.all} total`}
      />
      <OrderTable page={page} societies={societies} pageIndex={pageIndex} pageSize={PAGE_SIZE} />
    </>
  );
}
