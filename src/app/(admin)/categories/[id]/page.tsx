import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/require-admin";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/admin-shell/page-header";
import { CategoryDetail } from "@/components/categories/category-detail";
import { getCategory, listCategories } from "@/server/repositories/categories";
import { allProducts } from "@/server/repositories/products";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const category = await getCategory(id);
  return { title: category ? category.name : "Category" };
}

/**
 * One category, in full (PRD §6).
 *
 * The list page is for arranging categories against each other; this is for
 * looking at one of them — what it contains, what is wrong inside it, and how
 * it will appear in the app.
 */
export default async function CategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePermission("categories.view");
  const { id } = await params;

  const [category, categories, products] = await Promise.all([
    getCategory(id),
    listCategories(),
    allProducts(),
  ]);

  if (!category) notFound();

  const parent = category.parentId
    ? (categories.find((c) => c.id === category.parentId) ?? null)
    : null;
  const subcategories = categories
    .filter((c) => c.parentId === category.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // Products filed directly here, plus anything in a subcategory of it.
  const childIds = new Set(subcategories.map((c) => c.id));
  const own = products.filter((p) => p.categoryId === category.id);
  const inherited = products.filter(
    (p) =>
      p.categoryId !== category.id &&
      (childIds.has(p.categoryId) || (p.subcategoryId ? childIds.has(p.subcategoryId) : false)),
  );

  return (
    <>
      <PageHeader
        title={category.name}
        subtitle={
          parent
            ? `Subcategory of ${parent.name} · ${own.length} product${own.length === 1 ? "" : "s"}`
            : `${own.length} product${own.length === 1 ? "" : "s"}${subcategories.length > 0 ? ` · ${subcategories.length} subcategor${subcategories.length === 1 ? "y" : "ies"}` : ""}`
        }
        breadcrumbs={[
          { label: "Categories", href: "/categories" },
          ...(parent ? [{ label: parent.name, href: `/categories/${parent.id}` }] : []),
          { label: category.name },
        ]}
      />
      <CategoryDetail
        category={category}
        parent={parent}
        subcategories={subcategories}
        products={own}
        inheritedProducts={inherited}
        canWrite={can(admin, "categories.write")}
        canViewProducts={can(admin, "products.view")}
      />
    </>
  );
}
