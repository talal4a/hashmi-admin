import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/require-admin";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/admin-shell/page-header";
import { CategoryManager } from "@/components/categories/category-manager";
import { TableSkeleton } from "@/components/ui/states";
import { listCategories } from "@/server/repositories/categories";
import { allProducts } from "@/server/repositories/products";
import type { CategoryArtSource } from "@/lib/media/collage";

export const metadata: Metadata = { title: "Categories" };
export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const admin = await requirePermission("categories.view");
  const [categories, products] = await Promise.all([listCategories(), allProducts()]);

  /*
   * Enough of each product to show a thumbnail and fetch its pixels, and no
   * more: a category tile built from six cutouts does not need thirty full
   * product documents shipped to the browser.
   */
  const artSources: CategoryArtSource[] = products
    .filter((product) => product.media !== null)
    .map((product) => ({
      id: product.id,
      name: product.name,
      categoryId: product.categoryId,
      imageUrl: product.media!.cutout?.url ?? product.media!.original.url,
      hasCutout: product.media!.cutout !== null,
    }));

  const totalProducts = categories.reduce((sum, c) => sum + c.productCount, 0);
  const lowStock = categories.reduce((sum, c) => sum + c.lowStockCount, 0);

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle={`${categories.length} categories · ${totalProducts} products${lowStock > 0 ? ` · ${lowStock} need stock attention` : ""}`}
      />
      <Suspense fallback={<div className="hm-card"><TableSkeleton rows={6} columns={4} /></div>}>
        <CategoryManager
          categories={categories}
          artSources={artSources}
          canWrite={can(admin, "categories.write")}
        />
      </Suspense>
    </>
  );
}
