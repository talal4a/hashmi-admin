import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require-admin";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/admin-shell/page-header";
import { ProductForm } from "@/components/products/product-form";
import { listCategories } from "@/server/repositories/categories";
import { listVendors } from "@/server/repositories/misc";
import { getSettings } from "@/server/repositories/settings";

export const metadata: Metadata = { title: "Add product" };
export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const admin = await requirePermission("products.write");
  const [categories, vendors, settings] = await Promise.all([
    listCategories(),
    listVendors(),
    getSettings(),
  ]);

  return (
    <>
      <PageHeader
        title="Add product"
        subtitle="Save a draft at any point. Publishing is blocked until validation passes."
        breadcrumbs={[{ label: "Products", href: "/products" }, { label: "Add product" }]}
      />
      <ProductForm
        product={null}
        categories={categories}
        vendors={vendors}
        defaultThreshold={settings.catalog.lowStockThresholdDefault}
        canPublish={can(admin, "products.publish")}
      />
    </>
  );
}
