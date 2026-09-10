import { z } from "zod";
import type { OrderStatus } from "@/types";

/**
 * Order status model (PRD §7.3).
 *
 *   pending -> confirmed -> preparing -> ready -> out_for_delivery -> delivered
 *        └──────────────> cancelled
 *   confirmed / preparing / delivered -> refund workflow
 *
 * Invalid jumps are blocked rather than silently allowed.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled", "refunded"],
  preparing: ["ready", "cancelled", "refunded"],
  ready: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextStatus(from: OrderStatus): OrderStatus | null {
  const forward: Partial<Record<OrderStatus, OrderStatus>> = {
    pending: "confirmed",
    confirmed: "preparing",
    preparing: "ready",
    ready: "out_for_delivery",
    out_for_delivery: "delivered",
  };
  return forward[from] ?? null;
}

/** Statuses that require the admin to give a reason. */
export const REASON_REQUIRED: OrderStatus[] = ["cancelled", "refunded"];

export const orderStatusSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum([
    "pending",
    "confirmed",
    "preparing",
    "ready",
    "out_for_delivery",
    "delivered",
    "cancelled",
    "refunded",
  ]),
  reason: z.string().trim().max(400).optional(),
  note: z.string().trim().max(400).optional(),
  refundAmount: z.number().nonnegative().optional(),
});

export type OrderStatusInput = z.infer<typeof orderStatusSchema>;

export const orderNoteSchema = z.object({
  orderId: z.string().min(1),
  note: z.string().trim().min(1, "Write a note first").max(600),
});

export const voiceItemSchema = z.object({
  id: z.string(),
  rawText: z.string(),
  matchedProductId: z.string().nullable(),
  matchedProductName: z.string().nullable(),
  quantity: z.number().positive("Quantity must be greater than zero"),
  unitLabel: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  corrected: z.boolean(),
});

export const voiceConvertSchema = z.object({
  voiceOrderId: z.string().min(1),
  items: z.array(voiceItemSchema).min(1, "Add at least one item"),
  society: z.string().nullable(),
  addressLine1: z.string().trim().min(3, "An address is required"),
  notes: z.string().trim().max(400).optional(),
  paymentMethod: z.enum(["cash_on_delivery", "jazzcash", "card", "bank_transfer"]),
});

export type VoiceConvertInput = z.infer<typeof voiceConvertSchema>;
