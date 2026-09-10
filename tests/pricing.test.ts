import { describe, expect, it } from "vitest";
import {
  applyOffer,
  computeTotals,
  discountPercent,
  evaluateCoupon,
  savingsAmount,
} from "@/lib/utils/pricing";
import type { Coupon, OrderItem } from "@/types";

const item = (price: number, quantity: number): OrderItem => ({
  productId: "p",
  name: "Item",
  sku: "SKU",
  unitLabel: "1 kg",
  imageUrl: null,
  price,
  quantity,
  lineTotal: Number((price * quantity).toFixed(2)),
});

const coupon = (overrides: Partial<Coupon> = {}): Coupon => ({
  id: "c1",
  code: "TEST",
  type: "percentage",
  value: 10,
  minOrderValue: null,
  maxDiscount: null,
  usageLimitTotal: null,
  usageLimitPerCustomer: null,
  usedCount: 0,
  scopeCategoryIds: [],
  scopeProductIds: [],
  startsAt: "2020-01-01T00:00:00.000Z",
  endsAt: null,
  status: "active",
  createdAt: "2020-01-01T00:00:00.000Z",
  ...overrides,
});

describe("discountPercent", () => {
  it("computes the percentage off the compare-at price", () => {
    expect(discountPercent({ price: 320, compareAtPrice: 380 })).toBe(16);
  });

  it("returns null when there is no compare-at price", () => {
    expect(discountPercent({ price: 320, compareAtPrice: null })).toBeNull();
  });

  it("returns null when compare-at is not above the selling price", () => {
    expect(discountPercent({ price: 320, compareAtPrice: 320 })).toBeNull();
    expect(discountPercent({ price: 320, compareAtPrice: 300 })).toBeNull();
  });

  it("reports the saving amount alongside", () => {
    expect(savingsAmount({ price: 320, compareAtPrice: 380 })).toBe(60);
    expect(savingsAmount({ price: 320, compareAtPrice: null })).toBeNull();
  });
});

describe("applyOffer", () => {
  it("applies a percentage discount", () => {
    expect(applyOffer(200, { discountType: "percentage", value: 12 })).toBe(176);
  });

  it("applies a fixed discount", () => {
    expect(applyOffer(200, { discountType: "fixed", value: 150 })).toBe(50);
  });

  it("never produces a negative price", () => {
    expect(applyOffer(100, { discountType: "fixed", value: 500 })).toBe(0);
  });
});

describe("evaluateCoupon", () => {
  const now = new Date("2024-06-01T12:00:00.000Z");

  it("rejects a disabled coupon", () => {
    const result = evaluateCoupon(coupon({ status: "disabled" }), 2000, now);
    expect(result.valid).toBe(false);
    expect(result.discount).toBe(0);
  });

  it("rejects a coupon that has not started", () => {
    const result = evaluateCoupon(coupon({ startsAt: "2030-01-01T00:00:00.000Z" }), 2000, now);
    expect(result).toMatchObject({ valid: false, reason: "Coupon not started" });
  });

  it("rejects an expired coupon", () => {
    const result = evaluateCoupon(coupon({ endsAt: "2024-01-01T00:00:00.000Z" }), 2000, now);
    expect(result).toMatchObject({ valid: false, reason: "Coupon expired" });
  });

  it("rejects once the total usage limit is reached", () => {
    const result = evaluateCoupon(coupon({ usageLimitTotal: 5, usedCount: 5 }), 2000, now);
    expect(result).toMatchObject({ valid: false, reason: "Usage limit reached" });
  });

  it("enforces the minimum order value", () => {
    const result = evaluateCoupon(coupon({ minOrderValue: 3000 }), 2000, now);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Minimum order");
  });

  it("caps a percentage discount at maxDiscount", () => {
    const result = evaluateCoupon(coupon({ value: 50, maxDiscount: 300 }), 2000, now);
    expect(result).toMatchObject({ valid: true, discount: 300 });
  });

  it("never discounts more than the subtotal", () => {
    const result = evaluateCoupon(coupon({ type: "fixed", value: 5000 }), 800, now);
    expect(result.discount).toBe(800);
  });

  it("flags free delivery without a monetary discount", () => {
    const result = evaluateCoupon(coupon({ type: "free_delivery", value: 0 }), 2000, now);
    expect(result).toMatchObject({ valid: true, discount: 0, freeDelivery: true });
  });
});

describe("computeTotals", () => {
  it("sums line totals and adds delivery", () => {
    const totals = computeTotals([item(120, 2), item(210, 1)], {
      deliveryFee: 100,
      taxRate: 0,
      pricesIncludeTax: true,
    });
    expect(totals.subtotal).toBe(450);
    expect(totals.grandTotal).toBe(550);
  });

  it("subtracts a discount before tax", () => {
    const totals = computeTotals([item(1000, 1)], {
      deliveryFee: 0,
      discount: 200,
      taxRate: 10,
      pricesIncludeTax: false,
    });
    expect(totals.discount).toBe(200);
    expect(totals.tax).toBe(80);
    expect(totals.grandTotal).toBe(880);
  });

  it("extracts tax from the price when prices are tax-inclusive", () => {
    const totals = computeTotals([item(110, 1)], {
      deliveryFee: 0,
      taxRate: 10,
      pricesIncludeTax: true,
    });
    expect(totals.tax).toBe(10);
    // The grand total must not add the tax again.
    expect(totals.grandTotal).toBe(110);
  });
});
