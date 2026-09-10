import "server-only";

import type { Category, Product, ProductStatus } from "@/types";
import { COLLECTIONS, collection } from "./base";

export interface ProductFilters {
  search?: string;
  status?: ProductStatus | "all";
  categoryId?: string | "all";
  stockState?: "all" | "in_stock" | "low" | "out";
  featured?: boolean;
  onSale?: boolean;
  vendorId?: string | "all";
  shoppingMode?: "all" | "retail" | "wholesale";
  updatedWithinDays?: number;
  sort?: "updated_desc" | "name_asc" | "price_asc" | "price_desc" | "stock_asc";
}

export interface ProductPage {
  rows: Product[];
  total: number;
  counts: {
    all: number;
    active: number;
    draft: number;
    archived: number;
    low: number;
    out: number;
    onSale: number;
  };
}

export function isLowStock(product: Product): boolean {
  return (
    product.inventory.track &&
    product.inventory.stockOnHand > 0 &&
    product.inventory.stockOnHand <= product.inventory.lowStockThreshold
  );
}

export function isOutOfStock(product: Product): boolean {
  return product.inventory.track && product.inventory.stockOnHand <= 0;
}

export function availableStock(product: Product): number {
  return Math.max(0, product.inventory.stockOnHand - product.inventory.reserved);
}

function matches(product: Product, filters: ProductFilters): boolean {
  const search = filters.search?.trim().toLowerCase();
  if (search) {
    const haystack = [
      product.name,
      product.sku,
      product.brand,
      product.barcode,
      ...product.tags,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const tokenHit = product.searchTokens.some((t) => t.startsWith(search));
    if (!haystack.includes(search) && !tokenHit) return false;
  }
  if (filters.status && filters.status !== "all" && product.availability.status !== filters.status) {
    return false;
  }
  if (filters.categoryId && filters.categoryId !== "all" && product.categoryId !== filters.categoryId) {
    return false;
  }
  if (filters.shoppingMode && filters.shoppingMode !== "all" && product.shoppingMode !== filters.shoppingMode) {
    return false;
  }
  if (filters.stockState && filters.stockState !== "all") {
    if (filters.stockState === "out" && !isOutOfStock(product)) return false;
    if (filters.stockState === "low" && !isLowStock(product)) return false;
    if (filters.stockState === "in_stock" && (isOutOfStock(product) || isLowStock(product))) return false;
  }
  if (filters.featured && !product.merchandising.featured) return false;
  if (filters.onSale) {
    const cmp = product.pricing.compareAtPrice;
    if (!cmp || cmp <= product.pricing.price) return false;
  }
  if (filters.vendorId && filters.vendorId !== "all" && !product.availability.vendorIds.includes(filters.vendorId)) {
    return false;
  }
  if (filters.updatedWithinDays) {
    const cutoff = Date.now() - filters.updatedWithinDays * 86_400_000;
    if (new Date(product.updatedAt).getTime() < cutoff) return false;
  }
  return true;
}

function sortRows(rows: Product[], sort: ProductFilters["sort"]): Product[] {
  const sorted = [...rows];
  switch (sort) {
    case "name_asc":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case "price_asc":
      return sorted.sort((a, b) => a.pricing.price - b.pricing.price);
    case "price_desc":
      return sorted.sort((a, b) => b.pricing.price - a.pricing.price);
    case "stock_asc":
      return sorted.sort((a, b) => a.inventory.stockOnHand - b.inventory.stockOnHand);
    default:
      return sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}

export async function listProducts(
  filters: ProductFilters = {},
  page = 0,
  pageSize = 25,
): Promise<ProductPage> {
  const col = await collection<Product>(COLLECTIONS.products);
  const all = await col.all();
  const filtered = sortRows(all.filter((p) => matches(p, filters)), filters.sort);
  const start = page * pageSize;
  return {
    rows: filtered.slice(start, start + pageSize),
    total: filtered.length,
    counts: {
      all: all.length,
      active: all.filter((p) => p.availability.status === "active").length,
      draft: all.filter((p) => p.availability.status === "draft").length,
      archived: all.filter((p) => p.availability.status === "archived").length,
      low: all.filter(isLowStock).length,
      out: all.filter(isOutOfStock).length,
      onSale: all.filter((p) => (p.pricing.compareAtPrice ?? 0) > p.pricing.price).length,
    },
  };
}

export async function getProduct(id: string): Promise<Product | null> {
  const col = await collection<Product>(COLLECTIONS.products);
  return col.get(id);
}

export async function allProducts(): Promise<Product[]> {
  const col = await collection<Product>(COLLECTIONS.products);
  return col.all();
}

export async function saveProduct(product: Product): Promise<Product> {
  const col = await collection<Product>(COLLECTIONS.products);
  await col.set(product);
  await recomputeCategoryCounts();
  return product;
}

export async function updateProduct(id: string, patch: Partial<Product>): Promise<Product> {
  const col = await collection<Product>(COLLECTIONS.products);
  const next = await col.update(id, patch);
  await recomputeCategoryCounts();
  return next;
}

export async function deleteProduct(id: string): Promise<void> {
  const col = await collection<Product>(COLLECTIONS.products);
  await col.remove(id);
  await recomputeCategoryCounts();
}

export async function slugExists(slug: string, exceptId?: string): Promise<boolean> {
  const rows = await allProducts();
  return rows.some((p) => p.slug === slug && p.id !== exceptId);
}

export async function skuExists(sku: string, exceptId?: string): Promise<boolean> {
  const rows = await allProducts();
  return rows.some((p) => p.sku.toLowerCase() === sku.toLowerCase() && p.id !== exceptId);
}

/**
 * Counters on the category document are denormalised accelerators, not the
 * source of truth (PRD §11.3) — they are recomputed whenever catalog data moves.
 */
export async function recomputeCategoryCounts(): Promise<void> {
  const [productsCol, categoriesCol] = await Promise.all([
    collection<Product>(COLLECTIONS.products),
    collection<Category>(COLLECTIONS.categories),
  ]);
  const products = await productsCol.all();
  const categories = await categoriesCol.all();
  for (const category of categories) {
    const own = products.filter((p) => p.categoryId === category.id);
    const patch = {
      productCount: own.length,
      activeProductCount: own.filter((p) => p.availability.status === "active").length,
      hiddenProductCount: own.filter((p) => p.availability.status !== "active").length,
      lowStockCount: own.filter((p) => isLowStock(p) || isOutOfStock(p)).length,
    };
    const changed =
      patch.productCount !== category.productCount ||
      patch.activeProductCount !== category.activeProductCount ||
      patch.hiddenProductCount !== category.hiddenProductCount ||
      patch.lowStockCount !== category.lowStockCount;
    if (changed) await categoriesCol.update(category.id, patch);
  }
}
