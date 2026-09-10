import "server-only";

import type { AdminUser, InventoryMovement, MovementType, Product } from "@/types";
import { COLLECTIONS, collection, newId, nowIso } from "@/server/repositories/base";
import { appendMovement } from "@/server/repositories/misc";
import { recordAudit } from "@/server/repositories/audit";

/**
 * Stock mutations (PRD §8).
 *
 * Every change goes through here so that the product document and the immutable
 * movement record are written together: the stock write and the movement append
 * happen inside one datastore transaction on Firestore, and inside the local
 * backend's single-writer queue otherwise.
 */

export interface AdjustStockInput {
  productId: string;
  type: MovementType;
  /** For add/remove this is a delta; for `manual_set` it is the target value. */
  value: number;
  reason: string;
  orderId?: string | null;
  actor: Pick<AdminUser, "uid" | "displayName">;
}

export interface StockResult {
  before: number;
  after: number;
  delta: number;
  movementId: string;
}

export async function adjustStock(input: AdjustStockInput): Promise<StockResult> {
  if (!input.reason.trim()) throw new Error("A reason is required for every stock adjustment.");

  const products = await collection<Product>(COLLECTIONS.products);

  const outcome = await products.mutate<StockResult>(input.productId, (current) => {
    if (!current) throw new Error("That product no longer exists.");

    const before = current.inventory.stockOnHand;
    let after: number;

    switch (input.type) {
      case "manual_set":
      case "import":
        after = Math.round(input.value);
        break;
      case "manual_remove":
      case "order_fulfil":
        after = before - Math.abs(Math.round(input.value));
        break;
      default:
        after = before + Math.round(input.value);
        break;
    }

    if (after < 0) throw new Error("Stock cannot go below zero.");

    return {
      next: {
        ...current,
        inventory: { ...current.inventory, stockOnHand: after },
        updatedAt: nowIso(),
        updatedBy: input.actor.uid,
      },
      result: { before, after, delta: after - before, movementId: newId("mov") },
    };
  });

  const product = await products.get(input.productId);

  const movement: InventoryMovement = {
    id: outcome.movementId,
    productId: input.productId,
    productName: product?.name ?? input.productId,
    type: input.type,
    delta: outcome.delta,
    before: outcome.before,
    after: outcome.after,
    reason: input.reason.trim(),
    orderId: input.orderId ?? null,
    actorUid: input.actor.uid,
    actorName: input.actor.displayName,
    createdAt: nowIso(),
  };
  await appendMovement(movement);

  await recordAudit({
    actor: input.actor,
    action: "inventory.adjust",
    entityType: "product",
    entityId: input.productId,
    beforeSummary: `stock: ${outcome.before}`,
    afterSummary: `stock: ${outcome.after}`,
    reason: input.reason.trim(),
  });

  return outcome;
}

/** Reserve stock when an order is confirmed, if the setting is on (§8). */
export async function reserveStock(
  items: { productId: string; quantity: number }[],
  orderId: string,
  actor: Pick<AdminUser, "uid" | "displayName">,
): Promise<void> {
  const products = await collection<Product>(COLLECTIONS.products);
  for (const item of items) {
    await products.mutate(item.productId, (current) => {
      if (!current || !current.inventory.track) return { next: current, result: null };
      return {
        next: {
          ...current,
          inventory: {
            ...current.inventory,
            reserved: current.inventory.reserved + item.quantity,
          },
          updatedAt: nowIso(),
        },
        result: null,
      };
    });
    await appendMovement({
      id: newId("mov"),
      productId: item.productId,
      productName: (await products.get(item.productId))?.name ?? item.productId,
      type: "order_reserve",
      delta: 0,
      before: 0,
      after: 0,
      reason: `Reserved ${item.quantity} for order`,
      orderId,
      actorUid: actor.uid,
      actorName: actor.displayName,
      createdAt: nowIso(),
    });
  }
}

/** Release a reservation when an order is cancelled (§8). */
export async function releaseStock(
  items: { productId: string; quantity: number }[],
  orderId: string,
  actor: Pick<AdminUser, "uid" | "displayName">,
): Promise<void> {
  const products = await collection<Product>(COLLECTIONS.products);
  for (const item of items) {
    await products.mutate(item.productId, (current) => {
      if (!current || !current.inventory.track) return { next: current, result: null };
      return {
        next: {
          ...current,
          inventory: {
            ...current.inventory,
            reserved: Math.max(0, current.inventory.reserved - item.quantity),
          },
          updatedAt: nowIso(),
        },
        result: null,
      };
    });
    await appendMovement({
      id: newId("mov"),
      productId: item.productId,
      productName: (await products.get(item.productId))?.name ?? item.productId,
      type: "order_release",
      delta: 0,
      before: 0,
      after: 0,
      reason: `Released ${item.quantity} from cancelled order`,
      orderId,
      actorUid: actor.uid,
      actorName: actor.displayName,
      createdAt: nowIso(),
    });
  }
}

/** Consume reserved stock on delivery: reserved down, on-hand down. */
export async function fulfilStock(
  items: { productId: string; quantity: number }[],
  orderId: string,
  actor: Pick<AdminUser, "uid" | "displayName">,
  wasReserved: boolean,
): Promise<void> {
  const products = await collection<Product>(COLLECTIONS.products);
  for (const item of items) {
    const outcome = await products.mutate<{ before: number; after: number } | null>(
      item.productId,
      (current) => {
        if (!current || !current.inventory.track) return { next: current, result: null };
        const before = current.inventory.stockOnHand;
        const after = Math.max(0, before - item.quantity);
        return {
          next: {
            ...current,
            inventory: {
              ...current.inventory,
              stockOnHand: after,
              reserved: wasReserved
                ? Math.max(0, current.inventory.reserved - item.quantity)
                : current.inventory.reserved,
            },
            updatedAt: nowIso(),
          },
          result: { before, after },
        };
      },
    );

    if (!outcome) continue;
    await appendMovement({
      id: newId("mov"),
      productId: item.productId,
      productName: (await products.get(item.productId))?.name ?? item.productId,
      type: "order_fulfil",
      delta: outcome.after - outcome.before,
      before: outcome.before,
      after: outcome.after,
      reason: "Order fulfilled",
      orderId,
      actorUid: actor.uid,
      actorName: actor.displayName,
      createdAt: nowIso(),
    });
  }
}
