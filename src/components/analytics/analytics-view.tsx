"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState, NotConfigured, Skeleton } from "@/components/ui/states";
import { Table, TableScroll, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";
import { formatNumber, formatPKR, formatShortDate } from "@/lib/utils/format";
import type { DashboardData } from "@/server/services/analytics";

const RevenueTrendChart = dynamic(
  () => import("@/components/dashboard/charts").then((m) => m.RevenueTrendChart),
  { ssr: false, loading: () => <Skeleton className="w-full" style={{ height: 260 }} /> },
);
const HorizontalBars = dynamic(
  () => import("@/components/dashboard/charts").then((m) => m.HorizontalBars),
  { ssr: false, loading: () => <Skeleton className="w-full" style={{ height: 200 }} /> },
);
const HourlyBars = dynamic(
  () => import("@/components/dashboard/charts").then((m) => m.HourlyBars),
  { ssr: false, loading: () => <Skeleton className="w-full" style={{ height: 200 }} /> },
);
const StatusDonut = dynamic(
  () => import("@/components/dashboard/charts").then((m) => m.StatusDonut),
  { ssr: false, loading: () => <Skeleton className="w-full" style={{ height: 220 }} /> },
);

const RANGES = [7, 14, 30, 90] as const;

export function AnalyticsView({
  data,
  range,
  onRangeChange,
}: {
  data: DashboardData;
  range: number;
  onRangeChange: (next: number) => void;
}) {
  const [exporting, setExporting] = useState(false);

  const exportCsv = () => {
    setExporting(true);
    const sections: string[] = [];

    sections.push("Revenue and orders by day");
    sections.push("date,revenue,orders");
    for (const row of data.revenueTrend) {
      sections.push(`${row.date},${row.revenue},${row.orders}`);
    }

    sections.push("");
    sections.push("Top products");
    sections.push("product,units,revenue");
    for (const row of data.topProducts) {
      sections.push(`"${row.name.replace(/"/g, '""')}",${row.units},${row.revenue}`);
    }

    sections.push("");
    sections.push("Top categories");
    sections.push("category,units,revenue");
    for (const row of data.topCategories) {
      sections.push(`"${row.name.replace(/"/g, '""')}",${row.units},${row.revenue}`);
    }

    sections.push("");
    sections.push("Order status distribution");
    sections.push("status,count");
    for (const row of data.statusDistribution) {
      sections.push(`${row.label},${row.count}`);
    }

    const blob = new Blob([sections.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hashmimart-analytics-${range}d-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  const totalRevenue = data.revenueTrend.reduce((s, r) => s + r.revenue, 0);
  const totalOrders = data.revenueTrend.reduce((s, r) => s + r.orders, 0);
  const bestDay = [...data.revenueTrend].sort((a, b) => b.revenue - a.revenue)[0];
  const peakHour = [...data.ordersByHour].sort((a, b) => b.orders - a.orders)[0];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          {RANGES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onRangeChange(value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                range === value
                  ? "border-[var(--hm-cyan-300)] bg-[var(--hm-cyan-50)] text-[var(--hm-cyan-800)]"
                  : "border-[var(--hm-border)] bg-white text-[var(--hm-ink-600,#475569)] hover:border-[var(--hm-cyan-200)]",
              )}
            >
              {value} days
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} loading={exporting} className="ml-auto">
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Metric label={`Revenue (${range}d)`} value={formatPKR(totalRevenue)} />
        <Metric label={`Orders (${range}d)`} value={formatNumber(totalOrders)} />
        <Metric
          label="Best day"
          value={
            bestDay && bestDay.revenue > 0
              ? `${formatShortDate(bestDay.date)} · ${formatPKR(bestDay.revenue)}`
              : "—"
          }
        />
        <Metric
          label="Busiest hour"
          value={peakHour && peakHour.orders > 0 ? `${peakHour.hour} · ${peakHour.orders} orders` : "—"}
        />
      </div>

      <Card>
        <CardHeader
          title="Revenue and order volume"
          subtitle={`Last ${range} days, counted from ${data.revenueRule} orders`}
        />
        <CardBody className="pt-4">
          {totalOrders === 0 ? (
            <EmptyState title="No orders in this window" />
          ) : (
            <RevenueTrendChart data={data.revenueTrend} />
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Orders by hour" subtitle="Use this to plan staffing" />
          <CardBody className="pt-4">
            <HourlyBars data={data.ordersByHour} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Order status distribution" />
          <CardBody className="pt-4">
            {data.statusDistribution.length === 0 ? (
              <EmptyState title="No orders yet" />
            ) : (
              <StatusDonut data={data.statusDistribution} />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Top products" subtitle="By revenue in this window" />
          {data.topProducts.length === 0 ? (
            <EmptyState title="Nothing sold in this window" />
          ) : (
            <>
              <CardBody className="pt-4">
                <HorizontalBars data={data.topProducts} />
              </CardBody>
              <TableScroll>
                <Table>
                  <thead>
                    <tr>
                      <Th>Product</Th>
                      <Th align="right">Units</Th>
                      <Th align="right">Revenue</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts.map((row) => (
                      <Tr key={row.id}>
                        <Td>{row.name}</Td>
                        <Td align="right" className="tabular-nums">{row.units}</Td>
                        <Td align="right" className="font-semibold whitespace-nowrap">
                          {formatPKR(row.revenue)}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableScroll>
            </>
          )}
        </Card>

        <Card>
          <CardHeader title="Top categories" subtitle="By revenue in this window" />
          {data.topCategories.length === 0 ? (
            <EmptyState title="Nothing sold in this window" />
          ) : (
            <>
              <CardBody className="pt-4">
                <HorizontalBars data={data.topCategories} />
              </CardBody>
              <TableScroll>
                <Table>
                  <thead>
                    <tr>
                      <Th>Category</Th>
                      <Th align="right">Units</Th>
                      <Th align="right">Revenue</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topCategories.map((row) => (
                      <Tr key={row.id}>
                        <Td>{row.name}</Td>
                        <Td align="right" className="tabular-nums">{row.units}</Td>
                        <Td align="right" className="font-semibold whitespace-nowrap">
                          {formatPKR(row.revenue)}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableScroll>
            </>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Voice-order usage" subtitle="How much of the book comes from voice" />
          <CardBody className="flex flex-col gap-3">
            {data.sourceSplit.map((source) => {
              const total = data.sourceSplit.reduce((s, x) => s + x.count, 0) || 1;
              const pct = Math.round((source.count / total) * 100);
              return (
                <div key={source.source}>
                  <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
                    <span className="text-[var(--hm-ink-500)]">{source.label}</span>
                    <span className="font-bold text-[var(--hm-ink-800)] tabular-nums">
                      {source.count} orders · {formatPKR(source.revenue)} · {pct}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--hm-ink-100)]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: source.source === "voice" ? "#8B5CF6" : "#06B6D4",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Session & conversion analytics"
            subtitle="Reported only when the underlying events are collected"
          />
          <CardBody className="flex flex-col gap-3 text-[13px]">
            {data.sessionAnalyticsConfigured ? (
              <p className="text-[var(--hm-ink-600,#475569)]">
                Session analytics is configured. Conversion metrics appear here once events flow in.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--hm-ink-500)]">Conversion rate</span>
                  <NotConfigured label="Conversion rate" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--hm-ink-500)]">Sessions</span>
                  <NotConfigured label="Sessions" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--hm-ink-500)]">Cart abandonment</span>
                  <NotConfigured label="Cart abandonment" />
                </div>
                <p className="mt-1 text-[12px] text-[var(--hm-ink-400)]">
                  HashmiMart does not collect session or conversion events yet, so these are shown as
                  unavailable rather than estimated. Enable session analytics in Settings once event
                  collection is in place.
                </p>
              </>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip tone="cyan">Derived from stored orders</Chip>
              <Chip tone="neutral">No estimated figures</Chip>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="hm-elevate">
      <CardBody className="p-4">
        <p className="truncate text-[19px] leading-none font-bold text-[var(--hm-ink-900)] tabular-nums">
          {value}
        </p>
        <p className="mt-1.5 text-[12px] text-[var(--hm-ink-500)]">{label}</p>
      </CardBody>
    </Card>
  );
}
