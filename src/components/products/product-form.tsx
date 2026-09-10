"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Archive,
  Check,
  ImageIcon,
  Info,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { UnsavedGuard } from "@/components/admin-shell/unsaved-guard";
import { MediaStudio } from "@/components/media-studio/media-studio";
import { cn } from "@/lib/utils/cn";
import { formatPKR, slugify } from "@/lib/utils/format";
import { discountPercent, savingsAmount } from "@/lib/utils/pricing";
import { evaluateProduct, UNIT_TYPES } from "@/lib/validation/product";
import {
  archiveProductAction,
  deleteProductAction,
  saveProductAction,
} from "@/server/actions/products";
import type { Category, Product, ProductMedia, Vendor } from "@/types";
import { ProductCardPreview } from "./product-card-preview";

type Draft = ReturnType<typeof emptyDraft>;

function emptyDraft(defaultThreshold: number) {
  return {
    id: undefined as string | undefined,
    name: "",
    slug: "",
    sku: "",
    barcode: "",
    brand: "HashmiMart",
    description: "",
    categoryId: "",
    subcategoryId: null as string | null,
    shoppingMode: "retail" as Product["shoppingMode"],
    wholesaleOptions: [] as number[],
    tags: [] as string[],
    emojiFallback: "",
    unit: { type: "pc" as Product["unit"]["type"], quantity: 1, label: "1 piece" },
    pricing: {
      price: 0,
      compareAtPrice: null as number | null,
      cost: null as number | null,
      currency: "PKR" as const,
      taxBehavior: "inclusive" as Product["pricing"]["taxBehavior"],
    },
    inventory: {
      track: true,
      stockOnHand: 0,
      reserved: 0,
      lowStockThreshold: defaultThreshold,
      allowOutOfStockVisibility: true,
    },
    media: null as ProductMedia | null,
    merchandising: {
      featured: false,
      bestseller: false,
      isNew: true,
      deal: false,
      sortScore: 50,
      searchKeywords: [] as string[],
    },
    availability: {
      status: "draft" as Product["availability"]["status"],
      publishedAt: null as string | null,
      scheduledPublishAt: null as string | null,
      vendorIds: [] as string[],
    },
    seo: { shareTitle: "", shareDescription: "" },
  };
}

function fromProduct(product: Product): Draft {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    barcode: product.barcode ?? "",
    brand: product.brand ?? "",
    description: product.description ?? "",
    categoryId: product.categoryId,
    subcategoryId: product.subcategoryId ?? null,
    shoppingMode: product.shoppingMode,
    wholesaleOptions: product.wholesaleOptions ?? [],
    tags: product.tags,
    emojiFallback: product.emojiFallback ?? "",
    unit: product.unit,
    pricing: {
      price: product.pricing.price,
      compareAtPrice: product.pricing.compareAtPrice ?? null,
      cost: product.pricing.cost ?? null,
      currency: "PKR",
      taxBehavior: product.pricing.taxBehavior,
    },
    inventory: product.inventory,
    media: product.media,
    merchandising: product.merchandising,
    availability: {
      status: product.availability.status,
      publishedAt: product.availability.publishedAt ?? null,
      scheduledPublishAt: product.availability.scheduledPublishAt ?? null,
      vendorIds: product.availability.vendorIds,
    },
    seo: {
      shareTitle: product.seo?.shareTitle ?? "",
      shareDescription: product.seo?.shareDescription ?? "",
    },
  };
}

/** Shape the draft into exactly what the Zod schema expects. */
function toPayload(draft: Draft) {
  return {
    ...draft,
    barcode: draft.barcode || null,
    brand: draft.brand || null,
    description: draft.description || null,
    emojiFallback: draft.emojiFallback || null,
    wholesaleOptions: draft.shoppingMode === "wholesale" ? draft.wholesaleOptions : undefined,
    seo: {
      shareTitle: draft.seo.shareTitle || null,
      shareDescription: draft.seo.shareDescription || null,
    },
  };
}

