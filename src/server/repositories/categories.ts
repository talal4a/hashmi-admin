import "server-only";

import type { Category, Product } from "@/types";
import { COLLECTIONS, collection } from "./base";

export async function listCategories(): Promise<Category[]> {
  const col = await collection<Category>(COLLECTIONS.categories);
  const rows = await col.all();
  return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export async function getCategory(id: string): Promise<Category | null> {
  const col = await collection<Category>(COLLECTIONS.categories);
  return col.get(id);
}

export async function saveCategory(category: Category): Promise<Category> {
  const col = await collection<Category>(COLLECTIONS.categories);
  await col.set(category);
  return category;
}

export async function updateCategory(id: string, patch: Partial<Category>): Promise<Category> {
  const col = await collection<Category>(COLLECTIONS.categories);
  return col.update(id, patch);
}

export async function deleteCategory(id: string): Promise<void> {
  const col = await collection<Category>(COLLECTIONS.categories);
  await col.remove(id);
}

export async function reorderCategories(order: string[]): Promise<void> {
  const col = await collection<Category>(COLLECTIONS.categories);
  await Promise.all(order.map((id, index) => col.update(id, { sortOrder: index + 1 })));
}

/** Deleting a category is blocked while products still reference it (§6). */
export async function categoryProductCount(id: string): Promise<number> {
  const col = await collection<Product>(COLLECTIONS.products);
  const rows = await col.all();
  return rows.filter((p) => p.categoryId === id || p.subcategoryId === id).length;
}

export async function categorySlugExists(slug: string, exceptId?: string): Promise<boolean> {
  const rows = await listCategories();
  return rows.some((c) => c.slug === slug && c.id !== exceptId);
}
