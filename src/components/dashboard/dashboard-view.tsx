"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  Mic,
  Package,
  Percent,
  Plus,
  Receipt,
  ShoppingBag,
  TicketPercent,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { KpiCard } from "./kpi-card";
import { formatNumber, formatPKR, formatRelative } from "@/lib/utils/format";
import type { DashboardData } from "@/server/services/analytics";
import type { AuditLogEntry, Permission } from "@/types";

const ChartFallback = ({ height }: { height: number }) => (
  <Skeleton className="w-full" style={{ height }} />
);

/* Charts stay out of the initial dashboard bundle (PRD §13.3). */
const RevenueTrendChart = dynamic(() => import("./charts").then((m) => m.RevenueTrendChart), {
  ssr: false,
  loading: () => <ChartFallback height={260} />,
});
const StatusDonut = dynamic(() => import("./charts").then((m) => m.StatusDonut), {
  ssr: false,
  loading: () => <ChartFallback height={220} />,
});
const HorizontalBars = dynamic(() => import("./charts").then((m) => m.HorizontalBars), {
  ssr: false,
  loading: () => <ChartFallback height={200} />,
});
const HourlyBars = dynamic(() => import("./charts").then((m) => m.HourlyBars), {
  ssr: false,
  loading: () => <ChartFallback height={200} />,
});
const SourceRadial = dynamic(() => import("./charts").then((m) => m.SourceRadial), {
  ssr: false,
  loading: () => <ChartFallback height={190} />,
});

const REVENUE_RULE_LABEL: Record<DashboardData["revenueRule"], string> = {
  accepted: "accepted orders",
  paid: "paid orders",
  delivered: "delivered orders",
};

