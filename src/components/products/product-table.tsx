"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Archive,
  ArrowUpDown,
  CheckCircle2,
  Download,
  EyeOff,
  Filter,
  Pencil,
  Plus,
  Search,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button, LinkButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Checkbox, Input, Select } from "@/components/ui/field";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/states";
import {
  Pagination,
  Table,
  TableCard,
  TableScroll,
  TableToolbar,
  Td,
  Th,
  Tr,
} from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";
import { formatPKR, formatRelative } from "@/lib/utils/format";
import { discountPercent } from "@/lib/utils/pricing";
import { bulkProductAction, quickUpdateProductAction } from "@/server/actions/products";
import type { ProductPage } from "@/server/repositories/products";
import type { Category, Product, Vendor } from "@/types";
import { ProductThumb } from "./product-card-preview";

/** Saved views from PRD §4.1, expressed as URL params so they are shareable. */
const SAVED_VIEWS = [
  { key: "all", label: "All", params: {} as Record<string, string> },
  { key: "low", label: "Low stock", params: { stock: "low" } },
  { key: "out", label: "Out of stock", params: { stock: "out" } },
  { key: "drafts", label: "Drafts", params: { status: "draft" } },
  { key: "sale", label: "On sale", params: { sale: "1" } },
  { key: "recent", label: "Recently changed", params: { updated: "7" } },
  { key: "archived", label: "Archived", params: { status: "archived" } },
];

const STATUS_TONE = {
  active: "success",
  draft: "warning",
  archived: "neutral",
} as const;

