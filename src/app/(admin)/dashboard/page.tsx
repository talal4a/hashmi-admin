import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require-admin";
import { effectivePermissions } from "@/lib/auth/permissions";
import { getDashboardData } from "@/server/services/analytics";
import { listAudit } from "@/server/repositories/audit";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { formatLongDate } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const admin = await requirePermission("dashboard.view");
  const [data, activity] = await Promise.all([
    getDashboardData(7),
    admin.role === "analyst" ? Promise.resolve([]) : listAudit({ limit: 12 }),
  ]);

  // Resolved here rather than during render: the server and the browser would
  // otherwise evaluate `new Date()` at different instants and, on a slow first
  // paint, in different hours — a hydration mismatch.
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <DashboardView
      data={data}
      activity={activity}
      permissions={effectivePermissions(admin)}
      adminName={admin.displayName}
      greeting={greeting}
      today={formatLongDate(now)}
    />
  );
}