export function DashboardView({
  data,
  activity,
  permissions,
  adminName,
  greeting,
  today,
}: {
  data: DashboardData;
  activity: AuditLogEntry[];
  permissions: Permission[];
  adminName: string;
  /** Both resolved on the server so the markup hydrates identically. */
  greeting: string;
  today: string;
}) {
  const reduced = useReducedMotion();
  const can = (p: Permission) => permissions.includes(p);

  const quickActions = [
    { label: "Add Product", href: "/products/new", icon: Package, permission: "products.write" as Permission },
    { label: "Add Category", href: "/categories?new=1", icon: ShoppingBag, permission: "categories.write" as Permission },
    { label: "Create Offer", href: "/offers?new=coupon", icon: TicketPercent, permission: "marketing.write" as Permission },
    { label: "Review Voice Orders", href: "/voice-orders", icon: Mic, permission: "voice.view" as Permission },
  ].filter((a) => can(a.permission));


  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] leading-tight font-bold tracking-[-0.02em] text-[var(--hm-ink-900)]">
            {greeting}, {adminName.split(" ")[0]}
          </h1>
          <p className="mt-1 text-[13px] text-[var(--hm-ink-500)]">
            {today}
            {" · Revenue counted from "}
            {REVENUE_RULE_LABEL[data.revenueRule]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickActions.slice(0, 2).map((action) => (
            <LinkButton
              key={action.href}
              href={action.href}
              variant={action.href === "/products/new" ? "primary" : "outline"}
            >
              <Plus className="size-4" />
              {action.label}
            </LinkButton>
          ))}
        </div>
      </div>

      {/* KPI row — PRD §3.1 */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard index={0} label="Revenue today" kpi={data.kpis.revenueToday} tone="cyan" icon={<Wallet className="size-4.5" />} format={(v) => formatPKR(v)} hint="vs yesterday" />
        <KpiCard index={1} label="Orders today" kpi={data.kpis.ordersToday} tone="info" icon={<Receipt className="size-4.5" />} format={(v) => formatNumber(Math.round(v))} hint="vs yesterday" />
        <KpiCard index={2} label="Average order value" kpi={data.kpis.averageOrderValue} tone="violet" icon={<TrendingUp className="size-4.5" />} format={(v) => formatPKR(v)} hint="Revenue ÷ accepted orders" />
        <KpiCard index={3} label="Pending orders" kpi={data.kpis.pendingOrders} tone="warning" icon={<ClipboardList className="size-4.5" />} format={(v) => formatNumber(Math.round(v))} hint="Need admin action now" />
        <KpiCard index={4} label="Voice orders pending" kpi={data.kpis.voicePending} tone="violet" icon={<Mic className="size-4.5" />} format={(v) => formatNumber(Math.round(v))} hint="Not yet reviewed" />
        <KpiCard index={5} label="Low-stock products" kpi={data.kpis.lowStockProducts} tone="danger" icon={<Boxes className="size-4.5" />} format={(v) => formatNumber(Math.round(v))} hint="Published, at or below threshold" />
        <KpiCard index={6} label="Active customers" kpi={data.kpis.activeCustomers} tone="success" icon={<Users className="size-4.5" />} format={(v) => formatNumber(Math.round(v))} hint="Distinct in selected period" />
        <KpiCard index={7} label="Refund / cancel rate" kpi={data.kpis.refundCancelRate} tone="navy" icon={<Percent className="size-4.5" />} format={(v) => `${v.toFixed(1)}%`} hint="Of eligible orders" />
      </div>

      {quickActions.length > 0 ? (
        <Card>
          <CardBody className="flex flex-wrap gap-2.5 py-4">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="group flex flex-1 min-w-[160px] items-center gap-3 rounded-[var(--hm-radius-control-lg)] border border-[var(--hm-border)] bg-white px-4 py-3 transition-all duration-[var(--hm-dur-fast)] hover:-translate-y-0.5 hover:border-[var(--hm-cyan-300)] hover:shadow-[var(--hm-shadow-md)]"
              >
                <span className="flex size-9 items-center justify-center rounded-[10px] bg-[var(--hm-cyan-50)] text-[var(--hm-cyan-700)] transition-colors group-hover:bg-[var(--hm-cyan-100)]">
                  <action.icon className="size-4.5" />
                </span>
                <span className="text-[13.5px] font-semibold text-[var(--hm-ink-800)]">
                  {action.label}
                </span>
              </Link>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Revenue & order volume"
            subtitle="Last 7 days, from stored orders"
            action={
              <Link
                href="/analytics"
                className="text-[12.5px] font-semibold text-[var(--hm-cyan-700)] hover:underline"
              >
                Open analytics
              </Link>
            }
          />
          <CardBody className="pt-4">
            {data.revenueTrend.every((d) => d.revenue === 0 && d.orders === 0) ? (
              <EmptyState title="No orders in this window" message="Charts appear as soon as orders come in." />
            ) : (
              <RevenueTrendChart data={data.revenueTrend} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Order status" subtitle="Across the whole book" />
          <CardBody className="pt-4">
            {data.statusDistribution.length === 0 ? (
              <EmptyState title="No orders yet" />
            ) : (
              <>
                <StatusDonut data={data.statusDistribution} />
                <ul className="mt-3 flex flex-col gap-1.5">
                  {data.statusDistribution.map((s) => (
                    <li key={s.status} className="flex items-center justify-between text-[12.5px]">
                      <span className="text-[var(--hm-ink-500)]">{s.label}</span>
                      <span className="font-bold text-[var(--hm-ink-800)] tabular-nums">{s.count}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Top categories" subtitle="By revenue, last 7 days" />
          <CardBody className="pt-4">
            {data.topCategories.length === 0 ? (
              <EmptyState title="Nothing sold yet" />
            ) : (
              <HorizontalBars data={data.topCategories} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Top products" subtitle="By revenue, last 7 days" />
          <CardBody className="pt-4">
            {data.topProducts.length === 0 ? (
              <EmptyState title="Nothing sold yet" />
            ) : (
              <HorizontalBars data={data.topProducts.slice(0, 6)} />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Cart vs voice orders" subtitle="Share of orders, last 7 days" />
          <CardBody className="pt-4">
            <SourceRadial data={data.sourceSplit} />
            <ul className="mt-2 flex flex-col gap-1.5">
              {data.sourceSplit.map((s, i) => (
                <li key={s.source} className="flex items-center justify-between text-[12.5px]">
                  <span className="flex items-center gap-1.5 text-[var(--hm-ink-500)]">
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ background: i === 0 ? "#06B6D4" : "#8B5CF6" }}
                    />
                    {s.label}
                  </span>
                  <span className="font-bold text-[var(--hm-ink-800)] tabular-nums">
                    {s.count} · {formatPKR(s.revenue)}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Orders by hour" subtitle="For staffing decisions, last 7 days" />
          <CardBody className="pt-4">
            <HourlyBars data={data.ordersByHour} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="New vs returning"
            subtitle="Customers ordering in the last 7 days"
          />
          <CardBody>
            {!data.newVsReturning.configured ? (
              <p className="text-[13px] text-[var(--hm-ink-500)]">
                Not enough order history to distinguish new from returning customers yet.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {[
                  ["New customers", data.newVsReturning.newCustomers, "var(--hm-cyan-500)"],
                  ["Returning", data.newVsReturning.returning, "var(--hm-violet-500)"],
                ].map(([label, value, color]) => {
                  const total =
                    data.newVsReturning.newCustomers + data.newVsReturning.returning || 1;
                  const pct = Math.round((Number(value) / total) * 100);
                  return (
                    <div key={String(label)}>
                      <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
                        <span className="text-[var(--hm-ink-500)]">{label}</span>
                        <span className="font-bold text-[var(--hm-ink-800)] tabular-nums">
                          {String(value)} · {pct}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[var(--hm-ink-100)]">
                        <motion.div
                          initial={reduced ? false : { width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
                          className="h-full rounded-full"
                          style={{ background: String(color) }}
                        />
                      </div>
                    </div>
                  );
                })}
                {!data.sessionAnalyticsConfigured ? (
                  <p className="mt-1 text-[11.5px] text-[var(--hm-ink-400)]">
                    Session and conversion analytics are not collected, so those metrics are not
                    shown.
                  </p>
                ) : null}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Low-stock risk"
            subtitle="Published products at or below threshold"
            action={
              can("inventory.view") ? (
                <Link
                  href="/inventory?view=low"
                  className="text-[12.5px] font-semibold text-[var(--hm-cyan-700)] hover:underline"
                >
                  Open inventory
                </Link>
              ) : null
            }
          />
          {data.lowStockRisk.length === 0 ? (
            <EmptyState title="Stock levels are healthy" message="Nothing is at or below its low-stock threshold." />
          ) : (
            <ul className="divide-y divide-[var(--hm-border)]">
              {data.lowStockRisk.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                  <AlertTriangle
                    className={
                      item.state === "out"
                        ? "size-4 shrink-0 text-[var(--hm-danger-500)]"
                        : "size-4 shrink-0 text-[var(--hm-warning-500)]"
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-[var(--hm-ink-800)]">
                      {item.name}
                    </span>
                    <span className="block text-[11.5px] text-[var(--hm-ink-500)]">
                      {item.sku} · {item.stockOnHand} in stock, threshold {item.threshold}
                    </span>
                  </span>
                  <Chip tone={item.state === "out" ? "danger" : "warning"}>
                    {item.state === "out" ? "Out" : "Low"}
                  </Chip>
                  {can("inventory.write") ? (
                    <Link
                      href={`/inventory?product=${item.id}`}
                      className="shrink-0 rounded-[9px] border border-[var(--hm-border)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--hm-ink-700)] transition-colors hover:border-[var(--hm-cyan-300)] hover:text-[var(--hm-cyan-700)]"
                    >
                      Adjust
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recent activity"
            subtitle="Product, order, stock and role changes"
            action={
              can("audit.view") ? (
                <Link
                  href="/audit"
                  className="text-[12.5px] font-semibold text-[var(--hm-cyan-700)] hover:underline"
                >
                  Full audit log
                </Link>
              ) : null
            }
          />
          {activity.length === 0 ? (
            <EmptyState title="No activity recorded yet" message="Admin actions appear here as they happen." />
          ) : (
            <ul className="divide-y divide-[var(--hm-border)]">
              {activity.slice(0, 8).map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-[var(--hm-ink-100)] text-[10.5px] font-bold text-[var(--hm-ink-700)]">
                    {entry.actorName.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-[var(--hm-ink-800)]">
                      <strong className="font-semibold">{entry.actorName}</strong>{" "}
                      <span className="text-[var(--hm-ink-500)]">{entry.action}</span>{" "}
                      <code className="rounded bg-[var(--hm-ink-100)] px-1 py-0.5 text-[11px]">
                        {entry.entityId}
                      </code>
                    </span>
                    {entry.afterSummary ? (
                      <span className="block truncate text-[11.5px] text-[var(--hm-ink-500)]">
                        {entry.beforeSummary ? `${entry.beforeSummary} → ` : ""}
                        {entry.afterSummary}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[11px] text-[var(--hm-ink-400)]">
                    {formatRelative(entry.timestamp)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
