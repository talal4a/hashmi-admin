import "server-only";

import type { Order, OrderStatus } from "@/types";
import { COLLECTIONS, collection } from "./base";

export interface OrderFilters {
  search?: string;
  status?: OrderStatus | "all" | "open";
  source?: "all" | "cart" | "voice";
  paymentMethod?: string;
  society?: string;
  vendorId?: string;
  from?: string;
  to?: string;
  minValue?: number;
  sort?: "created_desc" | "created_asc" | "value_desc";
}

/** Terminal statuses never appear in the "open" operational view. */
export const OPEN_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

function matches(order: Order, filters: OrderFilters): boolean {
  const search = filters.search?.trim().toLowerCase();
  if (search) {
    const haystack = [
      order.displayId,
      order.customer.fullName,
      order.customer.phone,
      order.customer.email,
      order.address.society,
      ...order.items.map((i) => i.name),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  if (filters.status && filters.status !== "all") {
    if (filters.status === "open") {
      if (!OPEN_STATUSES.includes(order.status)) return false;
    } else if (order.status !== filters.status) {
      return false;
    }
  }
  if (filters.source && filters.source !== "all" && order.source !== filters.source) return false;
  if (filters.paymentMethod && filters.paymentMethod !== "all" && order.paymentMethod !== filters.paymentMethod) {
    return false;
  }
  if (filters.society && filters.society !== "all" && order.address.society !== filters.society) return false;
  if (filters.vendorId && filters.vendorId !== "all" && order.vendorId !== filters.vendorId) return false;
  if (filters.from && order.createdAt < filters.from) return false;
  if (filters.to && order.createdAt > filters.to) return false;
  if (filters.minValue !== undefined && order.totals.grandTotal < filters.minValue) return false;
  return true;
}

export interface OrderPage {
  rows: Order[];
  total: number;
  counts: Record<OrderStatus | "all" | "open", number>;
}

export async function listOrders(
  filters: OrderFilters = {},
  page = 0,
  pageSize = 25,
): Promise<OrderPage> {
  const col = await collection<Order>(COLLECTIONS.orders);
  const all = await col.all();
  let filtered = all.filter((o) => matches(o, filters));

  if (filters.sort === "created_asc") {
    filtered = filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } else if (filters.sort === "value_desc") {
    filtered = filtered.sort((a, b) => b.totals.grandTotal - a.totals.grandTotal);
  } else {
    filtered = filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const counts = {
    all: all.length,
    open: all.filter((o) => OPEN_STATUSES.includes(o.status)).length,
    pending: 0,
    confirmed: 0,
    preparing: 0,
    ready: 0,
    out_for_delivery: 0,
    delivered: 0,
    cancelled: 0,
    refunded: 0,
  } as Record<OrderStatus | "all" | "open", number>;
  for (const order of all) counts[order.status] += 1;

  const start = page * pageSize;
  return { rows: filtered.slice(start, start + pageSize), total: filtered.length, counts };
}

export async function getOrder(id: string): Promise<Order | null> {
  const col = await collection<Order>(COLLECTIONS.orders);
  return col.get(id);
}

export async function allOrders(): Promise<Order[]> {
  const col = await collection<Order>(COLLECTIONS.orders);
  return col.all();
}

export async function saveOrder(order: Order): Promise<Order> {
  const col = await collection<Order>(COLLECTIONS.orders);
  await col.set(order);
  return order;
}

export async function mutateOrder<R>(
  id: string,
  fn: (current: Order | null) => { next: Order | null; result: R },
): Promise<R> {
  const col = await collection<Order>(COLLECTIONS.orders);
  return col.mutate(id, fn);
}
