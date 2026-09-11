import Link from "next/link";
import { AlertTriangle, ArrowUpRight, ImageIcon, PackageX, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/states";
import { Table, TableCard, TableScroll, Td, Th, Tr } from "@/components/ui/table";
import { CategoryPreview } from "./category-manager";
import { formatPKR } from "@/lib/utils/format";
import type { Category, Product } from "@/types";

/**
 * A single category (PRD §6).
 *
 * Server-rendered: there is nothing here to interact with beyond links, so
 * shipping it as a client component would only cost bundle. Editing reuses the
 * list page's dialog through `?edit=`, rather than a second copy of the form
 * that could drift from it.
 */

function isOut(product: Product): boolean {
  return product.inventory.track && product.inventory.stockOnHand <= 0;
}

function isLow(product: Product): boolean {
  return (
    product.inventory.track &&
    product.inventory.stockOnHand > 0 &&
    product.inventory.stockOnHand <= product.inventory.lowStockThreshold
  );
}

export function CategoryDetail({
  category,
  parent,
  subcategories,
  products,
  inheritedProducts,
  canWrite,
  canViewProducts,
}: {
  category: Category;
  parent: Category | null;
  subcategories: Category[];
  products: Product[];
  inheritedProducts: Product[];
  canWrite: boolean;
  canViewProducts: boolean;
}) {
  const active = products.filter((p) => p.availability.status === "active");
  const low = products.filter(isLow);
  const out = products.filter(isOut);
  const noImage = products.filter((p) => !p.media);

  const stats: { label: string; value: string; tone?: "warning" | "danger" }[] = [
    { label: "Products", value: String(products.length) },
    { label: "Live in the app", value: String(active.length) },
    { label: "Low stock", value: String(low.length), tone: low.length > 0 ? "warning" : undefined },
    { label: "Out of stock", value: String(out.length), tone: out.length > 0 ? "danger" : undefined },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Identity and how it looks in the app */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_auto]">
        <Card>
          <CardHeader
            title="Details"
            subtitle={category.description ?? "No description."}
            action={
              canWrite ? (
                <Link href={`/categories?edit=${category.id}`}>
                  <Button size="sm" variant="outline">
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                </Link>
              ) : null
            }
          />
          <CardBody>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {(
                [
                  ["Slug", <code key="s" className="font-mono">{category.slug}</code>],
                  [
                    "Parent",
                    parent ? (
                      <Link
                        key="p"
                        href={`/categories/${parent.id}`}
                        className="text-[var(--hm-cyan-700)] hover:underline"
                      >
                        {parent.name}
                      </Link>
                    ) : (
                      "Top level"
                    ),
                  ],
                  [
                    "Visibility",
                    category.status === "active" ? (
                      <Chip key="v" tone="success">Visible</Chip>
                    ) : (
                      <Chip key="v" tone="neutral">Hidden</Chip>
                    ),
                  ],
                  ["Position", `#${category.sortOrder}`],
                  [
                    "Card colour",
                    category.media ? (
                      <span key="c" className="flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className="size-3.5 rounded-full border border-[var(--hm-border)]"
                          style={{ background: category.media.palette.cardBg }}
                        />
                        <code className="font-mono">{category.media.palette.cardBg}</code>
                      </span>
                    ) : (
                      "No image — the icon is used"
                    ),
                  ],
                  [
                    "Background removed",
                    category.media
                      ? category.media.processing.backgroundRemoved
                        ? "Yes"
                        : "No"
                      : "—",
                  ],
                ] as [string, React.ReactNode][]
              ).map(([label, value]) => (
                <div key={label} className="flex items-baseline gap-2 text-[12.5px]">
                  <dt className="w-[130px] shrink-0 text-[var(--hm-ink-500)]">{label}</dt>
                  <dd className="min-w-0 text-[var(--hm-ink-800)]">{value}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>

        <Card className="lg:w-[230px]">
          <CardHeader title="In the app" subtitle="Exactly as customers see it" />
          <CardBody className="flex justify-center">
            <CategoryPreview category={category} />
          </CardBody>
        </Card>
      </div>

      {/* Numbers worth acting on */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-[var(--hm-radius-card)] border border-[var(--hm-border)] bg-white px-4 py-3"
          >
            <p className="text-[11.5px] text-[var(--hm-ink-500)]">{stat.label}</p>
            <p
              className={
                stat.tone === "danger"
                  ? "text-[22px] font-bold text-[var(--hm-danger-700)] tabular-nums"
                  : stat.tone === "warning"
                    ? "text-[22px] font-bold text-[var(--hm-warning-700)] tabular-nums"
                    : "text-[22px] font-bold text-[var(--hm-ink-900)] tabular-nums"
              }
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* The two things that make a category look unfinished in the app. */}
      {(noImage.length > 0 || out.length > 0) && canViewProducts ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          {noImage.length > 0 ? (
            <Link
              href={`/products?category=${category.id}`}
              className="flex flex-1 items-center gap-2 rounded-[var(--hm-radius-control)] border border-[var(--hm-warning-100)] bg-[var(--hm-warning-50)] px-3.5 py-2.5 text-[12.5px] text-[var(--hm-warning-700)] transition-colors hover:border-[var(--hm-warning-200,var(--hm-warning-100))]"
            >
              <ImageIcon className="size-4 shrink-0" />
              {noImage.length} product{noImage.length === 1 ? " has" : "s have"} no image yet —
              pick one and the rest is automatic.
              <ArrowUpRight className="ml-auto size-3.5" />
            </Link>
          ) : null}
          {out.length > 0 ? (
            <Link
              href={`/inventory?category=${category.id}`}
              className="flex flex-1 items-center gap-2 rounded-[var(--hm-radius-control)] border border-[var(--hm-danger-100)] bg-[var(--hm-danger-50)] px-3.5 py-2.5 text-[12.5px] text-[var(--hm-danger-700)] transition-colors"
            >
              <PackageX className="size-4 shrink-0" />
              {out.length} product{out.length === 1 ? " is" : "s are"} out of stock.
              <ArrowUpRight className="ml-auto size-3.5" />
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* Subcategories */}
      {subcategories.length > 0 ? (
        <Card>
          <CardHeader
            title="Subcategories"
            subtitle={`${subcategories.length} inside ${category.name}`}
          />
          <CardBody>
            <div className="flex flex-wrap gap-3">
              {subcategories.map((child) => (
                <Link key={child.id} href={`/categories/${child.id}`} className="group">
                  <div className="flex w-[150px] flex-col">
                    <CategoryPreview category={child} />
                    <span className="mt-1.5 text-center text-[11.5px] text-[var(--hm-ink-500)]">
                      {child.productCount} product{child.productCount === 1 ? "" : "s"}
                      {child.status === "hidden" ? " · hidden" : ""}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
            {inheritedProducts.length > 0 ? (
              <p className="mt-3 text-[11.5px] text-[var(--hm-ink-500)]">
                A further {inheritedProducts.length} product
                {inheritedProducts.length === 1 ? " sits" : "s sit"} in these subcategories rather
                than directly in {category.name}.
              </p>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {/* Products */}
      <TableCard>
        <CardHeader
          title="Products in this category"
          subtitle={
            products.length === 0
              ? "Nothing filed here yet"
              : `${products.length} product${products.length === 1 ? "" : "s"}`
          }
          action={
            canViewProducts ? (
              <Link href={`/products?category=${category.id}`}>
                <Button size="sm" variant="outline">
                  Open in Products
                  <ArrowUpRight className="size-3.5" />
                </Button>
              </Link>
            ) : null
          }
        />
        {products.length === 0 ? (
          <EmptyState
            title="No products in this category"
            message="Assign products to it from the product editor, or create one and pick this category."
            action={
              canViewProducts ? (
                <Link href="/products/new">
                  <Button size="sm">Add a product</Button>
                </Link>
              ) : null
            }
          />
        ) : (
          <TableScroll>
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th>Status</Th>
                  <Th align="right">Price</Th>
                  <Th align="right">Stock</Th>
                  <Th>Image</Th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <Tr key={product.id}>
                    <Td>
                      <span className="flex items-center gap-2.5">
                        <span
                          className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-[9px] border border-[var(--hm-border)]"
                          style={{
                            background: product.media?.palette.cardBg ?? "var(--hm-ink-50)",
                          }}
                        >
                          {product.media ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.media.cutout?.url ?? product.media.original.url}
                              alt=""
                              className="size-full object-contain p-0.5"
                            />
                          ) : (
                            <span className="text-[14px]" aria-hidden>
                              {product.emojiFallback ?? "📦"}
                            </span>
                          )}
                        </span>
                        <span className="min-w-0">
                          {canViewProducts ? (
                            <Link
                              href={`/products/${product.id}`}
                              className="block truncate font-semibold text-[var(--hm-ink-900)] transition-colors hover:text-[var(--hm-cyan-700)]"
                            >
                              {product.name}
                            </Link>
                          ) : (
                            <span className="block truncate font-semibold text-[var(--hm-ink-900)]">
                              {product.name}
                            </span>
                          )}
                          <span className="block truncate text-[11px] text-[var(--hm-ink-400)]">
                            {product.unit.label}
                          </span>
                        </span>
                      </span>
                    </Td>
                    <Td>
                      {product.availability.status === "active" ? (
                        <Chip tone="success">Live</Chip>
                      ) : product.availability.status === "draft" ? (
                        <Chip tone="neutral">Draft</Chip>
                      ) : (
                        <Chip tone="neutral">Archived</Chip>
                      )}
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {formatPKR(product.pricing.price)}
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {!product.inventory.track ? (
                        <span className="text-[var(--hm-ink-400)]">not tracked</span>
                      ) : isOut(product) ? (
                        <span className="font-semibold text-[var(--hm-danger-700)]">0</span>
                      ) : isLow(product) ? (
                        <span className="font-semibold text-[var(--hm-warning-700)]">
                          {product.inventory.stockOnHand}
                        </span>
                      ) : (
                        product.inventory.stockOnHand
                      )}
                    </Td>
                    <Td>
                      {product.media ? (
                        product.media.processing.backgroundRemoved ? (
                          <Chip tone="success">Cut out</Chip>
                        ) : (
                          <Chip tone="info">Photo</Chip>
                        )
                      ) : (
                        <span className="flex items-center gap-1 text-[11.5px] text-[var(--hm-warning-700)]">
                          <AlertTriangle className="size-3.5" />
                          none
                        </span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableScroll>
        )}
      </TableCard>
    </div>
  );
}
