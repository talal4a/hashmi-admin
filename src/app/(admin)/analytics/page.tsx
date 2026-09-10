import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/admin-shell/page-header";
import { AnalyticsPageClient } from "@/components/analytics/analytics-page-client";
import { getDashboardData } from "@/server/services/analytics";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

const ALLOWED_RANGES = [7, 14, 30, 90];

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("analytics.view");
  const params = await searchParams;
  const raw = Array.isArray(params.range) ? params.range[0] : params.range;
  const range = ALLOWED_RANGES.includes(Number(raw)) ? Number(raw) : 7;

  const data = await getDashboardData(range);

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Revenue, orders, products, customers and voice-order usage — all from stored data"
      />
      <AnalyticsPageClient data={data} range={range} />
    </>
  );
}
