"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertPermission } from "@/lib/auth/require-admin";
import { buildSearchTokens } from "@/lib/utils/format";
import {
  bulkActionSchema,
  productDraftSchema,
  productPublishSchema,
  type ProductDraftInput,
} from "@/lib/validation/product";
import { recordAudit } from "@/server/repositories/audit";
import {
  allProducts,
  deleteProduct,
  getProduct,
  saveProduct,
  skuExists,
  slugExists,
  updateProduct,
} from "@/server/repositories/products";
import { newId, nowIso } from "@/server/repositories/base";
import { formatPKR } from "@/lib/utils/format";
import type { AdminUser, Product } from "@/types";
import { fail, failure, ok, type ActionResult } from "./result";

const CATALOG_PATHS = ["/products", "/categories", "/inventory", "/dashboard"];

function revalidateCatalog() {
  for (const path of CATALOG_PATHS) revalidatePath(path);
}

function toProduct(input: ProductDraftInput, existing: Product | null, actor: AdminUser): Product {
  const now = nowIso();
  const status = input.availability.status;
  return {
    id: existing?.id ?? input.id ?? newId("p"),
    name: input.name,
    slug: input.slug,
    sku: input.sku,
    barcode: input.barcode ?? null,
    brand: input.brand ?? null,
    description: input.description ?? null,
    categoryId: input.categoryId,
    subcategoryId: input.subcategoryId ?? null,
    shoppingMode: input.shoppingMode,
    wholesaleOptions: input.wholesaleOptions,
    tags: input.tags,
    searchTokens: buildSearchTokens(
      input.name,
      input.sku,
      input.brand,
      input.barcode,
      ...input.tags,
      ...input.merchandising.searchKeywords,
    ),
    emojiFallback: input.emojiFallback ?? null,
    unit: input.unit,
    pricing: {
      price: input.pricing.price,
      compareAtPrice: input.pricing.compareAtPrice ?? null,
      cost: input.pricing.cost ?? null,
      currency: "PKR",
      taxBehavior: input.pricing.taxBehavior,
    },
    inventory: input.inventory,
    media: input.media,
    merchandising: input.merchandising,
    availability: {
      status,
      // publishedAt is stamped once, the first time the product goes live.
      publishedAt:
        status === "active"
          ? (existing?.availability.publishedAt ?? now)
          : (existing?.availability.publishedAt ?? null),
      scheduledPublishAt: input.availability.scheduledPublishAt ?? null,
      vendorIds: input.availability.vendorIds,
    },
    seo: input.seo,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    createdBy: existing?.createdBy ?? actor.uid,
    updatedBy: actor.uid,
  };
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Draft save is always allowed; publish runs the stricter schema first (§4.3). */
export async function saveProductAction(
  raw: unknown,
  intent: "draft" | "publish" | "update",
): Promise<ActionResult<{ id: string; status: Product["availability"]["status"] }>> {
  try {
    const actor = await assertPermission("products.write");
    if (intent === "publish") await assertPermission("products.publish");

    const schema = intent === "publish" ? productPublishSchema : productDraftSchema;
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return fail(
        intent === "publish"
          ? "This product can't be published yet — resolve the highlighted fields."
          : "Some fields need attention before saving.",
        fieldErrorsFrom(parsed.error),
      );
    }

    const input = parsed.data as ProductDraftInput;
    const existing = input.id ? await getProduct(input.id) : null;

    if (await slugExists(input.slug, existing?.id)) {
      return fail("That slug is already used by another product.", { slug: "Slug must be unique" });
    }
    if (await skuExists(input.sku, existing?.id)) {
      return fail("That SKU is already used by another product.", { sku: "SKU must be unique" });
    }

    const next = toProduct(
      {
        ...input,
        availability: {
          ...input.availability,
          status: intent === "publish" ? "active" : input.availability.status,
        },
      },
      existing,
      actor,
    );

    await saveProduct(next);

    await recordAudit({
      actor,
      action: existing ? (intent === "publish" ? "product.publish" : "product.update") : "product.create",
      entityType: "product",
      entityId: next.id,
      beforeSummary: existing
        ? `${existing.availability.status} · ${formatPKR(existing.pricing.price)} · stock ${existing.inventory.stockOnHand}`
        : null,
      afterSummary: `${next.availability.status} · ${formatPKR(next.pricing.price)} · stock ${next.inventory.stockOnHand}`,
    });

    // A price change is separately auditable (PRD §10.3).
    if (existing && existing.pricing.price !== next.pricing.price) {
      await recordAudit({
        actor,
        action: "price.change",
        entityType: "product",
        entityId: next.id,
        beforeSummary: formatPKR(existing.pricing.price),
        afterSummary: formatPKR(next.pricing.price),
      });
    }

    revalidateCatalog();
    revalidatePath(`/products/${next.id}`);

    return ok(
      { id: next.id, status: next.availability.status },
      intent === "publish" ? "Product published" : existing ? "Changes saved" : "Draft saved",
    );
  } catch (error) {
    return failure(error);
  }
}

