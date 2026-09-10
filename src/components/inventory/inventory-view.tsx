"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Download,
  History,
  PackageX,
  Search,
  Settings2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";
import { Table, TableCard, TableScroll, TableToolbar, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/utils/format";
import {
  adjustStockAction,
  commitInventoryImportAction,
  previewInventoryImportAction,
  setThresholdAction,
  type ImportPreview,
} from "@/server/actions/inventory";
import { ProductThumb } from "@/components/products/product-card-preview";
import type { Category, InventoryMovement, Product } from "@/types";

const MOVEMENT_LABEL: Record<InventoryMovement["type"], string> = {
  manual_add: "Manual add",
  manual_remove: "Manual remove",
  manual_set: "Manual set",
  order_reserve: "Reserved for order",
  order_release: "Released from order",
  order_fulfil: "Order fulfilled",
  import: "CSV import",
};

const VIEWS = [
  { key: "all", label: "All tracked" },
  { key: "low", label: "Low stock" },
  { key: "out", label: "Out of stock" },
  { key: "healthy", label: "Healthy" },
] as const;

export function InventoryView({
  products,
  categories,
  movements,
  canWrite,
}: {
  products: Product[];
  categories: Category[];
  movements: InventoryMovement[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [mode, setMode] = useState<"add" | "remove" | "set">("add");
  const [amount, setAmount] = useState("1");
  const [reason, setReason] = useState("");
  const [thresholdFor, setThresholdFor] = useState<Product | null>(null);
  const [thresholdValue, setThresholdValue] = useState("15");
  const [historyFor, setHistoryFor] = useState<Product | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importReason, setImportReason] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  const view = params.get("view") ?? "all";
  const categoryFilter = params.get("category") ?? "all";

  const setParam = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
    },
    [params, pathname, router],
  );

  const tracked = useMemo(() => products.filter((p) => p.inventory.track), [products]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tracked
      .filter((p) => {
        const available = p.inventory.stockOnHand - p.inventory.reserved;
        if (view === "out") return p.inventory.stockOnHand <= 0;
        if (view === "low")
          return p.inventory.stockOnHand > 0 && p.inventory.stockOnHand <= p.inventory.lowStockThreshold;
        if (view === "healthy")
          return p.inventory.stockOnHand > p.inventory.lowStockThreshold && available > 0;
        return true;
      })
      .filter((p) => (categoryFilter === "all" ? true : p.categoryId === categoryFilter))
      .filter((p) =>
        q ? p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) : true,
      )
      .sort((a, b) => {
        const urgency = (p: Product) =>
          p.inventory.stockOnHand <= 0
            ? 0
            : p.inventory.stockOnHand <= p.inventory.lowStockThreshold
              ? 1
              : 2;
        return urgency(a) - urgency(b) || a.inventory.stockOnHand - b.inventory.stockOnHand;
      });
  }, [tracked, view, categoryFilter, search]);

  const counts = useMemo(
    () => ({
      all: tracked.length,
      out: tracked.filter((p) => p.inventory.stockOnHand <= 0).length,
      low: tracked.filter(
        (p) => p.inventory.stockOnHand > 0 && p.inventory.stockOnHand <= p.inventory.lowStockThreshold,
      ).length,
      healthy: tracked.filter((p) => p.inventory.stockOnHand > p.inventory.lowStockThreshold).length,
      units: tracked.reduce((s, p) => s + p.inventory.stockOnHand, 0),
      reserved: tracked.reduce((s, p) => s + p.inventory.reserved, 0),
    }),
    [tracked],
  );

  const openAdjust = (product: Product, preset: "add" | "remove" | "set" = "add") => {
    setAdjusting(product);
    setMode(preset);
    setAmount(preset === "set" ? String(product.inventory.stockOnHand) : "1");
    setReason("");
  };

  const submitAdjust = () => {
    if (!adjusting) return;
    startTransition(async () => {
      const result = await adjustStockAction({
        productId: adjusting.id,
        mode,
        amount: Number(amount),
        reason,
      });
      if (result.ok) {
        toast.success(`${adjusting.name}: ${result.message}`);
        setFlash(adjusting.id);
        window.setTimeout(() => setFlash(null), 900);
        setAdjusting(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const submitThreshold = () => {
    if (!thresholdFor) return;
    startTransition(async () => {
      const result = await setThresholdAction({
        productId: thresholdFor.id,
        threshold: Number(thresholdValue),
      });
      if (result.ok) {
        toast.success(result.message ?? "Updated");
        setThresholdFor(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const readCsv = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      startTransition(async () => {
        const result = await previewInventoryImportAction(String(reader.result ?? ""));
        if (result.ok) setPreview(result.data);
        else toast.error(result.error);
      });
    };
    reader.readAsText(file);
  };

  const commitImport = () => {
    if (!preview) return;
    startTransition(async () => {
      const result = await commitInventoryImportAction(preview.rows, importReason);
      if (result.ok) {
        toast.success(result.message ?? "Imported");
        setImportOpen(false);
        setPreview(null);
        setImportReason("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const exportCsv = () => {
    const header = ["sku", "name", "stock", "reserved", "available", "threshold"];
    const lines = rows.map((p) =>
      [
        p.sku,
        p.name,
        p.inventory.stockOnHand,
        p.inventory.reserved,
        p.inventory.stockOnHand - p.inventory.reserved,
        p.inventory.lowStockThreshold,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hashmimart-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const productMovements = historyFor
    ? movements.filter((m) => m.productId === historyFor.id)
    : movements;

  return (
    <>
      {/* Stock summary */}
      <div className="mb-4 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <SummaryTile label="Tracked products" value={formatNumber(counts.all)} tone="cyan" icon={<Boxes className="size-4.5" />} />
        <SummaryTile label="Units on hand" value={formatNumber(counts.units)} tone="info" icon={<ArrowDownToLine className="size-4.5" />} />
        <SummaryTile label="Low stock" value={formatNumber(counts.low)} tone="warning" icon={<AlertTriangle className="size-4.5" />} />
        <SummaryTile label="Out of stock" value={formatNumber(counts.out)} tone="danger" icon={<PackageX className="size-4.5" />} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setParam({ view: v.key === "all" ? null : v.key })}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors duration-[var(--hm-dur-fast)]",
              view === v.key
                ? "border-[var(--hm-cyan-300)] bg-[var(--hm-cyan-50)] text-[var(--hm-cyan-800)]"
                : "border-[var(--hm-border)] bg-white text-[var(--hm-ink-600,#475569)] hover:border-[var(--hm-cyan-200)]",
            )}
          >
            {v.label}
            <span className="ml-1.5 text-[11px] opacity-70 tabular-nums">{counts[v.key]}</span>
          </button>
        ))}
      </div>

      <TableCard>
        <TableToolbar>
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--hm-ink-400)]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product or SKU…"
              aria-label="Search inventory"
              className="pl-9"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-[var(--hm-ink-400)] hover:text-[var(--hm-ink-700)]"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          <Select
            value={categoryFilter}
            onChange={(e) => setParam({ category: e.target.value === "all" ? null : e.target.value })}
            aria-label="Filter by category"
            className="h-8 w-auto min-w-[150px] text-[12.5px]"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>

          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="size-4" />
            Export
          </Button>

          {canWrite ? (
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" />
              Import CSV
            </Button>
          ) : null}
        </TableToolbar>

        {rows.length === 0 ? (
          <EmptyState
            title="Nothing in this view"
            message="Adjust the filters, or check that products have stock tracking switched on."
            icon={<Boxes className="size-5" />}
          />
        ) : (
          <TableScroll>
            <Table className="min-w-[900px]">
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th align="right">On hand</Th>
                  <Th align="right">Reserved</Th>
                  <Th align="right">Available</Th>
                  <Th align="right">Threshold</Th>
                  <Th>State</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((product) => {
                  const available = product.inventory.stockOnHand - product.inventory.reserved;
                  const out = product.inventory.stockOnHand <= 0;
                  const low = !out && product.inventory.stockOnHand <= product.inventory.lowStockThreshold;
                  return (
                    <Tr
                      key={product.id}
                      className={cn(flash === product.id && "bg-[var(--hm-success-50)]")}
                    >
                      <Td>
                        <div className="flex items-center gap-3">
                          <ProductThumb
                            imageUrl={product.media?.cutout?.url ?? product.media?.original.url}
                            emoji={product.emojiFallback}
                            palette={product.media?.palette}
                            size={34}
                          />
                          <div className="min-w-0">
                            <Link
                              href={`/products/${product.id}`}
                              className="block truncate text-[13px] font-semibold text-[var(--hm-ink-900)] hover:text-[var(--hm-cyan-700)]"
                            >
                              {product.name}
                            </Link>
                            <span className="text-[11.5px] text-[var(--hm-ink-500)]">
                              <code className="font-mono">{product.sku}</code> · {product.unit.label}
                            </span>
                          </div>
                        </div>
                      </Td>
                      <Td align="right">
                        <span
                          className={cn(
                            "text-[14px] font-bold tabular-nums",
                            out
                              ? "text-[var(--hm-danger-700)]"
                              : low
                                ? "text-[var(--hm-warning-700)]"
                                : "text-[var(--hm-ink-900)]",
                          )}
                        >
                          {product.inventory.stockOnHand}
                        </span>
                      </Td>
                      <Td align="right" className="tabular-nums">{product.inventory.reserved}</Td>
                      <Td align="right" className="font-semibold tabular-nums">{Math.max(0, available)}</Td>
                      <Td align="right" className="tabular-nums">{product.inventory.lowStockThreshold}</Td>
                      <Td>
                        {out ? (
                          <Chip tone="danger">Out</Chip>
                        ) : low ? (
                          <Chip tone="warning">Low</Chip>
                        ) : (
                          <Chip tone="success">Healthy</Chip>
                        )}
                      </Td>
                      <Td align="right">
                        <div className="flex items-center justify-end gap-1">
                          {canWrite ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openAdjust(product, "add")}
                                aria-label={`Add stock to ${product.name}`}
                                title="Add stock"
                                className="rounded-[8px] p-1.5 text-[var(--hm-ink-400)] transition-colors hover:bg-[var(--hm-success-50)] hover:text-[var(--hm-success-700)]"
                              >
                                <ArrowDownToLine className="size-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openAdjust(product, "remove")}
                                aria-label={`Remove stock from ${product.name}`}
                                title="Remove stock"
                                className="rounded-[8px] p-1.5 text-[var(--hm-ink-400)] transition-colors hover:bg-[var(--hm-danger-50)] hover:text-[var(--hm-danger-700)]"
                              >
                                <ArrowUpFromLine className="size-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setThresholdFor(product);
                                  setThresholdValue(String(product.inventory.lowStockThreshold));
                                }}
                                aria-label={`Set threshold for ${product.name}`}
                                title="Set threshold"
                                className="rounded-[8px] p-1.5 text-[var(--hm-ink-400)] transition-colors hover:bg-[var(--hm-ink-100)] hover:text-[var(--hm-ink-800)]"
                              >
                                <Settings2 className="size-4" />
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setHistoryFor(product)}
                            aria-label={`Movement history for ${product.name}`}
                            title="Movement history"
                            className="rounded-[8px] p-1.5 text-[var(--hm-ink-400)] transition-colors hover:bg-[var(--hm-cyan-50)] hover:text-[var(--hm-cyan-700)]"
                          >
                            <History className="size-4" />
                          </button>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </TableScroll>
        )}
      </TableCard>

      {/* Recent movements */}
      <Card className="mt-4">
        <CardHeader
          title="Recent stock movements"
          subtitle="Every mutation writes an immutable record — nothing is edited in place"
          action={
            <button
              type="button"
              onClick={() => setHistoryFor(null)}
              className="text-[12.5px] font-semibold text-[var(--hm-cyan-700)] hover:underline"
            >
              Show all
            </button>
          }
        />
        {movements.length === 0 ? (
          <EmptyState title="No movements recorded yet" />
        ) : (
          <ul className="divide-y divide-[var(--hm-border)]">
            {movements.slice(0, 10).map((movement) => (
              <MovementRow key={movement.id} movement={movement} />
            ))}
          </ul>
        )}
      </Card>

      {/* Adjust dialog */}
      <Dialog
        open={adjusting !== null}
        onClose={() => setAdjusting(null)}
        title={`Adjust stock — ${adjusting?.name ?? ""}`}
        description="The reason is stored permanently on the movement record."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAdjusting(null)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submitAdjust} loading={pending} disabled={!reason.trim()}>
              Apply
            </Button>
          </>
        }
      >
        {adjusting ? (
          <div className="flex flex-col gap-4">
            <p className="rounded-[var(--hm-radius-control)] bg-[var(--hm-ink-50)] px-3 py-2.5 text-[13px] text-[var(--hm-ink-700)]">
              Currently <strong>{adjusting.inventory.stockOnHand}</strong> on hand
              {adjusting.inventory.reserved > 0 ? `, ${adjusting.inventory.reserved} reserved` : ""}.
              {mode !== "set" ? (
                <>
                  {" "}
                  After this: <strong>
                    {mode === "add"
                      ? adjusting.inventory.stockOnHand + (Number(amount) || 0)
                      : Math.max(0, adjusting.inventory.stockOnHand - (Number(amount) || 0))}
                  </strong>
                </>
              ) : null}
            </p>

            <div className="flex gap-1.5">
              {(["add", "remove", "set"] as const).map((m) => (
                <Button
                  key={m}
                  variant={mode === m ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => {
                    setMode(m);
                    setAmount(m === "set" ? String(adjusting.inventory.stockOnHand) : "1");
                  }}
                >
                  {m === "add" ? "Add" : m === "remove" ? "Remove" : "Set to"}
                </Button>
              ))}
            </div>

            <Field label={mode === "set" ? "New stock level" : "Quantity"} htmlFor="amount" required>
              <Input
                id="amount"
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </Field>

            <Field label="Reason" htmlFor="adjust-reason" required>
              <Textarea
                id="adjust-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Supplier delivery received"
              />
            </Field>
          </div>
        ) : null}
      </Dialog>

      {/* Threshold dialog */}
      <Dialog
        open={thresholdFor !== null}
        onClose={() => setThresholdFor(null)}
        title={`Low-stock threshold — ${thresholdFor?.name ?? ""}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setThresholdFor(null)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submitThreshold} loading={pending}>Save</Button>
          </>
        }
      >
        <Field
          label="Alert when stock reaches"
          htmlFor="threshold-value"
          hint="The dashboard and inventory alerts use this number"
        >
          <Input
            id="threshold-value"
            type="number"
            min={0}
            value={thresholdValue}
            onChange={(e) => setThresholdValue(e.target.value)}
            autoFocus
          />
        </Field>
      </Dialog>

      {/* Movement history */}
      <Dialog
        open={historyFor !== null}
        onClose={() => setHistoryFor(null)}
        title={historyFor ? `Movement history — ${historyFor.name}` : "Movement history"}
        variant="drawer"
      >
        {productMovements.length === 0 ? (
          <EmptyState title="No movements for this product yet" />
        ) : (
          <ul className="divide-y divide-[var(--hm-border)]">
            {productMovements.map((movement) => (
              <MovementRow key={movement.id} movement={movement} showProduct={!historyFor} />
            ))}
          </ul>
        )}
      </Dialog>

      {/* CSV import with dry-run preview */}
      <Dialog
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          setPreview(null);
        }}
        title="Import stock from CSV"
        description="Nothing is written until you review the preview and confirm."
        size="lg"
        footer={
          preview ? (
            <>
              <Button variant="outline" onClick={() => setPreview(null)} disabled={pending}>
                Choose another file
              </Button>
              <Button
                onClick={commitImport}
                loading={pending}
                disabled={preview.applicable === 0 || !importReason.trim()}
              >
                Apply {preview.applicable} row{preview.applicable === 1 ? "" : "s"}
              </Button>
            </>
          ) : null
        }
      >
        {!preview ? (
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-[var(--hm-ink-600,#475569)]">
              The file needs a <code className="rounded bg-[var(--hm-ink-100)] px-1">sku</code> column
              plus <code className="rounded bg-[var(--hm-ink-100)] px-1">stock</code> and/or{" "}
              <code className="rounded bg-[var(--hm-ink-100)] px-1">threshold</code>. Export first to
              get the exact shape.
            </p>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[var(--hm-radius-card)] border-2 border-dashed border-[var(--hm-border-strong)] bg-[var(--hm-ink-50)] px-6 py-10 text-center">
              <Upload className="size-6 text-[var(--hm-cyan-600)]" />
              <span className="text-[13.5px] font-semibold text-[var(--hm-ink-900)]">
                Choose a CSV file
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) readCsv(file);
                }}
              />
            </label>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2 text-[12.5px]">
              <Chip tone="success">{preview.applicable} will apply</Chip>
              {preview.problems > 0 ? <Chip tone="danger">{preview.problems} problems</Chip> : null}
              <Chip tone="neutral">
                {preview.rows.filter((r) => r.status === "unchanged").length} unchanged
              </Chip>
            </div>

            <Field label="Reason for this import" htmlFor="import-reason" required>
              <Input
                id="import-reason"
                value={importReason}
                onChange={(e) => setImportReason(e.target.value)}
                placeholder="Monthly stock count"
              />
            </Field>

            <div className="max-h-[320px] overflow-y-auto rounded-[var(--hm-radius-card)] border border-[var(--hm-border)]">
              <Table>
                <thead>
                  <tr>
                    <Th>Line</Th>
                    <Th>SKU</Th>
                    <Th>Product</Th>
                    <Th align="right">Current</Th>
                    <Th align="right">New</Th>
                    <Th>Result</Th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <Tr key={row.line}>
                      <Td className="tabular-nums">{row.line}</Td>
                      <Td><code className="font-mono">{row.sku || "—"}</code></Td>
                      <Td className="max-w-[180px] truncate">{row.productName ?? "—"}</Td>
                      <Td align="right" className="tabular-nums">{row.currentStock ?? "—"}</Td>
                      <Td align="right" className="tabular-nums">
                        {row.stock ?? "—"}
                        {row.threshold !== null ? (
                          <span className="ml-1 text-[10.5px] text-[var(--hm-ink-400)]">
                            (t{row.threshold})
                          </span>
                        ) : null}
                      </Td>
                      <Td>
                        <Chip
                          tone={
                            row.status === "ok"
                              ? "success"
                              : row.status === "unchanged"
                                ? "neutral"
                                : "danger"
                          }
                        >
                          {row.status === "ok" ? "Apply" : (row.message ?? row.status)}
                        </Chip>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

function MovementRow({
  movement,
  showProduct = true,
}: {
  movement: InventoryMovement;
  showProduct?: boolean;
}) {
  const positive = movement.delta > 0;
  const neutral = movement.delta === 0;
  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <span
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[8px]",
          neutral
            ? "bg-[var(--hm-ink-100)] text-[var(--hm-ink-500)]"
            : positive
              ? "bg-[var(--hm-success-50)] text-[var(--hm-success-700)]"
              : "bg-[var(--hm-danger-50)] text-[var(--hm-danger-700)]",
        )}
      >
        {positive ? <ArrowDownToLine className="size-3.5" /> : <ArrowUpFromLine className="size-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-[var(--hm-ink-800)]">
          {showProduct ? <strong className="font-semibold">{movement.productName}</strong> : null}{" "}
          <span className="text-[var(--hm-ink-500)]">{MOVEMENT_LABEL[movement.type]}</span>
          {!neutral ? (
            <span className={cn("ml-1.5 font-bold", positive ? "text-[var(--hm-success-700)]" : "text-[var(--hm-danger-700)]")}>
              {positive ? "+" : ""}
              {movement.delta}
            </span>
          ) : null}
          {!neutral ? (
            <span className="ml-1.5 text-[11.5px] text-[var(--hm-ink-400)] tabular-nums">
              {movement.before} → {movement.after}
            </span>
          ) : null}
        </p>
        <p className="truncate text-[11.5px] text-[var(--hm-ink-500)]">{movement.reason}</p>
        <p className="text-[11px] text-[var(--hm-ink-400)]" title={formatDateTime(movement.createdAt)}>
          {movement.actorName} · {formatRelative(movement.createdAt)}
          {movement.orderId ? (
            <>
              {" · "}
              <Link href={`/orders/${movement.orderId}`} className="hover:underline">
                order
              </Link>
            </>
          ) : null}
        </p>
      </div>
    </li>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: "cyan" | "info" | "warning" | "danger";
  icon: React.ReactNode;
}) {
  const tones = {
    cyan: "bg-[var(--hm-cyan-50)] text-[var(--hm-cyan-700)]",
    info: "bg-[var(--hm-info-50)] text-[var(--hm-info-700)]",
    warning: "bg-[var(--hm-warning-50)] text-[var(--hm-warning-700)]",
    danger: "bg-[var(--hm-danger-50)] text-[var(--hm-danger-700)]",
  };
  return (
    <Card className="hm-elevate">
      <CardBody className="flex items-center gap-3 p-4">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[10px]", tones[tone])}>
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-[20px] leading-none font-bold text-[var(--hm-ink-900)] tabular-nums">
            {value}
          </span>
          <span className="mt-1 block truncate text-[12px] text-[var(--hm-ink-500)]">{label}</span>
        </span>
      </CardBody>
    </Card>
  );
}
