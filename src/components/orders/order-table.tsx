"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, Mic, RefreshCw, Search, ShoppingBag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input, Select } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/states";
import {
  Pagination,
  Table,
  TableCard,
  TableScroll,
  TableToolbar,
  Td,
  Th,
  Tr,
} from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";
import { formatPKR, formatRelative } from "@/lib/utils/format";
import type { OrderPage } from "@/server/repositories/orders";
import type { Society } from "@/types";
import { OrderStatusChip, PAYMENT_METHOD_LABEL, PaymentChip } from "./status-chip";

const VIEWS = [
  { key: "open", label: "Open" },
  { key: "all", label: "All" },
  { key: "pending", label: "New" },
  { key: "confirmed", label: "Confirmed" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "out_for_delivery", label: "Out for delivery" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
  { key: "refunded", label: "Refunded" },
] as const;

export function OrderTable({
  page,
  societies,
  pageIndex,
  pageSize,
}: {
  page: OrderPage;
  societies: Society[];
  pageIndex: number;
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const setParam = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      if (!("page" in updates)) next.delete("page");
      startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
    },
    [params, pathname, router],
  );

  const activeView = params.get("status") ?? "open";

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {VIEWS.map((view) => {
          const count = page.counts[view.key as keyof typeof page.counts] ?? 0;
          return (
            <button
              key={view.key}
              type="button"
              onClick={() => setParam({ status: view.key })}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors duration-[var(--hm-dur-fast)]",
                activeView === view.key
                  ? "border-[var(--hm-cyan-300)] bg-[var(--hm-cyan-50)] text-[var(--hm-cyan-800)]"
                  : "border-[var(--hm-border)] bg-white text-[var(--hm-ink-600,#475569)] hover:border-[var(--hm-cyan-200)]",
              )}
            >
              {view.label}
              {count > 0 ? (
                <span className="ml-1.5 text-[11px] opacity-70 tabular-nums">{count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <TableCard>
        <TableToolbar>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setParam({ q: search || null });
            }}
            className="relative min-w-[220px] flex-1"
          >
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--hm-ink-400)]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order number, customer, phone or item…"
              aria-label="Search orders"
              className="pl-9"
            />
            {search ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setParam({ q: null });
                }}
                aria-label="Clear search"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-[var(--hm-ink-400)] hover:text-[var(--hm-ink-700)]"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </form>

          <Button variant="outline" size="sm" onClick={() => setFiltersOpen(true)}>
            <Filter className="size-4" />
            Filters
          </Button>

          <Select
            value={params.get("source") ?? "all"}
            onChange={(e) => setParam({ source: e.target.value === "all" ? null : e.target.value })}
            aria-label="Order type"
            className="h-8 w-auto min-w-[130px] text-[12.5px]"
          >
            <option value="all">Cart and voice</option>
            <option value="cart">Cart only</option>
            <option value="voice">Voice only</option>
          </Select>

          {/* Manual refresh so new orders appear without polling the whole table. */}
          <Button variant="outline" size="sm" onClick={() => router.refresh()}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        </TableToolbar>

        {page.rows.length === 0 ? (
          <EmptyState
            title="No orders match this view"
            message="Try a different status tab, or clear the filters."
          />
        ) : (
          <>
            <TableScroll>
              <Table className="min-w-[920px]">
                <thead>
                  <tr>
                    <Th>Order</Th>
                    <Th>Customer</Th>
                    <Th>Area</Th>
                    <Th align="right">Items</Th>
                    <Th align="right">Total</Th>
                    <Th>Payment</Th>
                    <Th>Status</Th>
                    <Th>Placed</Th>
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((order) => (
                    <Tr
                      key={order.id}
                      onClick={() => router.push(`/orders/${order.id}`)}
                      className="cursor-pointer"
                    >
                      <Td>
                        <Link
                          href={`/orders/${order.id}`}
                          className="flex items-center gap-2 font-mono text-[13px] font-semibold text-[var(--hm-ink-900)] hover:text-[var(--hm-cyan-700)]"
                        >
                          {order.source === "voice" ? (
                            <span
                              title="Created from a voice order"
                              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--hm-violet-50)] text-[var(--hm-violet-700)]"
                            >
                              <Mic className="size-3" />
                            </span>
                          ) : (
                            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--hm-ink-100)] text-[var(--hm-ink-500)]">
                              <ShoppingBag className="size-3" />
                            </span>
                          )}
                          {order.displayId}
                        </Link>
                      </Td>
                      <Td>
                        <span className="block truncate text-[13px] font-medium text-[var(--hm-ink-800)]">
                          {order.customer.fullName}
                        </span>
                        <span className="block text-[11.5px] text-[var(--hm-ink-500)]">
                          {order.customer.phone}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap">{order.address.society ?? "—"}</Td>
                      <Td align="right" className="tabular-nums">
                        {order.items.reduce((s, i) => s + i.quantity, 0)}
                      </Td>
                      <Td align="right" className="font-semibold whitespace-nowrap text-[var(--hm-ink-900)]">
                        {formatPKR(order.totals.grandTotal)}
                      </Td>
                      <Td>
                        <span className="flex flex-col gap-1">
                          <span className="text-[11.5px] whitespace-nowrap text-[var(--hm-ink-500)]">
                            {PAYMENT_METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod}
                          </span>
                          <PaymentChip status={order.paymentStatus} />
                        </span>
                      </Td>
                      <Td>
                        <OrderStatusChip status={order.status} />
                      </Td>
                      <Td className="whitespace-nowrap text-[12px] text-[var(--hm-ink-500)]">
                        {formatRelative(order.createdAt)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableScroll>

            <Pagination
              page={pageIndex}
              pageSize={pageSize}
              total={page.total}
              onPage={(next) => setParam({ page: String(next) })}
            />
          </>
        )}
      </TableCard>

      <Dialog
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filter orders"
        description="Filters live in the URL, so this view can be shared with the team."
        variant="drawer"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() =>
                setParam({ payment: null, society: null, from: null, to: null, min: null, sort: null })
              }
            >
              Reset all
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>Done</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Labelled label="Payment method">
            <Select
              value={params.get("payment") ?? "all"}
              onChange={(e) => setParam({ payment: e.target.value === "all" ? null : e.target.value })}
            >
              <option value="all">Any</option>
              {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </Labelled>
          <Labelled label="Delivery area">
            <Select
              value={params.get("society") ?? "all"}
              onChange={(e) => setParam({ society: e.target.value === "all" ? null : e.target.value })}
            >
              <option value="all">All areas</option>
              {societies.map((s) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </Select>
          </Labelled>
          <div className="grid grid-cols-2 gap-3">
            <Labelled label="From">
              <Input
                type="date"
                value={params.get("from")?.slice(0, 10) ?? ""}
                onChange={(e) =>
                  setParam({ from: e.target.value ? new Date(e.target.value).toISOString() : null })
                }
              />
            </Labelled>
            <Labelled label="To">
              <Input
                type="date"
                value={params.get("to")?.slice(0, 10) ?? ""}
                onChange={(e) =>
                  setParam({
                    to: e.target.value
                      ? new Date(`${e.target.value}T23:59:59`).toISOString()
                      : null,
                  })
                }
              />
            </Labelled>
          </div>
          <Labelled label="Minimum order value">
            <Input
              type="number"
              min={0}
              value={params.get("min") ?? ""}
              onChange={(e) => setParam({ min: e.target.value || null })}
              placeholder="0"
            />
          </Labelled>
          <Labelled label="Sort">
            <Select
              value={params.get("sort") ?? "created_desc"}
              onChange={(e) => setParam({ sort: e.target.value })}
            >
              <option value="created_desc">Newest first</option>
              <option value="created_asc">Oldest first</option>
              <option value="value_desc">Highest value</option>
            </Select>
          </Labelled>
          <p className="text-[11.5px] text-[var(--hm-ink-400)]">
            <Chip tone="cyan" className="mr-1.5">Tip</Chip>
            Voice orders can be filtered from the toolbar as well.
          </p>
        </div>
      </Dialog>
    </>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold text-[var(--hm-ink-700)]">{label}</span>
      {children}
    </div>
  );
}
