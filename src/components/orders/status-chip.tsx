import { Chip, type ChipTone } from "@/components/ui/chip";
import type { OrderStatus, PaymentStatus } from "@/types";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const TONE: Record<OrderStatus, ChipTone> = {
  pending: "warning",
  confirmed: "info",
  preparing: "violet",
  ready: "cyan",
  out_for_delivery: "info",
  delivered: "success",
  cancelled: "danger",
  refunded: "neutral",
};

export function OrderStatusChip({ status }: { status: OrderStatus }) {
  return <Chip tone={TONE[status]}>{ORDER_STATUS_LABEL[status]}</Chip>;
}

const PAYMENT_TONE: Record<PaymentStatus, ChipTone> = {
  unpaid: "warning",
  paid: "success",
  refunded: "neutral",
  partially_refunded: "neutral",
};

export function PaymentChip({ status }: { status: PaymentStatus }) {
  return <Chip tone={PAYMENT_TONE[status]}>{status.replace(/_/g, " ")}</Chip>;
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash_on_delivery: "Cash on delivery",
  jazzcash: "JazzCash",
  card: "Card",
  bank_transfer: "Bank transfer",
};
