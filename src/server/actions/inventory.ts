"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertPermission } from "@/lib/auth/require-admin";
import { adjustStock } from "@/server/services/inventory";
import { allProducts, getProduct, updateProduct } from "@/server/repositories/products";
import { recordAudit } from "@/server/repositories/audit";
import { nowIso } from "@/server/repositories/base";
import { fail, failure, ok, type ActionResult } from "./result";

const adjustSchema = z.object({
  productId: z.string().min(1),
  mode: z.enum(["add", "remove", "set"]),
  amount: z.number().int("Enter a whole number").min(0),
  reason: z.string().trim().min(3, "Give a reason — it is recorded permanently"),
});

export async function adjustStockAction(
  raw: unknown,
): Promise<ActionResult<{ before: number; after: number }>> {
  try {
    const actor = await assertPermission("inventory.write");
    const parsed = adjustSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid adjustment.");

    const { productId, mode, amount, reason } = parsed.data;
    const type = mode === "add" ? "manual_add" : mode === "remove" ? "manual_remove" : "manual_set";

    const result = await adjustStock({ productId, type, value: amount, reason, actor });

    revalidatePath("/inventory");
    revalidatePath("/products");
    revalidatePath("/dashboard");

    return ok(
      { before: result.before, after: result.after },
      `Stock ${result.before} → ${result.after}`,
    );
  } catch (error) {
    return failure(error);
  }
}

const thresholdSchema = z.object({
  productId: z.string().min(1),
  threshold: z.number().int().min(0),
});

export async function setThresholdAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const actor = await assertPermission("inventory.write");
    const parsed = thresholdSchema.safeParse(raw);
    if (!parsed.success) return fail("Enter a whole number of zero or more.");

    const product = await getProduct(parsed.data.productId);
    if (!product) return fail("That product no longer exists.");

    await updateProduct(product.id, {
      inventory: { ...product.inventory, lowStockThreshold: parsed.data.threshold },
      updatedAt: nowIso(),
      updatedBy: actor.uid,
    });

    await recordAudit({
      actor,
      action: "inventory.threshold",
      entityType: "product",
      entityId: product.id,
      beforeSummary: `threshold: ${product.inventory.lowStockThreshold}`,
      afterSummary: `threshold: ${parsed.data.threshold}`,
    });

    revalidatePath("/inventory");
    return ok(undefined, "Threshold updated");
  } catch (error) {
    return failure(error);
  }
}

/* ------------------------------------------------------------------ */
/* CSV import with a dry-run preview before anything is written (§8, §18) */
/* ------------------------------------------------------------------ */

export interface ImportRow {
  line: number;
  sku: string;
  stock: number | null;
  threshold: number | null;
  productId: string | null;
  productName: string | null;
  currentStock: number | null;
  status: "ok" | "unknown_sku" | "invalid" | "unchanged";
  message: string | null;
}

export interface ImportPreview {
  rows: ImportRow[];
  applicable: number;
  problems: number;
}

/** Parses and validates the CSV without touching any data. */
export async function previewInventoryImportAction(csv: string): Promise<ActionResult<ImportPreview>> {
  try {
    await assertPermission("inventory.write");

    const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return fail("The file needs a header row and at least one data row.");

    const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
    const skuIndex = header.indexOf("sku");
    const stockIndex = header.findIndex((h) => h === "stock" || h === "stockonhand");
    const thresholdIndex = header.findIndex((h) => h === "threshold" || h === "lowstockthreshold");

    if (skuIndex === -1) return fail("The file must have a `sku` column.");
    if (stockIndex === -1 && thresholdIndex === -1) {
      return fail("The file must have a `stock` or `threshold` column.");
    }

    const products = await allProducts();
    const bySku = new Map(products.map((p) => [p.sku.toLowerCase(), p]));
    const rows: ImportRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const sku = cells[skuIndex] ?? "";
      const rawStock = stockIndex === -1 ? "" : (cells[stockIndex] ?? "");
      const rawThreshold = thresholdIndex === -1 ? "" : (cells[thresholdIndex] ?? "");

      const stock = rawStock === "" ? null : Number(rawStock);
      const threshold = rawThreshold === "" ? null : Number(rawThreshold);
      const product = bySku.get(sku.toLowerCase());

      let status: ImportRow["status"] = "ok";
      let message: string | null = null;

      if (!sku) {
        status = "invalid";
        message = "Missing SKU";
      } else if (!product) {
        status = "unknown_sku";
        message = "No product with this SKU";
      } else if (
        (stock !== null && (!Number.isInteger(stock) || stock < 0)) ||
        (threshold !== null && (!Number.isInteger(threshold) || threshold < 0))
      ) {
        status = "invalid";
        message = "Values must be whole numbers of zero or more";
      } else if (
        (stock === null || stock === product.inventory.stockOnHand) &&
        (threshold === null || threshold === product.inventory.lowStockThreshold)
      ) {
        status = "unchanged";
        message = "Already matches";
      }

      rows.push({
        line: i + 1,
        sku,
        stock,
        threshold,
        productId: product?.id ?? null,
        productName: product?.name ?? null,
        currentStock: product?.inventory.stockOnHand ?? null,
        status,
        message,
      });
    }

    return ok({
      rows,
      applicable: rows.filter((r) => r.status === "ok").length,
      problems: rows.filter((r) => r.status === "invalid" || r.status === "unknown_sku").length,
    });
  } catch (error) {
    return failure(error);
  }
}

/** Applies only the rows the preview marked applicable. */
export async function commitInventoryImportAction(
  rows: ImportRow[],
  reason: string,
): Promise<ActionResult<{ applied: number }>> {
  try {
    const actor = await assertPermission("inventory.write");
    if (!reason.trim()) return fail("Give a reason for the import — it is recorded on every movement.");

    const applicable = rows.filter((r) => r.status === "ok" && r.productId);
    let applied = 0;

    for (const row of applicable) {
      if (row.stock !== null) {
        await adjustStock({
          productId: row.productId!,
          type: "import",
          value: row.stock,
          reason: `CSV import: ${reason.trim()}`,
          actor,
        });
      }
      if (row.threshold !== null) {
        const product = await getProduct(row.productId!);
        if (product) {
          await updateProduct(product.id, {
            inventory: { ...product.inventory, lowStockThreshold: row.threshold },
            updatedAt: nowIso(),
            updatedBy: actor.uid,
          });
        }
      }
      applied += 1;
    }

    await recordAudit({
      actor,
      action: "inventory.import",
      entityType: "inventory",
      entityId: `${applied} products`,
      beforeSummary: null,
      afterSummary: `Imported stock/threshold for ${applied} products`,
      reason: reason.trim(),
    });

    revalidatePath("/inventory");
    revalidatePath("/products");
    revalidatePath("/dashboard");

    return ok({ applied }, `${applied} product${applied === 1 ? "" : "s"} updated`);
  } catch (error) {
    return failure(error);
  }
}
