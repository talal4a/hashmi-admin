"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth/require-admin";
import { categorySchema } from "@/lib/validation/category";
import {
  categoryProductCount,
  categorySlugExists,
  deleteCategory,
  getCategory,
  listCategories,
  reorderCategories,
  saveCategory,
} from "@/server/repositories/categories";
import { recordAudit } from "@/server/repositories/audit";
import { newId, nowIso } from "@/server/repositories/base";
import type { Category } from "@/types";
import { fail, failure, ok, type ActionResult } from "./result";

function revalidateCatalog() {
  revalidatePath("/categories");
  revalidatePath("/products");
  revalidatePath("/dashboard");
}

export async function saveCategoryAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await assertPermission("categories.write");
    const parsed = categorySchema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return fail("Some fields need attention.", fieldErrors);
    }

    const input = parsed.data;
    const existing = input.id ? await getCategory(input.id) : null;

    if (await categorySlugExists(input.slug, existing?.id)) {
      return fail("That slug is already in use.", { slug: "Slug must be unique" });
    }
    if (input.parentId && input.parentId === existing?.id) {
      return fail("A category cannot be its own parent.", { parentId: "Choose a different parent" });
    }

    const now = nowIso();
    const next: Category = {
      id: existing?.id ?? newId("cat"),
      name: input.name,
      slug: input.slug,
      parentId: input.parentId,
      description: input.description ?? null,
      icon: input.icon ?? null,
      media: input.media,
      sortOrder: input.sortOrder,
      status: input.status,
      productCount: existing?.productCount ?? 0,
      activeProductCount: existing?.activeProductCount ?? 0,
      hiddenProductCount: existing?.hiddenProductCount ?? 0,
      lowStockCount: existing?.lowStockCount ?? 0,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await saveCategory(next);
    await recordAudit({
      actor,
      action: existing ? "category.update" : "category.create",
      entityType: "category",
      entityId: next.id,
      beforeSummary: existing ? `${existing.name} · ${existing.status}` : null,
      afterSummary: `${next.name} · ${next.status}`,
    });

    revalidateCatalog();
    return ok({ id: next.id }, existing ? "Category updated" : "Category added");
  } catch (error) {
    return failure(error);
  }
}

export async function deleteCategoryAction(id: string): Promise<ActionResult<undefined>> {
  try {
    const actor = await assertPermission("categories.write");
    const category = await getCategory(id);
    if (!category) return fail("That category no longer exists.");

    // Blocked while products still reference it (PRD §6).
    const count = await categoryProductCount(id);
    if (count > 0) {
      return fail(
        `Cannot delete: ${count} product${count === 1 ? "" : "s"} still use this category. Move them or archive the category instead.`,
      );
    }

    const children = (await listCategories()).filter((c) => c.parentId === id);
    if (children.length > 0) {
      return fail(
        `Cannot delete: ${children.length} subcategor${children.length === 1 ? "y" : "ies"} sit under this one.`,
      );
    }

    await deleteCategory(id);
    await recordAudit({
      actor,
      action: "category.delete",
      entityType: "category",
      entityId: id,
      beforeSummary: category.name,
      afterSummary: "deleted",
    });

    revalidateCatalog();
    return ok(undefined, `${category.name} deleted`);
  } catch (error) {
    return failure(error);
  }
}

export async function reorderCategoriesAction(order: string[]): Promise<ActionResult<undefined>> {
  try {
    const actor = await assertPermission("categories.write");
    if (!Array.isArray(order) || order.length === 0) return fail("Nothing to reorder.");

    await reorderCategories(order);
    await recordAudit({
      actor,
      action: "category.reorder",
      entityType: "category",
      entityId: `${order.length} categories`,
      beforeSummary: null,
      afterSummary: "Sort order updated",
    });

    revalidateCatalog();
    return ok(undefined, "Order saved");
  } catch (error) {
    return failure(error);
  }
}

export async function toggleCategoryVisibilityAction(
  id: string,
): Promise<ActionResult<{ status: Category["status"] }>> {
  try {
    const actor = await assertPermission("categories.write");
    const category = await getCategory(id);
    if (!category) return fail("That category no longer exists.");

    const status: Category["status"] = category.status === "active" ? "hidden" : "active";
    await saveCategory({ ...category, status, updatedAt: nowIso() });
    await recordAudit({
      actor,
      action: "category.visibility",
      entityType: "category",
      entityId: id,
      beforeSummary: category.status,
      afterSummary: status,
    });

    revalidateCatalog();
    return ok({ status }, status === "active" ? "Category is now visible" : "Category hidden");
  } catch (error) {
    return failure(error);
  }
}