const CHECKPOINTS = [
  { key: "basics", label: "Basics valid" },
  { key: "media", label: "Media prepared" },
  { key: "pricingInventory", label: "Pricing + inventory valid" },
  { key: "publishable", label: "Ready to publish" },
] as const;

export function ProductForm({
  product,
  categories,
  vendors,
  defaultThreshold,
  canPublish,
}: {
  product: Product | null;
  categories: Category[];
  vendors: Vendor[];
  defaultThreshold: number;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(() =>
    product ? fromProduct(product) : emptyDraft(defaultThreshold),
  );
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [studioOpen, setStudioOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "archive" | "delete">(null);
  const [reason, setReason] = useState("");
  const [justPublished, setJustPublished] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const update = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const checklist = useMemo(() => evaluateProduct(toPayload(draft)), [draft]);

  const errorFor = (path: string) => errors[path];

  const submit = (intent: "draft" | "publish" | "update") => {
    setErrors({});
    startTransition(async () => {
      const result = await saveProductAction(toPayload(draft), intent);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      setDirty(false);
      toast.success(result.message ?? "Saved");
      if (intent === "publish") {
        setJustPublished(true);
        window.setTimeout(() => setJustPublished(false), 900);
      }
      if (!draft.id) {
        router.replace(`/products/${result.data.id}`);
      } else {
        setDraft((prev) => ({
          ...prev,
          availability: { ...prev.availability, status: result.data.status },
        }));
      }
      router.refresh();
    });
  };

  const runDestructive = (kind: "archive" | "delete") => {
    startTransition(async () => {
      const action =
        kind === "archive"
          ? archiveProductAction(draft.id!, reason)
          : deleteProductAction(draft.id!, reason);
      const result = await action;
      if (result.ok) {
        toast.success(result.message ?? "Done");
        setConfirm(null);
        setReason("");
        setDirty(false);
        router.push("/products");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const discount = discountPercent(draft.pricing);
  const savings = savingsAmount(draft.pricing);
  const previewImage = draft.media?.cutout?.url ?? draft.media?.original.url ?? null;

  return (
    <>
      <UnsavedGuard when={dirty} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          {/* Basics */}
          <Card>
            <CardHeader title="Basics" subtitle="What the product is and where it sits" />
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Product name" htmlFor="name" required error={errorFor("name")} className="sm:col-span-2">
                <Input
                  id="name"
                  value={draft.name}
                  invalid={Boolean(errorFor("name"))}
                  onChange={(e) => {
                    const name = e.target.value;
                    setDraft((prev) => ({
                      ...prev,
                      name,
                      // Keep the slug in step until it has been edited by hand.
                      slug: !prev.id && (prev.slug === "" || prev.slug === slugify(prev.name))
                        ? slugify(name)
                        : prev.slug,
                    }));
                    setDirty(true);
                  }}
                  placeholder="Fresh Tomatoes"
                />
              </Field>

              <Field label="Slug" htmlFor="slug" required error={errorFor("slug")} hint="Used in links and by the app">
                <Input
                  id="slug"
                  value={draft.slug}
                  invalid={Boolean(errorFor("slug"))}
                  onChange={(e) => update("slug", slugify(e.target.value))}
                  placeholder="fresh-tomatoes"
                  className="font-mono"
                />
              </Field>

              <Field label="SKU" htmlFor="sku" required error={errorFor("sku")}>
                <Input
                  id="sku"
                  value={draft.sku}
                  invalid={Boolean(errorFor("sku"))}
                  onChange={(e) => update("sku", e.target.value.toUpperCase())}
                  placeholder="HM-0001"
                  className="font-mono"
                />
              </Field>

              <Field label="Barcode" htmlFor="barcode" hint="Optional">
                <Input id="barcode" value={draft.barcode} onChange={(e) => update("barcode", e.target.value)} />
              </Field>

              <Field label="Brand" htmlFor="brand">
                <Input id="brand" value={draft.brand} onChange={(e) => update("brand", e.target.value)} />
              </Field>

              <Field label="Category" htmlFor="category" required error={errorFor("categoryId")}>
                <Select
                  id="category"
                  value={draft.categoryId}
                  invalid={Boolean(errorFor("categoryId"))}
                  onChange={(e) => update("categoryId", e.target.value)}
                >
                  <option value="">Choose a category…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Shopping mode" htmlFor="mode" hint="Retail or wholesale storefront">
                <Select
                  id="mode"
                  value={draft.shoppingMode}
                  onChange={(e) => update("shoppingMode", e.target.value as Product["shoppingMode"])}
                >
                  <option value="retail">Retail</option>
                  <option value="wholesale">Wholesale</option>
                </Select>
              </Field>

              {draft.shoppingMode === "wholesale" ? (
                <Field
                  label="Wholesale quantity ladder"
                  htmlFor="ladder"
                  hint="Comma-separated pack sizes offered at bulk rates, e.g. 5, 10, 25, 50"
                  className="sm:col-span-2"
                >
                  <Input
                    id="ladder"
                    value={draft.wholesaleOptions.join(", ")}
                    onChange={(e) =>
                      update(
                        "wholesaleOptions",
                        e.target.value
                          .split(",")
                          .map((v) => Number(v.trim()))
                          .filter((v) => Number.isFinite(v) && v > 0),
                      )
                    }
                    placeholder="5, 10, 25, 50"
                  />
                </Field>
              ) : null}

              <Field
                label="Description"
                htmlFor="description"
                error={errorFor("description")}
                hint="At least 10 characters before this product can be published"
                className="sm:col-span-2"
              >
                <Textarea
                  id="description"
                  value={draft.description}
                  invalid={Boolean(errorFor("description"))}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="Farm-fresh tomatoes picked daily."
                />
              </Field>

              <Field label="Tags" htmlFor="tags" hint="Press Enter to add" className="sm:col-span-2">
                <div>
                  <Input
                    id="tags"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const value = tagInput.trim().toLowerCase();
                        if (value && !draft.tags.includes(value)) {
                          update("tags", [...draft.tags, value]);
                        }
                        setTagInput("");
                      }
                    }}
                    placeholder="vegetables, fresh"
                  />
                  {draft.tags.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {draft.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full bg-[var(--hm-ink-100)] py-1 pr-1.5 pl-2.5 text-[12px] text-[var(--hm-ink-700)]"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => update("tags", draft.tags.filter((t) => t !== tag))}
                            aria-label={`Remove tag ${tag}`}
                            className="rounded-full p-0.5 hover:bg-[var(--hm-ink-200)]"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Field>
            </CardBody>
          </Card>

          {/* Pricing */}
          <Card>
            <CardHeader
              title="Pricing"
              subtitle="Selling price, compare-at price and tax behaviour"
              action={
                discount !== null ? (
                  <Chip tone="danger">-{discount}% · saves {formatPKR(savings ?? 0)}</Chip>
                ) : null
              }
            />
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Selling price (PKR)" htmlFor="price" required error={errorFor("pricing.price")}>
                <Input
                  id="price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.pricing.price}
                  invalid={Boolean(errorFor("pricing.price"))}
                  onChange={(e) =>
                    update("pricing", { ...draft.pricing, price: Number(e.target.value) })
                  }
                />
              </Field>
              <Field
                label="Compare-at price"
                htmlFor="compare"
                error={errorFor("pricing.compareAtPrice")}
                hint="Shown struck through"
              >
                <Input
                  id="compare"
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.pricing.compareAtPrice ?? ""}
                  invalid={Boolean(errorFor("pricing.compareAtPrice"))}
                  onChange={(e) =>
                    update("pricing", {
                      ...draft.pricing,
                      compareAtPrice: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Cost" htmlFor="cost" hint="Internal only, never shown">
                <Input
                  id="cost"
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.pricing.cost ?? ""}
                  onChange={(e) =>
                    update("pricing", {
                      ...draft.pricing,
                      cost: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Tax behaviour" htmlFor="tax" className="sm:col-span-3">
                <Select
                  id="tax"
                  value={draft.pricing.taxBehavior}
                  onChange={(e) =>
                    update("pricing", {
                      ...draft.pricing,
                      taxBehavior: e.target.value as Product["pricing"]["taxBehavior"],
                    })
                  }
                >
                  <option value="inclusive">Price includes tax</option>
                  <option value="exclusive">Tax added at checkout</option>
                  <option value="exempt">Exempt</option>
                </Select>
              </Field>
            </CardBody>
          </Card>

          {/* Unit & pack */}
          <Card>
            <CardHeader title="Unit & pack" subtitle="How the product is sold" />
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Unit type" htmlFor="unitType">
                <Select
                  id="unitType"
                  value={draft.unit.type}
                  onChange={(e) =>
                    update("unit", { ...draft.unit, type: e.target.value as Product["unit"]["type"] })
                  }
                >
                  {UNIT_TYPES.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Quantity / size" htmlFor="unitQty" required error={errorFor("unit.quantity")}>
                <Input
                  id="unitQty"
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.unit.quantity}
                  invalid={Boolean(errorFor("unit.quantity"))}
                  onChange={(e) => {
                    const quantity = Number(e.target.value);
                    setDraft((prev) => ({
                      ...prev,
                      unit: { ...prev.unit, quantity, label: `${quantity} ${prev.unit.type}` },
                    }));
                    setDirty(true);
                  }}
                />
              </Field>
              <Field label="Display label" htmlFor="unitLabel" required error={errorFor("unit.label")}>
                <Input
                  id="unitLabel"
                  value={draft.unit.label}
                  invalid={Boolean(errorFor("unit.label"))}
                  onChange={(e) => update("unit", { ...draft.unit, label: e.target.value })}
                  placeholder="1 kg"
                />
              </Field>
            </CardBody>
          </Card>

          {/* Inventory */}
          <Card>
            <CardHeader title="Inventory" subtitle="Stock tracking and low-stock alerting" />
            <CardBody className="flex flex-col gap-4">
              <Switch
                checked={draft.inventory.track}
                onChange={(track) => update("inventory", { ...draft.inventory, track })}
                label="Track stock for this product"
                description="Turn off for items you never run out of, like service fees."
              />
              {draft.inventory.track ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field
                    label="Stock on hand"
                    htmlFor="stock"
                    error={errorFor("inventory.stockOnHand")}
                    hint={product ? "Change stock from Inventory so a movement is logged" : undefined}
                  >
                    <Input
                      id="stock"
                      type="number"
                      min={0}
                      value={draft.inventory.stockOnHand}
                      disabled={Boolean(product)}
                      invalid={Boolean(errorFor("inventory.stockOnHand"))}
                      onChange={(e) =>
                        update("inventory", {
                          ...draft.inventory,
                          stockOnHand: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="Low-stock threshold" htmlFor="threshold" error={errorFor("inventory.lowStockThreshold")}>
                    <Input
                      id="threshold"
                      type="number"
                      min={0}
                      value={draft.inventory.lowStockThreshold}
                      onChange={(e) =>
                        update("inventory", {
                          ...draft.inventory,
                          lowStockThreshold: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="Reserved" htmlFor="reserved" hint="Held by confirmed orders">
                    <Input id="reserved" type="number" value={draft.inventory.reserved} disabled />
                  </Field>
                </div>
              ) : null}
              <Switch
                checked={draft.inventory.allowOutOfStockVisibility}
                onChange={(allowOutOfStockVisibility) =>
                  update("inventory", { ...draft.inventory, allowOutOfStockVisibility })
                }
                label="Keep visible when out of stock"
                description="Shown with an Out of stock badge rather than hidden from the app."
              />
            </CardBody>
          </Card>

          {/* Media */}
          <Card>
            <CardHeader
              title="Media"
              subtitle="Image, cutout, palette and card background"
              action={
                <Button variant={draft.media ? "outline" : "primary"} size="sm" onClick={() => setStudioOpen(true)}>
                  <Sparkles className="size-4" />
                  {draft.media ? "Replace media" : "Open media studio"}
                </Button>
              }
            />
            <CardBody>
              {draft.media ? (
                <div className="flex flex-col gap-4 sm:flex-row">
                  <ProductCardPreview
                    name={draft.name}
                    unitLabel={draft.unit.label}
                    price={draft.pricing.price}
                    compareAtPrice={draft.pricing.compareAtPrice}
                    imageUrl={previewImage}
                    emoji={draft.emojiFallback}
                    palette={draft.media.palette}
                    outOfStock={draft.inventory.track && draft.inventory.stockOnHand <= 0}
                  />
                  <dl className="min-w-0 flex-1 space-y-2 text-[12.5px]">
                    <Row label="Source">
                      {draft.media.source.provider}
                      {draft.media.source.author ? ` · ${draft.media.source.author}` : ""}
                    </Row>
                    <Row label="Attribution">{draft.media.source.attributionText ?? "—"}</Row>
                    <Row label="Delivery">
                      {draft.media.source.hotlinkOnly
                        ? "Hotlinked as the provider's terms require"
                        : "Stored in HashmiMart media storage"}
                    </Row>
                    <Row label="Background removed">
                      {draft.media.processing.backgroundRemoved
                        ? `Yes — ${draft.media.processing.model} (${draft.media.processing.modelVersion})`
                        : "No"}
                    </Row>
                    <Row label="Card colour">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="size-3.5 rounded-full border border-[var(--hm-border)]"
                          style={{ background: draft.media.palette.cardBg }}
                        />
                        <code className="font-mono">{draft.media.palette.cardBg}</code>
                      </span>
                    </Row>
                    {draft.media.processing.failureReason ? (
                      <p className="flex items-start gap-1.5 text-[12px] text-[var(--hm-warning-700)]">
                        <AlertTriangle className="mt-px size-3.5 shrink-0" />
                        {draft.media.processing.failureReason}
                      </p>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 text-[var(--hm-danger-700)]"
                      onClick={() => update("media", null)}
                    >
                      <Trash2 className="size-3.5" />
                      Remove media
                    </Button>
                  </dl>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-[var(--hm-radius-card)] border border-dashed border-[var(--hm-border-strong)] bg-[var(--hm-ink-50)] px-6 py-9 text-center">
                  <span className="flex size-11 items-center justify-center rounded-[13px] bg-[var(--hm-cyan-50)] text-[var(--hm-cyan-700)]">
                    <ImageIcon className="size-5" />
                  </span>
                  <div>
                    <p className="text-[13.5px] font-semibold text-[var(--hm-ink-900)]">No media yet</p>
                    <p className="mt-1 max-w-md text-[12.5px] text-[var(--hm-ink-500)]">
                      Search Pixabay, Pexels or Unsplash, or upload a packshot. The studio removes the
                      background, extracts the palette and generates the card colour.
                    </p>
                  </div>
                  <Button onClick={() => setStudioOpen(true)}>
                    <Sparkles className="size-4" />
                    Open media studio
                  </Button>
                </div>
              )}

              <Field
                label="Emoji fallback"
                htmlFor="emoji"
                hint="Shown when there is no image, matching the existing storefront"
                className="mt-4 max-w-[220px]"
              >
                <Input
                  id="emoji"
                  value={draft.emojiFallback}
                  onChange={(e) => update("emojiFallback", e.target.value)}
                  placeholder="🍅"
                  maxLength={8}
                />
              </Field>
            </CardBody>
          </Card>

          {/* Merchandising */}
          <Card>
            <CardHeader title="Merchandising" subtitle="How the product surfaces in the app" />
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-3">
                <Switch
                  checked={draft.merchandising.featured}
                  onChange={(featured) => update("merchandising", { ...draft.merchandising, featured })}
                  label="Featured"
                />
                <Switch
                  checked={draft.merchandising.bestseller}
                  onChange={(bestseller) => update("merchandising", { ...draft.merchandising, bestseller })}
                  label="Bestseller"
                />
                <Switch
                  checked={draft.merchandising.isNew}
                  onChange={(isNew) => update("merchandising", { ...draft.merchandising, isNew })}
                  label="New"
                />
                <Switch
                  checked={draft.merchandising.deal}
                  onChange={(deal) => update("merchandising", { ...draft.merchandising, deal })}
                  label="Deal badge"
                />
              </div>
              <div className="flex flex-col gap-4">
                <Field label="Sort score" htmlFor="sortScore" hint="Higher sorts earlier in listings">
                  <Input
                    id="sortScore"
                    type="number"
                    value={draft.merchandising.sortScore}
                    onChange={(e) =>
                      update("merchandising", {
                        ...draft.merchandising,
                        sortScore: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Extra search keywords" htmlFor="keywords" hint="Comma separated">
                  <Input
                    id="keywords"
                    value={draft.merchandising.searchKeywords.join(", ")}
                    onChange={(e) =>
                      update("merchandising", {
                        ...draft.merchandising,
                        searchKeywords: e.target.value
                          .split(",")
                          .map((v) => v.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="tamatar, timatar"
                  />
                </Field>
              </div>
            </CardBody>
          </Card>

          {/* Availability */}
          <Card>
            <CardHeader title="Availability" subtitle="Status, scheduling and vendor coverage" />
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Status" htmlFor="status">
                <Select
                  id="status"
                  value={draft.availability.status}
                  onChange={(e) =>
                    update("availability", {
                      ...draft.availability,
                      status: e.target.value as Product["availability"]["status"],
                    })
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="active" disabled={!canPublish}>Active</option>
                  <option value="archived">Archived</option>
                </Select>
              </Field>
              <Field label="Scheduled publish" htmlFor="schedule" hint="Optional — leave blank to publish manually">
                <Input
                  id="schedule"
                  type="datetime-local"
                  value={draft.availability.scheduledPublishAt?.slice(0, 16) ?? ""}
                  onChange={(e) =>
                    update("availability", {
                      ...draft.availability,
                      scheduledPublishAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                    })
                  }
                />
              </Field>
              <div className="sm:col-span-2">
                <p className="mb-2 text-[12.5px] font-semibold text-[var(--hm-ink-700)]">
                  Available at
                </p>
                <div className="flex flex-wrap gap-3">
                  {vendors.map((vendor) => (
                    <label key={vendor.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={draft.availability.vendorIds.includes(vendor.id)}
                        onChange={(next) =>
                          update("availability", {
                            ...draft.availability,
                            vendorIds: next
                              ? [...draft.availability.vendorIds, vendor.id]
                              : draft.availability.vendorIds.filter((v) => v !== vendor.id),
                          })
                        }
                      />
                      <span className="text-[13px] text-[var(--hm-ink-700)]">{vendor.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </CardBody>
          </Card>

          {/* SEO */}
          <Card>
            <CardHeader title="Share & SEO" subtitle="Used by the web storefront when a product is shared" />
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Share title" htmlFor="shareTitle">
                <Input
                  id="shareTitle"
                  value={draft.seo.shareTitle}
                  onChange={(e) => update("seo", { ...draft.seo, shareTitle: e.target.value })}
                />
              </Field>
              <Field label="Share description" htmlFor="shareDescription">
                <Input
                  id="shareDescription"
                  value={draft.seo.shareDescription}
                  onChange={(e) => update("seo", { ...draft.seo, shareDescription: e.target.value })}
                />
              </Field>
            </CardBody>
          </Card>
        </div>

        {/* Sticky rail */}
        <div className="flex flex-col gap-4 xl:sticky xl:top-[calc(var(--hm-topbar-h)+20px)] xl:self-start">
          <Card>
            <CardHeader title="Card preview" subtitle="Exactly as the app renders it" />
            <CardBody className="flex justify-center bg-[var(--hm-ink-50)]">
              <ProductCardPreview
                name={draft.name}
                unitLabel={draft.unit.label}
                price={draft.pricing.price}
                compareAtPrice={draft.pricing.compareAtPrice}
                imageUrl={previewImage}
                emoji={draft.emojiFallback}
                palette={draft.media?.palette}
                outOfStock={draft.inventory.track && draft.inventory.stockOnHand <= 0}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Publish checklist" subtitle="Draft save is always available" />
            <CardBody className="flex flex-col gap-2.5">
              {CHECKPOINTS.map((checkpoint) => {
                const done = checklist[checkpoint.key];
                return (
                  <div key={checkpoint.key} className="flex items-center gap-2.5">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={done ? "done" : "todo"}
                        initial={{ scale: 0.7, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.7, opacity: 0 }}
                        transition={{ duration: 0.16 }}
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full",
                          done
                            ? "bg-[var(--hm-success-500)] text-white"
                            : "border border-[var(--hm-border-strong)] bg-white",
                        )}
                      >
                        {done ? <Check className="size-3" /> : null}
                      </motion.span>
                    </AnimatePresence>
                    <span
                      className={cn(
                        "text-[13px]",
                        done ? "text-[var(--hm-ink-800)]" : "text-[var(--hm-ink-500)]",
                      )}
                    >
                      {checkpoint.label}
                    </span>
                  </div>
                );
              })}

              {checklist.issues.length > 0 ? (
                <ul className="mt-1 space-y-1 border-t border-[var(--hm-border)] pt-2.5">
                  {checklist.issues.slice(0, 5).map((issue) => (
                    <li key={issue.path} className="flex items-start gap-1.5 text-[11.5px] text-[var(--hm-warning-700)]">
                      <Info className="mt-px size-3.5 shrink-0" />
                      {issue.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex flex-col gap-2">
              <Button
                variant="outline"
                onClick={() => submit(draft.id ? "update" : "draft")}
                loading={pending}
                className="w-full"
              >
                <Save className="size-4" />
                {draft.id ? "Save changes" : "Save draft"}
              </Button>

              {canPublish ? (
                <Button
                  onClick={() => submit("publish")}
                  disabled={!checklist.publishable || pending}
                  className={cn("relative w-full overflow-hidden", justPublished && "hm-sweep")}
                  loading={pending}
                >
                  <Check className="size-4" />
                  {draft.availability.status === "active" ? "Republish" : "Publish product"}
                </Button>
              ) : null}

              {draft.id && draft.availability.status !== "archived" ? (
                <Button variant="ghost" onClick={() => setConfirm("archive")} className="w-full">
                  <Archive className="size-4" />
                  Archive
                </Button>
              ) : null}

              {draft.id && draft.availability.status === "archived" && canPublish ? (
                <Button
                  variant="ghost"
                  onClick={() => setConfirm("delete")}
                  className="w-full text-[var(--hm-danger-700)]"
                >
                  <Trash2 className="size-4" />
                  Delete permanently
                </Button>
              ) : null}

              {dirty ? (
                <p className="pt-1 text-center text-[11.5px] text-[var(--hm-warning-700)]">
                  You have unsaved changes
                </p>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>

      <MediaStudio
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        onSave={(media) => update("media", media)}
        productName={draft.name}
        unitLabel={draft.unit.label}
        price={draft.pricing.price}
        compareAtPrice={draft.pricing.compareAtPrice}
        emoji={draft.emojiFallback || null}
        existing={draft.media}
      />

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => runDestructive(confirm!)}
        title={confirm === "delete" ? "Delete this product permanently?" : "Archive this product?"}
        message={
          confirm === "delete"
            ? "This cannot be undone. Historical orders keep their own item snapshots, so past orders are unaffected."
            : "Archived products stop appearing in the app but nothing is deleted, so this can be reversed."
        }
        confirmLabel={confirm === "delete" ? "Delete permanently" : "Archive"}
        loading={pending}
      >
        <Field label="Reason" htmlFor="reason" hint="Recorded in the audit log">
          <Input
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Discontinued by supplier"
          />
        </Field>
      </ConfirmDialog>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-[130px] shrink-0 text-[var(--hm-ink-500)]">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-[var(--hm-ink-800)]">{children}</dd>
    </div>
  );
}
