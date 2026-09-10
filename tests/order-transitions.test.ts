import { describe, expect, it } from "vitest";
import {
  ALLOWED_TRANSITIONS,
  REASON_REQUIRED,
  canTransition,
  nextStatus,
  orderStatusSchema,
  voiceConvertSchema,
} from "@/lib/validation/order";
import type { OrderStatus } from "@/types";

const ALL: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "refunded",
];

describe("order status machine", () => {
  it("walks the happy path end to end", () => {
    const path: OrderStatus[] = [
      "pending",
      "confirmed",
      "preparing",
      "ready",
      "out_for_delivery",
      "delivered",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1]), `${path[i]} -> ${path[i + 1]}`).toBe(true);
    }
  });

  it("blocks skipping ahead", () => {
    expect(canTransition("pending", "delivered")).toBe(false);
    expect(canTransition("pending", "ready")).toBe(false);
    expect(canTransition("confirmed", "out_for_delivery")).toBe(false);
  });

  it("blocks moving backwards", () => {
    expect(canTransition("delivered", "preparing")).toBe(false);
    expect(canTransition("ready", "confirmed")).toBe(false);
  });

  it("treats cancelled and refunded as terminal", () => {
    expect(ALLOWED_TRANSITIONS.cancelled).toHaveLength(0);
    expect(ALLOWED_TRANSITIONS.refunded).toHaveLength(0);
    for (const status of ALL) {
      expect(canTransition("cancelled", status)).toBe(false);
      expect(canTransition("refunded", status)).toBe(false);
    }
  });

  it("allows cancelling from any live status but not from delivered", () => {
    for (const status of ["pending", "confirmed", "preparing", "ready", "out_for_delivery"] as const) {
      expect(canTransition(status, "cancelled"), status).toBe(true);
    }
    expect(canTransition("delivered", "cancelled")).toBe(false);
  });

  it("permits refunds only where the PRD allows them", () => {
    expect(canTransition("confirmed", "refunded")).toBe(true);
    expect(canTransition("preparing", "refunded")).toBe(true);
    expect(canTransition("delivered", "refunded")).toBe(true);
    // A pending order was never accepted, so there is nothing to refund.
    expect(canTransition("pending", "refunded")).toBe(false);
  });

  it("never lets a status transition to itself", () => {
    for (const status of ALL) {
      expect(canTransition(status, status), status).toBe(false);
    }
  });

  it("offers the correct forward step", () => {
    expect(nextStatus("pending")).toBe("confirmed");
    expect(nextStatus("out_for_delivery")).toBe("delivered");
    expect(nextStatus("delivered")).toBeNull();
    expect(nextStatus("cancelled")).toBeNull();
  });

  it("demands a reason for cancellation and refund", () => {
    expect(REASON_REQUIRED).toContain("cancelled");
    expect(REASON_REQUIRED).toContain("refunded");
    expect(REASON_REQUIRED).not.toContain("delivered");
  });
});

describe("orderStatusSchema", () => {
  it("accepts a valid transition payload", () => {
    const result = orderStatusSchema.safeParse({
      orderId: "ord-1",
      status: "confirmed",
      note: "Called the customer",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown status", () => {
    const result = orderStatusSchema.safeParse({ orderId: "ord-1", status: "shipped" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative refund amount", () => {
    const result = orderStatusSchema.safeParse({
      orderId: "ord-1",
      status: "refunded",
      refundAmount: -5,
    });
    expect(result.success).toBe(false);
  });
});

describe("voiceConvertSchema", () => {
  const base = {
    voiceOrderId: "vo-1",
    society: "DHA Phase 5",
    addressLine1: "House 12, Street 3",
    paymentMethod: "cash_on_delivery" as const,
    items: [
      {
        id: "i1",
        rawText: "do kilo tamatar",
        matchedProductId: "p-tomato",
        matchedProductName: "Fresh Tomatoes",
        quantity: 2,
        unitLabel: "1 kg",
        confidence: 0.94,
        corrected: false,
      },
    ],
  };

  it("accepts a fully matched request", () => {
    expect(voiceConvertSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an empty item list", () => {
    expect(voiceConvertSchema.safeParse({ ...base, items: [] }).success).toBe(false);
  });

  it("rejects a zero or negative quantity", () => {
    const result = voiceConvertSchema.safeParse({
      ...base,
      items: [{ ...base.items[0], quantity: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing address", () => {
    expect(voiceConvertSchema.safeParse({ ...base, addressLine1: "" }).success).toBe(false);
  });
});
