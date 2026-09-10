import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/require-admin";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/admin-shell/page-header";
import { CategoryManager } from "@/components/categories/category-manager";
import { TableSkeleton } from "@/components/ui/states";
import { listCategories } from "@/server/repositories/categories";

export const metadata: Metadata = { title: "Categories" };
export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const admin = await requirePermission("categories.view");
  const categories = await listCategories();

  const totalProducts = categories.reduce((sum, c) => sum + c.productCount, 0);
  const lowStock = categories.reduce((sum, c) => sum + c.lowStockCount, 0);

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle={`${categories.length} categories · ${totalProducts} products${lowStock > 0 ? ` · ${lowStock} need stock attention` : ""}`}
      />
      <Suspense fallback={<div className="hm-card"><TableSkeleton rows={6} columns={4} /></div>}>
        <CategoryManager categories={categories} canWrite={can(admin, "categories.write")} />
      </Suspense>
    </>
  );
}
