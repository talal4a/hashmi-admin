"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Percent, Plus, Tag, Ticket, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";
import { Table, TableScroll, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatPKR } from "@/lib/utils/format";
import { evaluateCoupon } from "@/lib/utils/pricing";
import {
  deleteCouponAction,
  deleteOfferAction,
  saveCouponAction,
  saveOfferAction,
} from "@/server/actions/marketing";
import type { Category, Coupon, Offer, Product } from "@/types";

const STATUS_TONE: Record<Coupon["status"], ChipTone> = {
  active: "success",
  scheduled: "info",
  expired: "neutral",
  disabled: "danger",
};

const TYPE_ICON = {
  fixed: Tag,
  percentage: Percent,
  free_delivery: Truck,
} as const;

function isoDate(value: string) {
  return value ? value.slice(0, 10) : "";
}

export function OffersView({
  coupons,
  offers,
  categories,
  products,
  canWrite,
}: {
  coupons: Coupon[];
  offers: Offer[];
  categories: Category[];
  products: Product[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"coupons" | "offers">("coupons");
  const [couponDraft, setCouponDraft] = useState<Partial<Coupon> | null>(null);
  const [offerDraft, setOfferDraft] = useState<Partial<Offer> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<{ kind: "coupon" | "offer"; id: string; label: string } | null>(null);

  useEffect(() => {
    if (params.get("new") === "coupon" && canWrite) {
      queueMicrotask(() => setCouponDraft(blankCoupon()));
    }
  }, [params, canWrite]);

  const saveCoupon = () => {
    if (!couponDraft) return;
    setErrors({});
    startTransition(async () => {
      const result = await saveCouponAction({
        ...couponDraft,
        value: Number(couponDraft.value ?? 0),
        minOrderValue: couponDraft.minOrderValue ?? null,
        maxDiscount: couponDraft.maxDiscount ?? null,
        usageLimitTotal: couponDraft.usageLimitTotal ?? null,
        usageLimitPerCustomer: couponDraft.usageLimitPerCustomer ?? null,
        scopeCategoryIds: couponDraft.scopeCategoryIds ?? [],
        scopeProductIds: couponDraft.scopeProductIds ?? [],
        endsAt: couponDraft.endsAt ?? null,
      });
      if (result.ok) {
        toast.success(result.message ?? "Saved");
        setCouponDraft(null);
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    });
  };

  const saveOffer = () => {
    if (!offerDraft) return;
    setErrors({});
    startTransition(async () => {
      const result = await saveOfferAction({
        ...offerDraft,
        value: Number(offerDraft.value ?? 0),
        productIds: offerDraft.productIds ?? [],
        categoryIds: offerDraft.categoryIds ?? [],
        endsAt: offerDraft.endsAt ?? null,
      });
      if (result.ok) {
        toast.success(result.message ?? "Saved");
        setOfferDraft(null);
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    });
  };

  const remove = () => {
    if (!removing) return;
    startTransition(async () => {
      const result =
        removing.kind === "coupon"
          ? await deleteCouponAction(removing.id)
          : await deleteOfferAction(removing.id);
      if (result.ok) {
        toast.success(result.message ?? "Deleted");
        setRemoving(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {(["coupons", "offers"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold capitalize transition-colors",
              tab === key
                ? "border-[var(--hm-cyan-300)] bg-[var(--hm-cyan-50)] text-[var(--hm-cyan-800)]"
                : "border-[var(--hm-border)] bg-white text-[var(--hm-ink-600,#475569)] hover:border-[var(--hm-cyan-200)]",
            )}
          >
            {key === "coupons" ? "Coupons" : "Product offers"}
            <span className="ml-1.5 text-[11px] opacity-70 tabular-nums">
              {key === "coupons" ? coupons.length : offers.length}
            </span>
          </button>
        ))}
      </div>

      {tab === "coupons" ? (
        <Card>
          <CardHeader
            title="Coupons"
            subtitle="Fixed, percentage or free delivery, with scope, limits and scheduling"
            action={
              canWrite ? (
                <Button size="sm" onClick={() => setCouponDraft(blankCoupon())}>
                  <Plus className="size-4" />
                  New coupon
                </Button>
              ) : null
            }
          />
          {coupons.length === 0 ? (
            <EmptyState title="No coupons yet" icon={<Ticket className="size-5" />} />
          ) : (
            <TableScroll>
              <Table className="min-w-[860px]">
                <thead>
                  <tr>
                    <Th>Code</Th>
                    <Th>Type</Th>
                    <Th align="right">Value</Th>
                    <Th>Conditions</Th>
                    <Th align="right">Used</Th>
                    <Th>Window</Th>
                    <Th>Status</Th>
                    {canWrite ? <Th align="right">Actions</Th> : null}
                  </tr>
                </thead>
                <tbody>
                  {coupons.map((coupon) => {
                    const Icon = TYPE_ICON[coupon.type];
                    const sample = evaluateCoupon(coupon, 2000);
                    return (
                      <Tr key={coupon.id}>
                        <Td>
                          <code className="font-mono text-[13px] font-bold text-[var(--hm-ink-900)]">
                            {coupon.code}
                          </code>
                        </Td>
                        <Td>
                          <span className="flex items-center gap-1.5 whitespace-nowrap">
                            <Icon className="size-3.5 text-[var(--hm-ink-400)]" />
                            {coupon.type.replace(/_/g, " ")}
                          </span>
                        </Td>
                        <Td align="right" className="whitespace-nowrap">
                          {coupon.type === "percentage"
                            ? `${coupon.value}%`
                            : coupon.type === "free_delivery"
                              ? "—"
                              : formatPKR(coupon.value)}
                        </Td>
                        <Td className="text-[12px] text-[var(--hm-ink-500)]">
                          {coupon.minOrderValue ? `Min ${formatPKR(coupon.minOrderValue)}` : "No minimum"}
                          {coupon.maxDiscount ? ` · cap ${formatPKR(coupon.maxDiscount)}` : ""}
                          {coupon.scopeCategoryIds.length > 0
                            ? ` · ${coupon.scopeCategoryIds.length} categor${coupon.scopeCategoryIds.length === 1 ? "y" : "ies"}`
                            : ""}
                        </Td>
                        <Td align="right" className="tabular-nums">
                          {coupon.usedCount}
                          {coupon.usageLimitTotal ? (
                            <span className="text-[var(--hm-ink-400)]"> / {coupon.usageLimitTotal}</span>
                          ) : null}
                        </Td>
                        <Td className="text-[12px] whitespace-nowrap text-[var(--hm-ink-500)]">
                          {formatDate(coupon.startsAt)} → {coupon.endsAt ? formatDate(coupon.endsAt) : "open"}
                        </Td>
                        <Td>
                          <span title={sample.valid ? "Would apply to a Rs 2,000 order" : (sample.reason ?? "")}>
                            <Chip tone={STATUS_TONE[coupon.status]}>{coupon.status}</Chip>
                          </span>
                        </Td>
                        {canWrite ? (
                          <Td align="right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="outline" size="sm" onClick={() => setCouponDraft(coupon)}>
                                Edit
                              </Button>
                              <button
                                type="button"
                                onClick={() =>
                                  setRemoving({ kind: "coupon", id: coupon.id, label: coupon.code })
                                }
                                aria-label={`Delete ${coupon.code}`}
                                className="rounded-[8px] p-1.5 text-[var(--hm-ink-400)] transition-colors hover:bg-[var(--hm-danger-50)] hover:text-[var(--hm-danger-700)]"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          </Td>
                        ) : null}
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableScroll>
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Product offers"
            subtitle="Scheduled discounts scoped to products or categories"
            action={
              canWrite ? (
                <Button size="sm" onClick={() => setOfferDraft(blankOffer())}>
                  <Plus className="size-4" />
                  New offer
                </Button>
              ) : null
            }
          />
          {offers.length === 0 ? (
            <EmptyState title="No product offers yet" icon={<Percent className="size-5" />} />
          ) : (
            <TableScroll>
              <Table className="min-w-[720px]">
                <thead>
                  <tr>
                    <Th>Offer</Th>
                    <Th align="right">Discount</Th>
                    <Th>Scope</Th>
                    <Th>Window</Th>
                    <Th>Status</Th>
                    {canWrite ? <Th align="right">Actions</Th> : null}
                  </tr>
                </thead>
                <tbody>
                  {offers.map((offer) => (
                    <Tr key={offer.id}>
                      <Td className="font-semibold text-[var(--hm-ink-900)]">{offer.name}</Td>
                      <Td align="right" className="whitespace-nowrap">
                        {offer.discountType === "percentage" ? `${offer.value}%` : formatPKR(offer.value)}
                      </Td>
                      <Td className="text-[12px] text-[var(--hm-ink-500)]">
                        {offer.categoryIds.length > 0
                          ? offer.categoryIds
                              .map((id) => categories.find((c) => c.id === id)?.name ?? id)
                              .join(", ")
                          : `${offer.productIds.length} product${offer.productIds.length === 1 ? "" : "s"}`}
                      </Td>
                      <Td className="text-[12px] whitespace-nowrap text-[var(--hm-ink-500)]">
                        {formatDate(offer.startsAt)} → {offer.endsAt ? formatDate(offer.endsAt) : "open"}
                      </Td>
                      <Td>
                        <Chip tone={STATUS_TONE[offer.status]}>{offer.status}</Chip>
                      </Td>
                      {canWrite ? (
                        <Td align="right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="outline" size="sm" onClick={() => setOfferDraft(offer)}>
                              Edit
                            </Button>
                            <button
                              type="button"
                              onClick={() => setRemoving({ kind: "offer", id: offer.id, label: offer.name })}
                              aria-label={`Delete ${offer.name}`}
                              className="rounded-[8px] p-1.5 text-[var(--hm-ink-400)] transition-colors hover:bg-[var(--hm-danger-50)] hover:text-[var(--hm-danger-700)]"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </Td>
                      ) : null}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableScroll>
          )}
        </Card>
      )}

      {/* Coupon editor */}
      <Dialog
        open={couponDraft !== null}
        onClose={() => setCouponDraft(null)}
        title={couponDraft?.id ? `Edit ${couponDraft.code}` : "New coupon"}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setCouponDraft(null)} disabled={pending}>Cancel</Button>
            <Button onClick={saveCoupon} loading={pending}>Save coupon</Button>
          </>
        }
      >
        {couponDraft ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Code" htmlFor="code" required error={errors.code}>
              <Input
                id="code"
                value={couponDraft.code ?? ""}
                invalid={Boolean(errors.code)}
                onChange={(e) => setCouponDraft({ ...couponDraft, code: e.target.value.toUpperCase() })}
                placeholder="WELCOME150"
                className="font-mono"
              />
            </Field>
            <Field label="Type" htmlFor="type">
              <Select
                id="type"
                value={couponDraft.type ?? "fixed"}
                onChange={(e) => setCouponDraft({ ...couponDraft, type: e.target.value as Coupon["type"] })}
              >
                <option value="fixed">Fixed amount off</option>
                <option value="percentage">Percentage off</option>
                <option value="free_delivery">Free delivery</option>
              </Select>
            </Field>
            {couponDraft.type !== "free_delivery" ? (
              <Field
                label={couponDraft.type === "percentage" ? "Percentage" : "Amount (PKR)"}
                htmlFor="value"
                required
                error={errors.value}
              >
                <Input
                  id="value"
                  type="number"
                  min={0}
                  value={couponDraft.value ?? 0}
                  invalid={Boolean(errors.value)}
                  onChange={(e) => setCouponDraft({ ...couponDraft, value: Number(e.target.value) })}
                />
              </Field>
            ) : null}
            <Field label="Minimum order (PKR)" htmlFor="minOrder">
              <Input
                id="minOrder"
                type="number"
                min={0}
                value={couponDraft.minOrderValue ?? ""}
                onChange={(e) =>
                  setCouponDraft({
                    ...couponDraft,
                    minOrderValue: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
            {couponDraft.type === "percentage" ? (
              <Field label="Maximum discount (PKR)" htmlFor="maxDiscount" hint="Caps a percentage discount">
                <Input
                  id="maxDiscount"
                  type="number"
                  min={0}
                  value={couponDraft.maxDiscount ?? ""}
                  onChange={(e) =>
                    setCouponDraft({
                      ...couponDraft,
                      maxDiscount: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </Field>
            ) : null}
            <Field label="Total usage limit" htmlFor="limitTotal" hint="Leave blank for unlimited">
              <Input
                id="limitTotal"
                type="number"
                min={1}
                value={couponDraft.usageLimitTotal ?? ""}
                onChange={(e) =>
                  setCouponDraft({
                    ...couponDraft,
                    usageLimitTotal: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Per customer limit" htmlFor="limitCustomer">
              <Input
                id="limitCustomer"
                type="number"
                min={1}
                value={couponDraft.usageLimitPerCustomer ?? ""}
                onChange={(e) =>
                  setCouponDraft({
                    ...couponDraft,
                    usageLimitPerCustomer: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Starts" htmlFor="startsAt" required error={errors.startsAt}>
              <Input
                id="startsAt"
                type="date"
                value={isoDate(couponDraft.startsAt ?? "")}
                onChange={(e) =>
                  setCouponDraft({ ...couponDraft, startsAt: new Date(e.target.value).toISOString() })
                }
              />
            </Field>
            <Field label="Ends" htmlFor="endsAt" error={errors.endsAt} hint="Blank means open-ended">
              <Input
                id="endsAt"
                type="date"
                value={isoDate(couponDraft.endsAt ?? "")}
                onChange={(e) =>
                  setCouponDraft({
                    ...couponDraft,
                    endsAt: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : null,
                  })
                }
              />
            </Field>
            <Field label="Status" htmlFor="status">
              <Select
                id="status"
                value={couponDraft.status ?? "scheduled"}
                onChange={(e) =>
                  setCouponDraft({ ...couponDraft, status: e.target.value as Coupon["status"] })
                }
              >
                <option value="active">Active</option>
                <option value="scheduled">Scheduled</option>
                <option value="disabled">Disabled</option>
                <option value="expired">Expired</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <p className="mb-2 text-[12.5px] font-semibold text-[var(--hm-ink-700)]">
                Limit to categories
              </p>
              <div className="flex flex-wrap gap-2.5">
                {categories.map((category) => (
                  <label key={category.id} className="flex items-center gap-1.5">
                    <Checkbox
                      checked={(couponDraft.scopeCategoryIds ?? []).includes(category.id)}
                      onChange={(next) =>
                        setCouponDraft({
                          ...couponDraft,
                          scopeCategoryIds: next
                            ? [...(couponDraft.scopeCategoryIds ?? []), category.id]
                            : (couponDraft.scopeCategoryIds ?? []).filter((id) => id !== category.id),
                        })
                      }
                    />
                    <span className="text-[12.5px] text-[var(--hm-ink-700)]">{category.name}</span>
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-[11.5px] text-[var(--hm-ink-400)]">
                Leave all unchecked to apply the coupon across the whole catalog.
              </p>
            </div>
          </div>
        ) : null}
      </Dialog>

      {/* Offer editor */}
      <Dialog
        open={offerDraft !== null}
        onClose={() => setOfferDraft(null)}
        title={offerDraft?.id ? `Edit ${offerDraft.name}` : "New product offer"}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setOfferDraft(null)} disabled={pending}>Cancel</Button>
            <Button onClick={saveOffer} loading={pending}>Save offer</Button>
          </>
        }
      >
        {offerDraft ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="offer-name" required error={errors.name} className="sm:col-span-2">
              <Input
                id="offer-name"
                value={offerDraft.name ?? ""}
                invalid={Boolean(errors.name)}
                onChange={(e) => setOfferDraft({ ...offerDraft, name: e.target.value })}
                placeholder="Fruit Friday"
              />
            </Field>
            <Field label="Discount type" htmlFor="offer-type">
              <Select
                id="offer-type"
                value={offerDraft.discountType ?? "percentage"}
                onChange={(e) =>
                  setOfferDraft({ ...offerDraft, discountType: e.target.value as Offer["discountType"] })
                }
              >
                <option value="percentage">Percentage off</option>
                <option value="fixed">Fixed amount off</option>
              </Select>
            </Field>
            <Field label="Value" htmlFor="offer-value" required error={errors.value}>
              <Input
                id="offer-value"
                type="number"
                min={0}
                value={offerDraft.value ?? 0}
                invalid={Boolean(errors.value)}
                onChange={(e) => setOfferDraft({ ...offerDraft, value: Number(e.target.value) })}
              />
            </Field>
            <Field label="Starts" htmlFor="offer-start" required>
              <Input
                id="offer-start"
                type="date"
                value={isoDate(offerDraft.startsAt ?? "")}
                onChange={(e) =>
                  setOfferDraft({ ...offerDraft, startsAt: new Date(e.target.value).toISOString() })
                }
              />
            </Field>
            <Field label="Ends" htmlFor="offer-end">
              <Input
                id="offer-end"
                type="date"
                value={isoDate(offerDraft.endsAt ?? "")}
                onChange={(e) =>
                  setOfferDraft({
                    ...offerDraft,
                    endsAt: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : null,
                  })
                }
              />
            </Field>
            <Field label="Status" htmlFor="offer-status" className="sm:col-span-2">
              <Select
                id="offer-status"
                value={offerDraft.status ?? "scheduled"}
                onChange={(e) => setOfferDraft({ ...offerDraft, status: e.target.value as Offer["status"] })}
              >
                <option value="active">Active</option>
                <option value="scheduled">Scheduled</option>
                <option value="disabled">Disabled</option>
                <option value="expired">Expired</option>
              </Select>
            </Field>

            <div className="sm:col-span-2">
              <p className="mb-2 text-[12.5px] font-semibold text-[var(--hm-ink-700)]">
                Categories in scope
              </p>
              <div className="flex flex-wrap gap-2.5">
                {categories.map((category) => (
                  <label key={category.id} className="flex items-center gap-1.5">
                    <Checkbox
                      checked={(offerDraft.categoryIds ?? []).includes(category.id)}
                      onChange={(next) =>
                        setOfferDraft({
                          ...offerDraft,
                          categoryIds: next
                            ? [...(offerDraft.categoryIds ?? []), category.id]
                            : (offerDraft.categoryIds ?? []).filter((id) => id !== category.id),
                        })
                      }
                    />
                    <span className="text-[12.5px] text-[var(--hm-ink-700)]">{category.name}</span>
                  </label>
                ))}
              </div>
              {errors.productIds ? (
                <p role="alert" className="mt-1.5 text-[12px] font-medium text-[var(--hm-danger-700)]">
                  {errors.productIds}
                </p>
              ) : null}
            </div>

            <Field
              label="Individual products"
              htmlFor="offer-products"
              hint="Hold Ctrl/Cmd to select several"
              className="sm:col-span-2"
            >
              <select
                id="offer-products"
                multiple
                size={6}
                value={offerDraft.productIds ?? []}
                onChange={(e) =>
                  setOfferDraft({
                    ...offerDraft,
                    productIds: Array.from(e.target.selectedOptions).map((o) => o.value),
                  })
                }
                className="w-full rounded-[var(--hm-radius-control)] border border-[var(--hm-border)] bg-white px-2 py-1.5 text-[13px]"
              >
                {products
                  .filter((p) => p.availability.status === "active")
                  .map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} — {formatPKR(product.pricing.price)}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        title={`Delete ${removing?.label ?? ""}?`}
        message="This cannot be undone. Orders that already used it keep their own record."
        confirmLabel="Delete"
        loading={pending}
      />
    </>
  );
}

function blankCoupon(): Partial<Coupon> {
  return {
    code: "",
    type: "fixed",
    value: 100,
    minOrderValue: null,
    maxDiscount: null,
    usageLimitTotal: null,
    usageLimitPerCustomer: 1,
    scopeCategoryIds: [],
    scopeProductIds: [],
    startsAt: new Date().toISOString(),
    endsAt: null,
    status: "scheduled",
  };
}

function blankOffer(): Partial<Offer> {
  return {
    name: "",
    discountType: "percentage",
    value: 10,
    productIds: [],
    categoryIds: [],
    startsAt: new Date().toISOString(),
    endsAt: null,
    status: "scheduled",
  };
}
