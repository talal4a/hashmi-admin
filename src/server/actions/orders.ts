"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth/require-admin";
import {
  REASON_REQUIRED,
  canTransition,
  orderNoteSchema,
  orderStatusSchema,
} from "@/lib/validation/order";
import { formatPKR } from "@/lib/utils/format";
import { recordAudit } from "@/server/repositories/audit";
import { newId, nowIso } from "@/server/repositories/base";
import { getOrder, mutateOrder } from "@/server/repositories/orders";
import { saveNotification } from "@/server/repositories/misc";
import { getSettings } from "@/server/repositories/settings";
import { fulfilStock, releaseStock, reserveStock } from "@/server/services/inventory";
import type { Order, OrderEvent, OrderStatus } from "@/types";
import { fail, failure, ok, type ActionResult } from "./result";

function revalidateOrders(id?: string) {
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  if (id) revalidatePath(`/orders/${id}`);
}

/**
 * Status transitions (PRD §15 `updateOrderStatus`).
 *
 * The transition is validated, the order document and its event are written in
 * one datastore mutation, and the inventory effects follow inside the same
 * request so stock can never drift from the order book.
 */
export async function updateOrderStatusAction(raw: unknown): Promise<ActionResult<{ status: OrderStatus }>> {
  try {
    const actor = await assertPermission("orders.write");
    const parsed = orderStatusSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid status change.");

    const { orderId, status, reason, note, refundAmount } = parsed.data;

    if (status === "refunded") await assertPermission("orders.refund");
    if (REASON_REQUIRED.includes(status) && !reason?.trim()) {
      return fail(
        status === "cancelled" ? "A cancellation reason is required." : "A refund reason is required.",
      );
    }

    const settings = await getSettings();

    const outcome = await mutateOrder<
      | { ok: false; error: string }
      | {
          ok: true;
          from: OrderStatus;
          order: Order;
          reserve: boolean;
          release: boolean;
          fulfil: boolean;
          wasReserved: boolean;
        }
    >(orderId, (current) => {
      if (!current) return { next: null, result: { ok: false, error: "That order no longer exists." } };

      if (!canTransition(current.status, status)) {
        return {
          next: current,
          result: {
            ok: false,
            error: `An order that is ${current.status.replace(/_/g, " ")} cannot move to ${status.replace(/_/g, " ")}.`,
          },
        };
      }

      const event: OrderEvent = {
        id: newId("evt"),
        type: status === "refunded" ? "refund" : "status",
        from: current.status,
        to: status,
        note: note?.trim() || null,
        reason: reason?.trim() || null,
        actorUid: actor.uid,
        actorName: actor.displayName,
        createdAt: nowIso(),
      };

      const reserve =
        status === "confirmed" && settings.catalog.reserveStockOnConfirm && !current.stockReserved;
      const release = status === "cancelled" && current.stockReserved;
      const fulfil = status === "delivered";

      const next: Order = {
        ...current,
        status,
        stockReserved: reserve ? true : release || fulfil ? false : current.stockReserved,
        cancelReason: status === "cancelled" ? (reason?.trim() ?? null) : current.cancelReason,
        refundAmount:
          status === "refunded"
            ? (refundAmount ?? current.totals.grandTotal)
            : current.refundAmount,
        paymentStatus:
          status === "refunded"
            ? "refunded"
            : status === "delivered" && current.paymentMethod === "cash_on_delivery"
              ? "paid"
              : current.paymentStatus,
        updatedAt: nowIso(),
        events: [...current.events, event],
      };

      return {
        next,
        result: {
          ok: true,
          from: current.status,
          order: next,
          reserve,
          release,
          fulfil,
          wasReserved: current.stockReserved,
        },
      };
    });

    if (!outcome.ok) return fail(outcome.error);

    const items = outcome.order.items.map((i) => ({ productId: i.productId, quantity: i.quantity }));
    if (outcome.reserve) await reserveStock(items, orderId, actor);
    if (outcome.release) await releaseStock(items, orderId, actor);
    if (outcome.fulfil) await fulfilStock(items, orderId, actor, outcome.wasReserved);

    await recordAudit({
      actor,
      action: status === "refunded" ? "order.refund" : status === "cancelled" ? "order.cancel" : "order.status",
      entityType: "order",
      entityId: outcome.order.displayId,
      beforeSummary: outcome.from,
      afterSummary:
        status === "refunded"
          ? `refunded ${formatPKR(outcome.order.refundAmount ?? 0)}`
          : status,
      reason: reason?.trim() || null,
    });

    // Transactional record so the notification log reflects real activity.
    await saveNotification({
      id: newId("ntf"),
      kind: "transactional",
      audience: "customer",
      title: `Order ${outcome.order.displayId} is ${status.replace(/_/g, " ")}`,
      message:
        status === "cancelled"
          ? `Cancelled: ${reason?.trim() ?? "no reason given"}`
          : `Status updated by ${actor.displayName}`,
      orderId,
      status: "sent",
      isRead: false,
      sentAt: nowIso(),
      createdAt: nowIso(),
    });

    revalidateOrders(orderId);
    return ok({ status }, `Order ${outcome.order.displayId} is now ${status.replace(/_/g, " ")}`);
  } catch (error) {
    return failure(error);
  }
}

/** Activity notes for handoff between staff (PRD §18). */
export async function addOrderNoteAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const actor = await assertPermission("orders.write");
    const parsed = orderNoteSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid note.");

    const { orderId, note } = parsed.data;
    const result = await mutateOrder<boolean>(orderId, (current) => {
      if (!current) return { next: null, result: false };
      const event: OrderEvent = {
        id: newId("evt"),
        type: "note",
        note,
        actorUid: actor.uid,
        actorName: actor.displayName,
        createdAt: nowIso(),
      };
      return {
        next: { ...current, updatedAt: nowIso(), events: [...current.events, event] },
        result: true,
      };
    });

    if (!result) return fail("That order no longer exists.");
    revalidateOrders(orderId);
    return ok(undefined, "Note added");
  } catch (error) {
    return failure(error);
  }
}

/** Packing slip / invoice payload, rendered client-side for print (PRD §7.1). */
export async function getOrderDocumentAction(
  orderId: string,
): Promise<ActionResult<{ order: Order; storeName: string; supportPhone: string }>> {
  try {
    await assertPermission("orders.view");
    const [order, settings] = await Promise.all([getOrder(orderId), getSettings()]);
    if (!order) return fail("That order no longer exists.");
    return ok({
      order,
      storeName: settings.store.name,
      supportPhone: settings.store.supportPhone,
    });
  } catch (error) {
    return failure(error);
  }
}
