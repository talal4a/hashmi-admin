"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Heart, Search, Users, X } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { Input, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";
import {
  Table,
  TableCard,
  TableScroll,
  TableToolbar,
  Td,
  Th,
  Tr,
} from "@/components/ui/table";
import { formatNumber, formatPKR, formatRelative, initials } from "@/lib/utils/format";
import type { Customer, Society } from "@/types";

export function CustomersView({
  customers,
  societies,
}: {
  customers: Customer[];
  societies: Society[];
}) {
  const [search, setSearch] = useState("");
  const [society, setSociety] = useState("all");
  const [sort, setSort] = useState<"recent" | "ltv" | "orders" | "name">("recent");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = customers
      .filter((c) => (society === "all" ? true : c.society === society))
      .filter((c) =>
        q
          ? [c.fullName, c.email, c.phone, c.uid].filter(Boolean).some((v) =>
              String(v).toLowerCase().includes(q),
            )
          : true,
      );

    return [...filtered].sort((a, b) => {
      if (sort === "ltv") return b.lifetimeValue - a.lifetimeValue;
      if (sort === "orders") return b.orderCount - a.orderCount;
      if (sort === "name") return a.fullName.localeCompare(b.fullName);
      return (b.lastOrderAt ?? "").localeCompare(a.lastOrderAt ?? "");
    });
  }, [customers, search, society, sort]);

  const totals = useMemo(
    () => ({
      count: customers.length,
      ltv: customers.reduce((s, c) => s + c.lifetimeValue, 0),
      wishlisted: customers.reduce((s, c) => s + c.wishlistProductIds.length, 0),
    }),
    [customers],
  );

  return (
    <TableCard>
      <TableToolbar>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--hm-ink-400)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone or UID…"
            aria-label="Search customers"
            className="pl-9"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-[var(--hm-ink-400)] hover:text-[var(--hm-ink-700)]"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <Select
          value={society}
          onChange={(e) => setSociety(e.target.value)}
          aria-label="Filter by area"
          className="h-8 w-auto min-w-[150px] text-[12.5px]"
        >
          <option value="all">All areas</option>
          {societies.map((s) => (
            <option key={s.id} value={s.name}>{s.name}</option>
          ))}
        </Select>

        <Select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          aria-label="Sort customers"
          className="h-8 w-auto min-w-[150px] text-[12.5px]"
        >
          <option value="recent">Most recent order</option>
          <option value="ltv">Highest lifetime value</option>
          <option value="orders">Most orders</option>
          <option value="name">Name A–Z</option>
        </Select>

        <span className="ml-auto text-[12px] text-[var(--hm-ink-500)]">
          {formatNumber(totals.count)} customers · {formatPKR(totals.ltv)} lifetime ·{" "}
          {formatNumber(totals.wishlisted)} wishlisted items
        </span>
      </TableToolbar>

      {rows.length === 0 ? (
        <EmptyState
          title="No customers match"
          message="Adjust the search or area filter."
          icon={<Users className="size-5" />}
        />
      ) : (
        <TableScroll>
          <Table className="min-w-[880px]">
            <thead>
              <tr>
                <Th>Customer</Th>
                <Th>Contact</Th>
                <Th>Area</Th>
                <Th align="right">Orders</Th>
                <Th align="right">Lifetime value</Th>
                <Th align="right">Wishlist</Th>
                <Th>Last order</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((customer) => (
                <Tr key={customer.uid}>
                  <Td>
                    <Link href={`/customers/${customer.uid}`} className="flex items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--hm-cyan-100)] text-[11px] font-bold text-[var(--hm-cyan-800)]">
                        {initials(customer.fullName)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-[var(--hm-ink-900)] hover:text-[var(--hm-cyan-700)]">
                          {customer.fullName}
                        </span>
                        <span className="block font-mono text-[10.5px] text-[var(--hm-ink-400)]">
                          {customer.uid}
                        </span>
                      </span>
                    </Link>
                  </Td>
                  <Td className="text-[12px] text-[var(--hm-ink-500)]">
                    {customer.phone}
                    {customer.email ? <><br />{customer.email}</> : null}
                  </Td>
                  <Td className="whitespace-nowrap">{customer.society ?? "—"}</Td>
                  <Td align="right" className="tabular-nums">{customer.orderCount}</Td>
                  <Td align="right" className="font-semibold whitespace-nowrap text-[var(--hm-ink-900)]">
                    {formatPKR(customer.lifetimeValue)}
                  </Td>
                  <Td align="right">
                    {customer.wishlistProductIds.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[var(--hm-ink-600,#475569)] tabular-nums">
                        <Heart className="size-3.5 text-[var(--hm-danger-500)]" />
                        {customer.wishlistProductIds.length}
                      </span>
                    ) : (
                      <span className="text-[var(--hm-ink-300)]">—</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-[12px] text-[var(--hm-ink-500)]">
                    {formatRelative(customer.lastOrderAt)}
                  </Td>
                  <Td>
                    <Chip tone={customer.status === "active" ? "success" : "danger"}>
                      {customer.status}
                    </Chip>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableScroll>
      )}
    </TableCard>
  );
}