export async function archiveProductAction(
  id: string,
  reason: string,
): Promise<ActionResult<undefined>> {
  try {
    const actor = await assertPermission("products.write");
    const product = await getProduct(id);
    if (!product) return fail("That product no longer exists.");

    // Soft delete: archive rather than irreversibly removing (PRD §18).
    await updateProduct(id, {
      availability: { ...product.availability, status: "archived" },
      updatedAt: nowIso(),
      updatedBy: actor.uid,
    });

    await recordAudit({
      actor,
      action: "product.archive",
      entityType: "product",
      entityId: id,
      beforeSummary: product.availability.status,
      afterSummary: "archived",
      reason: reason || null,
    });

    revalidateCatalog();
    return ok(undefined, `${product.name} archived`);
  } catch (error) {
    return failure(error);
  }
}

export async function deleteProductAction(
  id: string,
  reason: string,
): Promise<ActionResult<undefined>> {
  try {
    const actor = await assertPermission("products.publish");
    const product = await getProduct(id);
    if (!product) return fail("That product no longer exists.");
    if (product.availability.status !== "archived") {
      return fail("Archive the product before deleting it permanently.");
    }

    await deleteProduct(id);
    await recordAudit({
      actor,
      action: "product.delete",
      entityType: "product",
      entityId: id,
      beforeSummary: `${product.name} (${product.sku})`,
      afterSummary: "deleted",
      reason: reason || null,
    });

    revalidateCatalog();
    return ok(undefined, `${product.name} deleted`);
  } catch (error) {
    return failure(error);
  }
}

export async function bulkProductAction(raw: unknown): Promise<ActionResult<{ affected: number }>> {
  try {
    const actor = await assertPermission("products.write");
    const parsed = bulkActionSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid bulk action.");

    const { ids, action, categoryId, threshold } = parsed.data;
    if (action === "publish") await assertPermission("products.publish");
    if (action === "move_category" && !categoryId) return fail("Choose a destination category.");
    if (action === "set_threshold" && threshold === undefined) {
      return fail("Enter a low-stock threshold.");
    }

    const products = await allProducts();
    const selected = products.filter((p) => ids.includes(p.id));
    let affected = 0;

    for (const product of selected) {
      const patch: Partial<Product> = { updatedAt: nowIso(), updatedBy: actor.uid };

      switch (action) {
        case "publish":
          patch.availability = {
            ...product.availability,
            status: "active",
            publishedAt: product.availability.publishedAt ?? nowIso(),
          };
          break;
        case "unpublish":
          patch.availability = { ...product.availability, status: "draft" };
          break;
        case "archive":
          patch.availability = { ...product.availability, status: "archived" };
          break;
        case "restore":
          patch.availability = { ...product.availability, status: "draft" };
          break;
        case "move_category":
          patch.categoryId = categoryId;
          break;
        case "set_threshold":
          patch.inventory = { ...product.inventory, lowStockThreshold: threshold! };
          break;
        case "feature":
          patch.merchandising = { ...product.merchandising, featured: true };
          break;
        case "unfeature":
          patch.merchandising = { ...product.merchandising, featured: false };
          break;
      }

      await updateProduct(product.id, patch);
      affected += 1;
    }

    await recordAudit({
      actor,
      action: `product.bulk.${action}`,
      entityType: "product",
      entityId: `${affected} products`,
      beforeSummary: null,
      afterSummary: `${action} applied to ${affected} products`,
    });

    revalidateCatalog();
    return ok({ affected }, `${affected} product${affected === 1 ? "" : "s"} updated`);
  } catch (error) {
    return failure(error);
  }
}

/** Inline status/stock edits from the list, where they are safe (§4.1). */
export async function quickUpdateProductAction(
  id: string,
  patch: { status?: Product["availability"]["status"]; stockOnHand?: number },
): Promise<ActionResult<undefined>> {
  try {
    const actor = await assertPermission("products.write");
    const product = await getProduct(id);
    if (!product) return fail("That product no longer exists.");

    const next: Partial<Product> = { updatedAt: nowIso(), updatedBy: actor.uid };
    if (patch.status) {
      if (patch.status === "active") await assertPermission("products.publish");
      next.availability = {
        ...product.availability,
        status: patch.status,
        publishedAt:
          patch.status === "active"
            ? (product.availability.publishedAt ?? nowIso())
            : product.availability.publishedAt,
      };
    }
    if (patch.stockOnHand !== undefined) {
      if (!Number.isInteger(patch.stockOnHand) || patch.stockOnHand < 0) {
        return fail("Stock must be a whole number of zero or more.");
      }
      // Stock changes go through the inventory service so a movement is logged.
      const { adjustStock } = await import("@/server/services/inventory");
      await adjustStock({
        productId: id,
        type: "manual_set",
        value: patch.stockOnHand,
        reason: "Inline edit from product list",
        actor,
      });
    }

    if (patch.status) {
      await updateProduct(id, next);
      await recordAudit({
        actor,
        action: patch.status === "active" ? "product.publish" : "product.status",
        entityType: "product",
        entityId: id,
        beforeSummary: product.availability.status,
        afterSummary: patch.status,
      });
    }

    revalidateCatalog();
    return ok(undefined, "Updated");
  } catch (error) {
    return failure(error);
  }
}
