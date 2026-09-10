import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/require-admin";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/admin-shell/page-header";
import { Chip } from "@/components/ui/chip";
import { ProductForm } from "@/components/products/product-form";
import { listCategories } from "@/server/repositories/categories";
import { getProduct } from "@/server/repositories/products";
import { listVendors } from "@/server/repositories/misc";
import { getSettings } from "@/server/repositories/settings";
import { formatDateTime } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id);
  return { title: product ? product.name : "Product" };
}

const STATUS_TONE = { active: "success", draft: "warning", archived: "neutral" } as const;

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePermission("products.write");
  const { id } = await params;

  const [product, categories, vendors, settings] = await Promise.all([
    getProduct(id),
    listCategories(),
    listVendors(),
    getSettings(),
  ]);

  if (!product) notFound();

  return (
    <>
      <PageHeader
        title={product.name}
        subtitle={`${product.sku} · last updated ${formatDateTime(product.updatedAt)}`}
        breadcrumbs={[{ label: "Products", href: "/products" }, { label: product.name }]}
        actions={<Chip tone={STATUS_TONE[product.availability.status]}>{product.availability.status}</Chip>}
      />
      <ProductForm
        product={product}
        categories={categories}
        vendors={vendors}
        defaultThreshold={settings.catalog.lowStockThresholdDefault}
        canPublish={can(admin, "products.publish")}
      />
    </>
  );
}
