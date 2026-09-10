import type { Coupon, Offer, OrderItem, OrderTotals, ProductPricing } from "@/types";

/** Discount percentage implied by compare-at price. Returns null when there is none. */
export function discountPercent(pricing: Pick<ProductPricing, "price" | "compareAtPrice">): number | null {
  const { price, compareAtPrice } = pricing;
  if (!compareAtPrice || compareAtPrice <= price || price < 0) return null;
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}

export function savingsAmount(pricing: Pick<ProductPricing, "price" | "compareAtPrice">): number | null {
  const { price, compareAtPrice } = pricing;
  if (!compareAtPrice || compareAtPrice <= price) return null;
  return Number((compareAtPrice - price).toFixed(2));
}

export function applyOffer(price: number, offer: Pick<Offer, "discountType" | "value">): number {
  const next = offer.discountType === "percentage" ? price * (1 - offer.value / 100) : price - offer.value;
  return Number(Math.max(0, next).toFixed(2));
}

export interface CouponEvaluation {
  valid: boolean;
  reason: string | null;
  discount: number;
  freeDelivery: boolean;
}

export function evaluateCoupon(
  coupon: Coupon | null,
  subtotal: number,
  now = new Date(),
): CouponEvaluation {
  if (!coupon) return { valid: false, reason: "No coupon applied", discount: 0, freeDelivery: false };
  if (coupon.status === "disabled") return { valid: false, reason: "Coupon disabled", discount: 0, freeDelivery: false };
  if (new Date(coupon.startsAt) > now) {
    return { valid: false, reason: "Coupon not started", discount: 0, freeDelivery: false };
  }
  if (coupon.endsAt && new Date(coupon.endsAt) < now) {
    return { valid: false, reason: "Coupon expired", discount: 0, freeDelivery: false };
  }
  if (coupon.usageLimitTotal !== null && coupon.usedCount >= coupon.usageLimitTotal) {
    return { valid: false, reason: "Usage limit reached", discount: 0, freeDelivery: false };
  }
  if (coupon.minOrderValue !== null && subtotal < coupon.minOrderValue) {
    return { valid: false, reason: `Minimum order is Rs ${coupon.minOrderValue}`, discount: 0, freeDelivery: false };
  }
  if (coupon.type === "free_delivery") {
    return { valid: true, reason: null, discount: 0, freeDelivery: true };
  }
  let discount = coupon.type === "percentage" ? (subtotal * coupon.value) / 100 : coupon.value;
  if (coupon.maxDiscount !== null) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.min(discount, subtotal);
  return { valid: true, reason: null, discount: Number(discount.toFixed(2)), freeDelivery: false };
}

export function computeTotals(
  items: OrderItem[],
  opts: { deliveryFee: number; discount?: number; taxRate: number; pricesIncludeTax: boolean },
): OrderTotals {
  const subtotal = Number(items.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2));
  const discount = Number((opts.discount ?? 0).toFixed(2));
  const taxable = Math.max(0, subtotal - discount);
  const tax = opts.pricesIncludeTax
    ? Number((taxable - taxable / (1 + opts.taxRate / 100)).toFixed(2))
    : Number(((taxable * opts.taxRate) / 100).toFixed(2));
  const grandTotal = Number(
    (taxable + opts.deliveryFee + (opts.pricesIncludeTax ? 0 : tax)).toFixed(2),
  );
  return { subtotal, discount, deliveryFee: opts.deliveryFee, tax, grandTotal };
}
