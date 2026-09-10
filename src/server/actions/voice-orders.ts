"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth/require-admin";
import { voiceConvertSchema } from "@/lib/validation/order";
import { computeTotals } from "@/lib/utils/pricing";
import { recordAudit } from "@/server/repositories/audit";
import { newId, nowIso } from "@/server/repositories/base";
import { saveOrder } from "@/server/repositories/orders";
import { getProduct } from "@/server/repositories/products";
import { getVoiceOrder, listSocieties, updateVoiceOrder } from "@/server/repositories/misc";
import { getSettings } from "@/server/repositories/settings";
import type { Order, OrderItem, VoiceDetectedItem, VoiceOrder } from "@/types";
import { fail, failure, ok, type ActionResult } from "./result";

function revalidateVoice(id?: string) {
  revalidatePath("/voice-orders");
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/voice-orders/${id}`);
}

/** Marks a recording as being worked on, so two staff don't duplicate effort. */
export async function claimVoiceOrderAction(id: string): Promise<ActionResult<undefined>> {
  try {
    const actor = await assertPermission("voice.write");
    const voice = await getVoiceOrder(id);
    if (!voice) return fail("That voice order no longer exists.");
    if (voice.reviewStatus === "converted") return fail("This request has already been converted.");

    await updateVoiceOrder(id, {
      reviewStatus: "in_review",
      reviewedBy: actor.uid,
      updatedAt: nowIso(),
    });
    revalidateVoice(id);
    return ok(undefined, "Marked as in review");
  } catch (error) {
    return failure(error);
  }
}

/** Saves the admin's corrections to the detected items. */
export async function saveVoiceCorrectionsAction(
  id: string,
  items: VoiceDetectedItem[],
): Promise<ActionResult<undefined>> {
  try {
    const actor = await assertPermission("voice.write");
    const voice = await getVoiceOrder(id);
    if (!voice) return fail("That voice order no longer exists.");

    await updateVoiceOrder(id, {
      detectedItems: items,
      reviewStatus: voice.reviewStatus === "unreviewed" ? "in_review" : voice.reviewStatus,
      reviewedBy: actor.uid,
      updatedAt: nowIso(),
    });

    revalidateVoice(id);
    return ok(undefined, "Corrections saved");
  } catch (error) {
    return failure(error);
  }
}

export async function rejectVoiceOrderAction(
  id: string,
  reason: string,
): Promise<ActionResult<undefined>> {
  try {
    const actor = await assertPermission("voice.write");
    if (!reason.trim()) return fail("Give a reason so the customer can be told why.");

    const voice = await getVoiceOrder(id);
    if (!voice) return fail("That voice order no longer exists.");

    await updateVoiceOrder(id, {
      reviewStatus: "rejected",
      rejectionReason: reason.trim(),
      reviewedBy: actor.uid,
      reviewedAt: nowIso(),
      updatedAt: nowIso(),
    });

    await recordAudit({
      actor,
      action: "voice.reject",
      entityType: "voiceOrder",
      entityId: voice.displayId,
      beforeSummary: voice.reviewStatus,
      afterSummary: "rejected",
      reason: reason.trim(),
    });

    revalidateVoice(id);
    return ok(undefined, "Voice request rejected");
  } catch (error) {
    return failure(error);
  }
}

/**
 * Converts a reviewed voice request into a structured order (PRD §7.2, §14.3).
 *
 * Nothing is auto-confirmed: every item must be matched to a real catalog
 * product by the admin before this succeeds, and the linked order id is written
 * back to the voice order for traceability.
 */
export async function convertVoiceOrderAction(
  raw: unknown,
): Promise<ActionResult<{ orderId: string; displayId: string }>> {
  try {
    const actor = await assertPermission("voice.write");
    await assertPermission("orders.write");

    const parsed = voiceConvertSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid conversion.");

    const { voiceOrderId, items, society, addressLine1, notes, paymentMethod } = parsed.data;

    const voice = await getVoiceOrder(voiceOrderId);
    if (!voice) return fail("That voice order no longer exists.");
    if (voice.linkedOrderId) return fail("This request has already been converted to an order.");

    const unmatched = items.filter((i) => !i.matchedProductId);
    if (unmatched.length > 0) {
      return fail(
        `${unmatched.length} item${unmatched.length === 1 ? " is" : "s are"} not matched to a catalog product yet. Match or remove them before converting.`,
      );
    }

    const [settings, societies] = await Promise.all([getSettings(), listSocieties()]);

    /* Snapshot each product so the order does not change when the catalog does. */
    const orderItems: OrderItem[] = [];
    for (const item of items) {
      const product = await getProduct(item.matchedProductId!);
      if (!product) return fail(`“${item.matchedProductName ?? item.rawText}” is no longer in the catalog.`);
      orderItems.push({
        productId: product.id,
        name: product.name,
        sku: product.sku,
        unitLabel: product.unit.label,
        imageUrl: product.media?.cutout?.url ?? product.media?.original.url ?? null,
        emojiFallback: product.emojiFallback,
        price: product.pricing.price,
        compareAtPrice: product.pricing.compareAtPrice ?? null,
        quantity: item.quantity,
        lineTotal: Number((product.pricing.price * item.quantity).toFixed(2)),
      });
    }

    const area = societies.find((s) => s.name === society);
    const subtotal = orderItems.reduce((sum, i) => sum + i.lineTotal, 0);
    const deliveryFee =
      area && area.freeDeliveryThreshold !== null && subtotal >= area.freeDeliveryThreshold
        ? 0
        : (area?.deliveryFee ?? settings.delivery.defaultFee);

    const totals = computeTotals(orderItems, {
      deliveryFee,
      taxRate: settings.tax.rate,
      pricesIncludeTax: settings.tax.pricesIncludeTax,
    });

    const now = nowIso();
    const orderId = newId("ord");
    const displayId = `HM-${Date.now().toString().slice(-6)}`;

    const order: Order = {
      id: orderId,
      displayId,
      customer: voice.customer,
      address: {
        line1: addressLine1,
        line2: null,
        society: society ?? voice.customer.society,
        city: settings.store.city,
        notes: notes?.trim() || null,
      },
      items: orderItems,
      totals,
      paymentMethod,
      paymentStatus: "unpaid",
      source: "voice",
      status: "pending",
      vendorId: null,
      couponCode: null,
      estimatedDeliveryMinutes: area?.estimatedMinutes ?? settings.delivery.defaultEtaMinutes,
      notes: notes?.trim() || null,
      cancelReason: null,
      refundAmount: null,
      stockReserved: false,
      voiceOrderId,
      createdAt: now,
      updatedAt: now,
      events: [
        {
          id: newId("evt"),
          type: "status",
          from: null,
          to: "pending",
          note: `Converted from voice request ${voice.displayId} after manual review`,
          actorUid: actor.uid,
          actorName: actor.displayName,
          createdAt: now,
        },
      ],
    };

    await saveOrder(order);

    const patch: Partial<VoiceOrder> = {
      reviewStatus: "converted",
      linkedOrderId: orderId,
      detectedItems: items,
      reviewedBy: actor.uid,
      reviewedAt: now,
      updatedAt: now,
    };
    await updateVoiceOrder(voiceOrderId, patch);

    await recordAudit({
      actor,
      action: "voice.convert",
      entityType: "voiceOrder",
      entityId: voice.displayId,
      beforeSummary: voice.reviewStatus,
      afterSummary: `converted to order ${displayId}`,
    });

    revalidateVoice(voiceOrderId);
    return ok({ orderId, displayId }, `Order ${displayId} created from ${voice.displayId}`);
  } catch (error) {
    return failure(error);
  }
}

/** Catalog search used to correct a low-confidence detection. */
export async function searchCatalogForVoiceAction(
  query: string,
): Promise<ActionResult<{ id: string; name: string; unitLabel: string; price: number; sku: string }[]>> {
  try {
    await assertPermission("voice.view");
    const trimmed = query.trim().toLowerCase();
    if (trimmed.length < 2) return ok([]);

    const { allProducts } = await import("@/server/repositories/products");
    const products = await allProducts();

    const matches = products
      .filter((p) => p.availability.status === "active")
      .filter(
        (p) =>
          p.name.toLowerCase().includes(trimmed) ||
          p.sku.toLowerCase().includes(trimmed) ||
          p.searchTokens.some((t) => t.startsWith(trimmed)),
      )
      .slice(0, 12)
      .map((p) => ({
        id: p.id,
        name: p.name,
        unitLabel: p.unit.label,
        price: p.pricing.price,
        sku: p.sku,
      }));

    return ok(matches);
  } catch (error) {
    return failure(error);
  }
}