export function ProductTable({
  page,
  categories,
  vendors,
  canWrite,
  canPublish,
  pageIndex,
  pageSize,
}: {
  page: ProductPage;
  categories: Category[];
  vendors: Vendor[];
  canWrite: boolean;
  canPublish: boolean;
  pageIndex: number;
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [bulkDialog, setBulkDialog] = useState<null | "move" | "threshold" | "archive">(null);
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkThreshold, setBulkThreshold] = useState("15");

  const setParam = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      // Any filter change resets paging.
      if (!("page" in updates)) next.delete("page");
      startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
    },
    [params, pathname, router],
  );

  const activeView = useMemo(() => {
    for (const view of SAVED_VIEWS) {
      const entries = Object.entries(view.params);
      if (entries.length === 0) continue;
      if (entries.every(([k, v]) => params.get(k) === v)) return view.key;
    }
    const hasAny = ["stock", "status", "sale", "updated"].some((k) => params.get(k));
    return hasAny ? null : "all";
  }, [params]);

  const allOnPageSelected = page.rows.length > 0 && selected.length === page.rows.length;

  const runBulk = (action: string, extra?: Record<string, unknown>) => {
    startTransition(async () => {
      const result = await bulkProductAction({ ids: selected, action, ...extra });
      if (result.ok) {
        toast.success(result.message ?? "Updated");
        setSelected([]);
        setBulkDialog(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const quickStatus = (product: Product, status: Product["availability"]["status"]) => {
    startTransition(async () => {
      const result = await quickUpdateProductAction(product.id, { status });
      if (result.ok) {
        toast.success(`${product.name} is now ${status}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const exportCsv = () => {
    const header = [
      "id", "name", "sku", "category", "shoppingMode", "price", "compareAtPrice",
      "unit", "stockOnHand", "lowStockThreshold", "status", "updatedAt",
    ];
    const lines = page.rows.map((p) =>
      [
        p.id,
        p.name,
        p.sku,
        categories.find((c) => c.id === p.categoryId)?.name ?? "",
        p.shoppingMode,
        p.pricing.price,
        p.pricing.compareAtPrice ?? "",
        p.unit.label,
        p.inventory.stockOnHand,
        p.inventory.lowStockThreshold,
        p.availability.status,
        p.updatedAt,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hashmimart-products-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${page.rows.length} rows`);
  };

  return (
    <>
      {/* Saved views */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {SAVED_VIEWS.map((view) => (
          <button
            key={view.key}
            type="button"
            onClick={() =>
              setParam({
                stock: view.params.stock ?? null,
                status: view.params.status ?? null,
                sale: view.params.sale ?? null,
                updated: view.params.updated ?? null,
              })
            }
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors duration-[var(--hm-dur-fast)]",
              activeView === view.key
                ? "border-[var(--hm-cyan-300)] bg-[var(--hm-cyan-50)] text-[var(--hm-cyan-800)]"
                : "border-[var(--hm-border)] bg-white text-[var(--hm-ink-600,#475569)] hover:border-[var(--hm-cyan-200)]",
            )}
          >
            {view.label}
            {view.key === "low" && page.counts.low > 0 ? (
              <span className="ml-1.5 text-[11px] text-[var(--hm-warning-700)]">{page.counts.low}</span>
            ) : null}
            {view.key === "out" && page.counts.out > 0 ? (
              <span className="ml-1.5 text-[11px] text-[var(--hm-danger-700)]">{page.counts.out}</span>
            ) : null}
            {view.key === "drafts" && page.counts.draft > 0 ? (
              <span className="ml-1.5 text-[11px] text-[var(--hm-ink-500)]">{page.counts.draft}</span>
            ) : null}
          </button>
        ))}
      </div>

      <TableCard>
        <TableToolbar>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setParam({ q: search || null });
            }}
            className="relative min-w-[220px] flex-1"
          >
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--hm-ink-400)]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, SKU, brand, barcode or tag…"
              aria-label="Search products"
              className="pl-9"
            />
            {search ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setParam({ q: null });
                }}
                aria-label="Clear search"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-[var(--hm-ink-400)] hover:text-[var(--hm-ink-700)]"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </form>

          <Button variant="outline" size="sm" onClick={() => setFiltersOpen(true)}>
            <Filter className="size-4" />
            Filters
          </Button>

          <Select
            value={params.get("sort") ?? "updated_desc"}
            onChange={(e) => setParam({ sort: e.target.value })}
            aria-label="Sort products"
            className="h-8 w-auto min-w-[150px] text-[12.5px]"
          >
            <option value="updated_desc">Recently updated</option>
            <option value="name_asc">Name A–Z</option>
            <option value="price_asc">Price low to high</option>
            <option value="price_desc">Price high to low</option>
            <option value="stock_asc">Stock low to high</option>
          </Select>

          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="size-4" />
            Export
          </Button>

          {canWrite ? (
            <LinkButton href="/products/new" size="sm">
              <Plus className="size-4" />
              Add product
            </LinkButton>
          ) : null}
        </TableToolbar>

        {/* Bulk action bar */}
        <AnimatePresence>
          {selected.length > 0 && canWrite ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="overflow-hidden border-b border-[var(--hm-cyan-100)] bg-[var(--hm-cyan-50)]"
            >
              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <span className="text-[12.5px] font-semibold text-[var(--hm-cyan-800)]">
                  {selected.length} selected
                </span>
                {canPublish ? (
                  <Button variant="outline" size="sm" onClick={() => runBulk("publish")} disabled={pending}>
                    <CheckCircle2 className="size-3.5" />
                    Publish
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" onClick={() => runBulk("unpublish")} disabled={pending}>
                  <EyeOff className="size-3.5" />
                  Unpublish
                </Button>
                <Button variant="outline" size="sm" onClick={() => setBulkDialog("move")} disabled={pending}>
                  Move category
                </Button>
                <Button variant="outline" size="sm" onClick={() => setBulkDialog("threshold")} disabled={pending}>
                  Set threshold
                </Button>
                <Button variant="outline" size="sm" onClick={() => runBulk("feature")} disabled={pending}>
                  <Star className="size-3.5" />
                  Feature
                </Button>
                <Button variant="danger" size="sm" onClick={() => setBulkDialog("archive")} disabled={pending}>
                  <Archive className="size-3.5" />
                  Archive
                </Button>
                <button
                  type="button"
                  onClick={() => setSelected([])}
                  className="ml-auto text-[12.5px] font-semibold text-[var(--hm-cyan-800)] hover:underline"
                >
                  Clear
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {page.rows.length === 0 ? (
          <EmptyState
            title="No products match these filters"
            message="Adjust the search or filters, or add a new product to the catalog."
            action={
              canWrite ? (
                <LinkButton href="/products/new">
                  <Plus className="size-4" />
                  Add product
                </LinkButton>
              ) : null
            }
          />
        ) : (
          <>
            <TableScroll>
              <Table className="min-w-[1000px]">
                <thead>
                  <tr>
                    {canWrite ? (
                      <Th className="w-10">
                        <Checkbox
                          checked={allOnPageSelected}
                          indeterminate={selected.length > 0 && !allOnPageSelected}
                          onChange={(next) => setSelected(next ? page.rows.map((r) => r.id) : [])}
                          label="Select all products on this page"
                        />
                      </Th>
                    ) : null}
                    <Th>Product</Th>
                    <Th>Category</Th>
                    <Th align="right">Price</Th>
                    <Th align="right">Stock</Th>
                    <Th>Status</Th>
                    <Th>
                      <span className="inline-flex items-center gap-1">
                        Updated <ArrowUpDown className="size-3" />
                      </span>
                    </Th>
                    <Th align="right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((product) => {
                    const category = categories.find((c) => c.id === product.categoryId);
                    const discount = discountPercent(product.pricing);
                    const low =
                      product.inventory.track &&
                      product.inventory.stockOnHand > 0 &&
                      product.inventory.stockOnHand <= product.inventory.lowStockThreshold;
                    const out = product.inventory.track && product.inventory.stockOnHand <= 0;
                    const checked = selected.includes(product.id);

                    return (
                      <Tr key={product.id} className={checked ? "bg-[var(--hm-cyan-50)]/60" : undefined}>
                        {canWrite ? (
                          <Td>
                            <Checkbox
                              checked={checked}
                              onChange={(next) =>
                                setSelected((prev) =>
                                  next ? [...prev, product.id] : prev.filter((id) => id !== product.id),
                                )
                              }
                              label={`Select ${product.name}`}
                            />
                          </Td>
                        ) : null}

                        <Td>
                          <div className="flex items-center gap-3">
                            <ProductThumb
                              imageUrl={product.media?.cutout?.url ?? product.media?.original.url}
                              emoji={product.emojiFallback}
                              palette={product.media?.palette}
                            />
                            <div className="min-w-0">
                              <Link
                                href={`/products/${product.id}`}
                                className="block truncate text-[13.5px] font-semibold text-[var(--hm-ink-900)] hover:text-[var(--hm-cyan-700)]"
                              >
                                {product.name}
                              </Link>
                              <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--hm-ink-500)]">
                                <code className="font-mono">{product.sku}</code>
                                <span>· {product.unit.label}</span>
                                {product.shoppingMode === "wholesale" ? (
                                  <Chip tone="violet" className="px-1.5 py-0 text-[9.5px]">
                                    Wholesale
                                  </Chip>
                                ) : null}
                                {product.merchandising.featured ? (
                                  <Star className="size-3 fill-[var(--hm-warning-500)] text-[var(--hm-warning-500)]" />
                                ) : null}
                              </span>
                            </div>
                          </div>
                        </Td>

                        <Td className="whitespace-nowrap">
                          {category ? (
                            <span className="flex items-center gap-1.5">
                              <span aria-hidden>{category.icon}</span>
                              {category.name}
                            </span>
                          ) : (
                            <span className="text-[var(--hm-ink-400)]">Uncategorised</span>
                          )}
                        </Td>

                        <Td align="right" className="whitespace-nowrap">
                          <span className="font-semibold text-[var(--hm-ink-900)]">
                            {formatPKR(product.pricing.price)}
                          </span>
                          {discount !== null ? (
                            <span className="ml-1.5 text-[11px] text-[var(--hm-ink-400)] line-through">
                              {formatPKR(product.pricing.compareAtPrice!)}
                            </span>
                          ) : null}
                        </Td>

                        <Td align="right">
                          {product.inventory.track ? (
                            <span
                              className={cn(
                                "font-semibold tabular-nums",
                                out
                                  ? "text-[var(--hm-danger-700)]"
                                  : low
                                    ? "text-[var(--hm-warning-700)]"
                                    : "text-[var(--hm-ink-800)]",
                              )}
                            >
                              {product.inventory.stockOnHand}
                              {product.inventory.reserved > 0 ? (
                                <span className="ml-1 text-[10.5px] font-normal text-[var(--hm-ink-400)]">
                                  ({product.inventory.reserved} held)
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-[var(--hm-ink-400)]">Not tracked</span>
                          )}
                        </Td>

                        <Td>
                          <Chip tone={STATUS_TONE[product.availability.status]}>
                            {product.availability.status}
                          </Chip>
                        </Td>

                        <Td className="whitespace-nowrap text-[12px] text-[var(--hm-ink-500)]">
                          {formatRelative(product.updatedAt)}
                        </Td>

                        <Td align="right">
                          <div className="flex items-center justify-end gap-1">
                            {canWrite && product.availability.status !== "archived" ? (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() =>
                                  quickStatus(
                                    product,
                                    product.availability.status === "active" ? "draft" : "active",
                                  )
                                }
                                title={
                                  product.availability.status === "active"
                                    ? "Unpublish"
                                    : "Publish"
                                }
                                aria-label={
                                  product.availability.status === "active"
                                    ? `Unpublish ${product.name}`
                                    : `Publish ${product.name}`
                                }
                                className="rounded-[8px] p-1.5 text-[var(--hm-ink-400)] transition-colors hover:bg-[var(--hm-ink-100)] hover:text-[var(--hm-ink-800)] disabled:opacity-50"
                              >
                                {product.availability.status === "active" ? (
                                  <EyeOff className="size-4" />
                                ) : (
                                  <CheckCircle2 className="size-4" />
                                )}
                              </button>
                            ) : null}
                            <Link
                              href={`/products/${product.id}`}
                              aria-label={`Edit ${product.name}`}
                              className="rounded-[8px] p-1.5 text-[var(--hm-ink-400)] transition-colors hover:bg-[var(--hm-cyan-50)] hover:text-[var(--hm-cyan-700)]"
                            >
                              <Pencil className="size-4" />
                            </Link>
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableScroll>

            <Pagination
              page={pageIndex}
              pageSize={pageSize}
              total={page.total}
              onPage={(next) => setParam({ page: String(next) })}
            />
          </>
        )}
      </TableCard>

      {/* Filters drawer */}
      <Dialog
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filter products"
        description="Filters are stored in the URL, so you can share this view with the team."
        variant="drawer"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() =>
                setParam({
                  status: null, category: null, stock: null, sale: null,
                  featured: null, vendor: null, mode: null, updated: null,
                })
              }
            >
              Reset all
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>Done</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <FilterSelect
            label="Status"
            value={params.get("status") ?? "all"}
            onChange={(v) => setParam({ status: v === "all" ? null : v })}
            options={[
              ["all", `All (${page.counts.all})`],
              ["active", `Active (${page.counts.active})`],
              ["draft", `Draft (${page.counts.draft})`],
              ["archived", `Archived (${page.counts.archived})`],
            ]}
          />
          <FilterSelect
            label="Category"
            value={params.get("category") ?? "all"}
            onChange={(v) => setParam({ category: v === "all" ? null : v })}
            options={[["all", "All categories"], ...categories.map((c) => [c.id, c.name] as [string, string])]}
          />
          <FilterSelect
            label="Stock state"
            value={params.get("stock") ?? "all"}
            onChange={(v) => setParam({ stock: v === "all" ? null : v })}
            options={[
              ["all", "Any"],
              ["in_stock", "Healthy"],
              ["low", `Low (${page.counts.low})`],
              ["out", `Out of stock (${page.counts.out})`],
            ]}
          />
          <FilterSelect
            label="Shopping mode"
            value={params.get("mode") ?? "all"}
            onChange={(v) => setParam({ mode: v === "all" ? null : v })}
            options={[["all", "Retail and wholesale"], ["retail", "Retail"], ["wholesale", "Wholesale"]]}
          />
          <FilterSelect
            label="Vendor / store"
            value={params.get("vendor") ?? "all"}
            onChange={(v) => setParam({ vendor: v === "all" ? null : v })}
            options={[["all", "All vendors"], ...vendors.map((v) => [v.id, v.name] as [string, string])]}
          />
          <FilterSelect
            label="Updated within"
            value={params.get("updated") ?? "any"}
            onChange={(v) => setParam({ updated: v === "any" ? null : v })}
            options={[["any", "Any time"], ["1", "Last 24 hours"], ["7", "Last 7 days"], ["30", "Last 30 days"]]}
          />
          <label className="flex items-center gap-2.5">
            <Checkbox
              checked={params.get("sale") === "1"}
              onChange={(next) => setParam({ sale: next ? "1" : null })}
            />
            <span className="text-[13px] font-medium text-[var(--hm-ink-700)]">
              On sale only ({page.counts.onSale})
            </span>
          </label>
          <label className="flex items-center gap-2.5">
            <Checkbox
              checked={params.get("featured") === "1"}
              onChange={(next) => setParam({ featured: next ? "1" : null })}
            />
            <span className="text-[13px] font-medium text-[var(--hm-ink-700)]">Featured only</span>
          </label>
        </div>
      </Dialog>

      {/* Bulk dialogs */}
      <Dialog
        open={bulkDialog === "move"}
        onClose={() => setBulkDialog(null)}
        title="Move to category"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setBulkDialog(null)}>Cancel</Button>
            <Button
              onClick={() => runBulk("move_category", { categoryId: bulkCategory })}
              disabled={!bulkCategory}
              loading={pending}
            >
              Move {selected.length}
            </Button>
          </>
        }
      >
        <Select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} aria-label="Destination category">
          <option value="">Choose a category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </Dialog>

      <Dialog
        open={bulkDialog === "threshold"}
        onClose={() => setBulkDialog(null)}
        title="Set low-stock threshold"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setBulkDialog(null)}>Cancel</Button>
            <Button
              onClick={() => runBulk("set_threshold", { threshold: Number(bulkThreshold) })}
              loading={pending}
            >
              Apply to {selected.length}
            </Button>
          </>
        }
      >
        <Input
          type="number"
          min={0}
          value={bulkThreshold}
          onChange={(e) => setBulkThreshold(e.target.value)}
          aria-label="Low stock threshold"
        />
      </Dialog>

      <ConfirmDialog
        open={bulkDialog === "archive"}
        onClose={() => setBulkDialog(null)}
        onConfirm={() => runBulk("archive")}
        title={`Archive ${selected.length} product${selected.length === 1 ? "" : "s"}?`}
        message="Archived products stop appearing in the app but are never deleted, so this can be undone."
        confirmLabel="Archive"
        loading={pending}
      />
    </>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold text-[var(--hm-ink-700)]">{label}</span>
      <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </Select>
    </div>
  );
}
