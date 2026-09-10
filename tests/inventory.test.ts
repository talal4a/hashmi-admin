import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Integration tests for the stock service against the real datastore.
 *
 * These exercise the same code path the admin uses, so the transactional
 * guarantees the PRD asks for (§8) are actually verified rather than assumed.
 */

const DATA_DIR = path.join(process.cwd(), ".hm-data");
const actor = { uid: "test-admin", displayName: "Test Admin" };

async function freshDatastore() {
  // Each test starts from an empty store so runs are independent.
  await fs.rm(DATA_DIR, { recursive: true, force: true });
  // The datastore caches its handle, so re-import it with a clean module graph.
  const { getDatastore, ensureSeeded, COLLECTIONS } = await import("@/server/datastore");
  await ensureSeeded();
  return { db: getDatastore(), COLLECTIONS };
}

describe("inventory service", () => {
  beforeEach(() => {
    // The datastore memoises its handle and its in-memory cache, so each test
    // needs a fresh module graph as well as a fresh directory.
    vi.resetModules();
  });

  afterEach(async () => {
    await fs.rm(DATA_DIR, { recursive: true, force: true });
  });

  it("adds stock and records a movement with before/after", async () => {
    const { db, COLLECTIONS } = await freshDatastore();
    const { adjustStock } = await import("@/server/services/inventory");
    const { listMovements } = await import("@/server/repositories/misc");

    const products = db.collection<{ id: string; inventory: { stockOnHand: number } }>(
      COLLECTIONS.products,
    );
    const before = (await products.get("p-tomato"))!.inventory.stockOnHand;

    const result = await adjustStock({
      productId: "p-tomato",
      type: "manual_add",
      value: 25,
      reason: "Supplier delivery",
      actor,
    });

    expect(result.before).toBe(before);
    expect(result.after).toBe(before + 25);
    expect(result.delta).toBe(25);

    const after = (await products.get("p-tomato"))!.inventory.stockOnHand;
    expect(after).toBe(before + 25);

    const movements = await listMovements("p-tomato");
    expect(movements[0]).toMatchObject({
      type: "manual_add",
      delta: 25,
      before,
      after: before + 25,
      reason: "Supplier delivery",
      actorName: "Test Admin",
    });
  });

  it("sets stock to an absolute value", async () => {
    await freshDatastore();
    const { adjustStock } = await import("@/server/services/inventory");

    const result = await adjustStock({
      productId: "p-tomato",
      type: "manual_set",
      value: 7,
      reason: "Stock count",
      actor,
    });
    expect(result.after).toBe(7);
  });

  it("refuses to take stock below zero", async () => {
    await freshDatastore();
    const { adjustStock } = await import("@/server/services/inventory");

    await expect(
      adjustStock({
        productId: "p-tomato",
        type: "manual_remove",
        value: 100_000,
        reason: "Written off",
        actor,
      }),
    ).rejects.toThrow(/below zero/i);
  });

  it("requires a reason for every adjustment", async () => {
    await freshDatastore();
    const { adjustStock } = await import("@/server/services/inventory");

    await expect(
      adjustStock({ productId: "p-tomato", type: "manual_add", value: 5, reason: "  ", actor }),
    ).rejects.toThrow(/reason is required/i);
  });

  it("rejects an unknown product", async () => {
    await freshDatastore();
    const { adjustStock } = await import("@/server/services/inventory");

    await expect(
      adjustStock({ productId: "does-not-exist", type: "manual_add", value: 5, reason: "x", actor }),
    ).rejects.toThrow(/no longer exists/i);
  });

  it("keeps stock consistent under concurrent adjustments", async () => {
    const { db, COLLECTIONS } = await freshDatastore();
    const { adjustStock } = await import("@/server/services/inventory");

    const products = db.collection<{ id: string; inventory: { stockOnHand: number } }>(
      COLLECTIONS.products,
    );
    const before = (await products.get("p-milk"))!.inventory.stockOnHand;

    // Twenty simultaneous +1 adjustments must not lose a single unit.
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        adjustStock({
          productId: "p-milk",
          type: "manual_add",
          value: 1,
          reason: `Concurrent ${i}`,
          actor,
        }),
      ),
    );

    const after = (await products.get("p-milk"))!.inventory.stockOnHand;
    expect(after).toBe(before + 20);
  });

  it("reserves stock on confirmation and releases it on cancellation", async () => {
    const { db, COLLECTIONS } = await freshDatastore();
    const { reserveStock, releaseStock } = await import("@/server/services/inventory");

    const products = db.collection<{ id: string; inventory: { reserved: number } }>(
      COLLECTIONS.products,
    );
    const items = [{ productId: "p-eggs", quantity: 3 }];

    await reserveStock(items, "ord-test", actor);
    expect((await products.get("p-eggs"))!.inventory.reserved).toBe(3);

    await releaseStock(items, "ord-test", actor);
    expect((await products.get("p-eggs"))!.inventory.reserved).toBe(0);
  });

  it("consumes on-hand and reserved stock together when an order is fulfilled", async () => {
    const { db, COLLECTIONS } = await freshDatastore();
    const { reserveStock, fulfilStock } = await import("@/server/services/inventory");

    const products = db.collection<{
      id: string;
      inventory: { stockOnHand: number; reserved: number };
    }>(COLLECTIONS.products);
    const before = (await products.get("p-bread"))!.inventory.stockOnHand;
    const items = [{ productId: "p-bread", quantity: 2 }];

    await reserveStock(items, "ord-test", actor);
    await fulfilStock(items, "ord-test", actor, true);

    const after = await products.get("p-bread");
    expect(after!.inventory.stockOnHand).toBe(before - 2);
    expect(after!.inventory.reserved).toBe(0);
  });

  it("writes an audit entry for every adjustment", async () => {
    await freshDatastore();
    const { adjustStock } = await import("@/server/services/inventory");
    const { listAudit } = await import("@/server/repositories/audit");

    await adjustStock({
      productId: "p-tomato",
      type: "manual_remove",
      value: 4,
      reason: "Damaged crate",
      actor,
    });

    const entries = await listAudit({ action: "inventory.adjust" });
    expect(entries[0]).toMatchObject({
      action: "inventory.adjust",
      entityId: "p-tomato",
      reason: "Damaged crate",
      actorName: "Test Admin",
    });
  });
});
