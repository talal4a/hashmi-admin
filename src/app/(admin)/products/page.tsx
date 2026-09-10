import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require-admin";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/admin-shell/page-header";
import { ProductTable } from "@/components/products/product-table";
import { listCategories } from "@/server/repositories/categories";
import { listProducts, type ProductFilters } from "@/server/repositories/products";
import { listVendors } from "@/server/repositories/misc";

export const metadata: Metadata = { title: "Products" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requirePermission("products.view");
  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const filters: ProductFilters = {
    search: one("q"),
    status: (one("status") as ProductFilters["status"]) ?? "all",
    categoryId: one("category") ?? "all",
    stockState: (one("stock") as ProductFilters["stockState"]) ?? "all",
    shoppingMode: (one("mode") as ProductFilters["shoppingMode"]) ?? "all",
    vendorId: one("vendor") ?? "all",
    featured: one("featured") === "1",
    onSale: one("sale") === "1",
    updatedWithinDays: one("updated") ? Number(one("updated")) : undefined,
    sort: (one("sort") as ProductFilters["sort"]) ?? "updated_desc",
  };

  const pageIndex = Math.max(0, Number(one("page") ?? 0) || 0);

  const [page, categories, vendors] = await Promise.all([
    listProducts(filters, pageIndex, PAGE_SIZE),
    listCategories(),
    listVendors(),
  ]);

  return (
    <>
      <PageHeader
        title="Products"
        subtitle={`${page.counts.all} products · ${page.counts.active} active · ${page.counts.draft} draft · ${page.counts.low + page.counts.out} need stock attention`}
      />
      <ProductTable
        page={page}
        categories={categories}
        vendors={vendors}
        canWrite={can(admin, "products.write")}
        canPublish={can(admin, "products.publish")}
        pageIndex={pageIndex}
        pageSize={PAGE_SIZE}
      />
    </>
  );
}
