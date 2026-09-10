import "server-only";

import type { AppSettings, Order, OrderStatus, Product } from "@/types";
import { allOrders } from "@/server/repositories/orders";
import { allProducts, isLowStock, isOutOfStock } from "@/server/repositories/products";
import { listCategories } from "@/server/repositories/categories";
import { listCustomers, listVoiceOrders } from "@/server/repositories/misc";
import { getSettings } from "@/server/repositories/settings";

/**
 * Every figure here is derived from stored orders, products and customers.
 * Nothing is invented: where the underlying data does not exist (session or
 * conversion analytics), the value is reported as unavailable so the UI can show
 * "Not configured" instead of a number — PRD §3.2.
 */

const DAY = 86_400_000;

/** Which orders count as revenue, per the configured rule (PRD §3.1). */
function countsAsRevenue(order: Order, rule: AppSettings["analytics"]["revenueCountsFrom"]): boolean {
  if (rule === "paid") return order.paymentStatus === "paid";
  if (rule === "delivered") return order.status === "delivered";
  return order.status !== "cancelled" && order.status !== "refunded";
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface KpiValue {
  value: number | null;
  previous: number | null;
  /** Percentage change vs the previous equivalent period, null when undefined. */
  changePercent: number | null;
  configured: boolean;
}

export interface DashboardData {
  kpis: {
    revenueToday: KpiValue;
    ordersToday: KpiValue;
    averageOrderValue: KpiValue;
    pendingOrders: KpiValue;
    voicePending: KpiValue;
    lowStockProducts: KpiValue;
    activeCustomers: KpiValue;
    refundCancelRate: KpiValue;
  };
  revenueTrend: { date: string; revenue: number; orders: number }[];
  statusDistribution: { status: OrderStatus; label: string; count: number }[];
  topCategories: { id: string; name: string; revenue: number; units: number }[];
  topProducts: { id: string; name: string; revenue: number; units: number }[];
  ordersByHour: { hour: string; orders: number }[];
  sourceSplit: { source: "cart" | "voice"; label: string; count: number; revenue: number }[];
  newVsReturning: { configured: boolean; newCustomers: number; returning: number };
  lowStockRisk: {
    id: string;
    name: string;
    sku: string;
    stockOnHand: number;
    threshold: number;
    state: "low" | "out";
  }[];
  revenueRule: AppSettings["analytics"]["revenueCountsFrom"];
  sessionAnalyticsConfigured: boolean;
}

function kpi(value: number | null, previous: number | null, configured = true): KpiValue {
  const changePercent =
    value === null || previous === null || previous === 0
      ? null
      : Number((((value - previous) / previous) * 100).toFixed(1));
  return { value, previous, changePercent, configured };
}

export async function getDashboardData(rangeDays = 7): Promise<DashboardData> {
  const [orders, products, categories, customers, voiceOrders, settings] = await Promise.all([
    allOrders(),
    allProducts(),
    listCategories(),
    listCustomers(),
    listVoiceOrders(),
    getSettings(),
  ]);

  const rule = settings.analytics.revenueCountsFrom;
  const now = Date.now();
  const todayStart = startOfDay(now);
  const yesterdayStart = todayStart - DAY;

  const inRange = (order: Order, from: number, to: number) => {
    const t = new Date(order.createdAt).getTime();
    return t >= from && t < to;
  };

  const revenueOf = (list: Order[]) =>
    Number(
      list
        .filter((o) => countsAsRevenue(o, rule))
        .reduce((sum, o) => sum + o.totals.grandTotal, 0)
        .toFixed(2),
    );

  const todayOrders = orders.filter((o) => inRange(o, todayStart, now + 1));
  const yesterdayOrders = orders.filter((o) => inRange(o, yesterdayStart, todayStart));

  const revenueToday = revenueOf(todayOrders);
  const revenueYesterday = revenueOf(yesterdayOrders);

  const acceptedToday = todayOrders.filter((o) => countsAsRevenue(o, rule));
  const acceptedYesterday = yesterdayOrders.filter((o) => countsAsRevenue(o, rule));

  const aov = acceptedToday.length ? Number((revenueToday / acceptedToday.length).toFixed(2)) : null;
  const aovPrev = acceptedYesterday.length
    ? Number((revenueYesterday / acceptedYesterday.length).toFixed(2))
    : null;

  /* Revenue + order volume trend over the requested window. */
  const revenueTrend: DashboardData["revenueTrend"] = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    const from = todayStart - i * DAY;
    const to = from + DAY;
    const dayOrders = orders.filter((o) => inRange(o, from, to));
    revenueTrend.push({
      date: new Date(from).toISOString().slice(0, 10),
      revenue: revenueOf(dayOrders),
      orders: dayOrders.length,
    });
  }

  const windowFrom = todayStart - (rangeDays - 1) * DAY;
  const windowOrders = orders.filter((o) => inRange(o, windowFrom, now + 1));

  /* Status distribution across the whole book. */
  const statusLabels: Record<OrderStatus, string> = {
    pending: "Pending",
    confirmed: "Confirmed",
    preparing: "Preparing",
    ready: "Ready",
    out_for_delivery: "Out for delivery",
    delivered: "Delivered",
    cancelled: "Cancelled",
    refunded: "Refunded",
  };
  const statusDistribution = (Object.keys(statusLabels) as OrderStatus[])
    .map((status) => ({
      status,
      label: statusLabels[status],
      count: orders.filter((o) => o.status === status).length,
    }))
    .filter((s) => s.count > 0);

  /* Top products and categories by revenue in the window. */
  const productTotals = new Map<string, { name: string; revenue: number; units: number }>();
  const categoryTotals = new Map<string, { name: string; revenue: number; units: number }>();
  const productById = new Map(products.map((p) => [p.id, p]));

  for (const order of windowOrders) {
    if (!countsAsRevenue(order, rule)) continue;
    for (const item of order.items) {
      const p = productTotals.get(item.productId) ?? { name: item.name, revenue: 0, units: 0 };
      p.revenue += item.lineTotal;
      p.units += item.quantity;
      productTotals.set(item.productId, p);

      const product = productById.get(item.productId);
      if (product) {
        const category = categories.find((c) => c.id === product.categoryId);
        const key = category?.id ?? "uncategorised";
        const c = categoryTotals.get(key) ?? {
          name: category?.name ?? "Uncategorised",
          revenue: 0,
          units: 0,
        };
        c.revenue += item.lineTotal;
        c.units += item.quantity;
        categoryTotals.set(key, c);
      }
    }
  }

  const topProducts = [...productTotals.entries()]
    .map(([id, v]) => ({ id, name: v.name, revenue: Number(v.revenue.toFixed(2)), units: v.units }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  const topCategories = [...categoryTotals.entries()]
    .map(([id, v]) => ({ id, name: v.name, revenue: Number(v.revenue.toFixed(2)), units: v.units }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  /* Orders by hour, for staffing decisions. */
  const hourBuckets = new Array(24).fill(0) as number[];
  for (const order of windowOrders) hourBuckets[new Date(order.createdAt).getHours()] += 1;
  const ordersByHour = hourBuckets.map((orderCount, hour) => ({
    hour: `${String(hour).padStart(2, "0")}:00`,
    orders: orderCount,
  }));

  /* Cart vs voice orders. */
  const sourceSplit = (["cart", "voice"] as const).map((source) => {
    const list = windowOrders.filter((o) => o.source === source);
    return {
      source,
      label: source === "cart" ? "Cart orders" : "Voice orders",
      count: list.length,
      revenue: revenueOf(list),
    };
  });

  /**
   * New vs returning is only reported when order history actually distinguishes
   * them — the customer must have an order predating the window.
   */
  const customerFirstOrder = new Map<string, number>();
  for (const order of orders) {
    const uid = order.customer.uid;
    if (!uid) continue;
    const t = new Date(order.createdAt).getTime();
    const existing = customerFirstOrder.get(uid);
    if (existing === undefined || t < existing) customerFirstOrder.set(uid, t);
  }
  const windowCustomerIds = new Set(
    windowOrders.map((o) => o.customer.uid).filter((v): v is string => Boolean(v)),
  );
  let newCustomers = 0;
  let returning = 0;
  for (const uid of windowCustomerIds) {
    const first = customerFirstOrder.get(uid);
    if (first !== undefined && first >= windowFrom) newCustomers += 1;
    else returning += 1;
  }

  /* Low-stock risk list. */
  const lowStockRisk = products
    .filter((p) => p.availability.status === "active" && (isLowStock(p) || isOutOfStock(p)))
    .map((p: Product) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      stockOnHand: p.inventory.stockOnHand,
      threshold: p.inventory.lowStockThreshold,
      state: (isOutOfStock(p) ? "out" : "low") as "low" | "out",
    }))
    .sort((a, b) => a.stockOnHand - b.stockOnHand)
    .slice(0, 12);

  const eligibleForRefundRate = orders.filter((o) => o.status !== "pending").length;
  const refundedOrCancelled = orders.filter(
    (o) => o.status === "cancelled" || o.status === "refunded",
  ).length;

  const activeCustomerIds = new Set(
    windowOrders.map((o) => o.customer.uid).filter((v): v is string => Boolean(v)),
  );
  const previousWindowOrders = orders.filter((o) =>
    inRange(o, windowFrom - rangeDays * DAY, windowFrom),
  );
  const previousActiveIds = new Set(
    previousWindowOrders.map((o) => o.customer.uid).filter((v): v is string => Boolean(v)),
  );

  return {
    kpis: {
      revenueToday: kpi(revenueToday, revenueYesterday),
      ordersToday: kpi(todayOrders.length, yesterdayOrders.length),
      averageOrderValue: kpi(aov, aovPrev),
      pendingOrders: kpi(orders.filter((o) => o.status === "pending").length, null),
      voicePending: kpi(
        voiceOrders.filter((v) => v.reviewStatus === "unreviewed" || v.reviewStatus === "in_review")
          .length,
        null,
      ),
      lowStockProducts: kpi(
        products.filter((p) => p.availability.status === "active" && (isLowStock(p) || isOutOfStock(p)))
          .length,
        null,
      ),
      activeCustomers: kpi(activeCustomerIds.size, previousActiveIds.size),
      refundCancelRate: kpi(
        eligibleForRefundRate === 0
          ? null
          : Number(((refundedOrCancelled / eligibleForRefundRate) * 100).toFixed(1)),
        null,
      ),
    },
    revenueTrend,
    statusDistribution,
    topCategories,
    topProducts,
    ordersByHour,
    sourceSplit,
    newVsReturning: {
      // Only meaningful once there is order history on both sides of the window.
      configured: customers.length > 0 && orders.length > 0,
      newCustomers,
      returning,
    },
    lowStockRisk,
    revenueRule: rule,
    sessionAnalyticsConfigured: settings.analytics.sessionAnalyticsConfigured,
  };
}
