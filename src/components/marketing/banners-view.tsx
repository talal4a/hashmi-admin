"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Reorder, useDragControls } from "motion/react";
import { GripVertical, ImageIcon, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";
import { MediaStudio } from "@/components/media-studio/media-studio";
import { formatDate } from "@/lib/utils/format";
import {
  deleteBannerAction,
  reorderBannersAction,
  saveBannerAction,
} from "@/server/actions/marketing";
import type { Banner, MediaPalette } from "@/types";

const STATUS_TONE: Record<Banner["status"], ChipTone> = {
  live: "success",
  scheduled: "info",
  draft: "neutral",
  expired: "neutral",
};

const PLACEMENT_LABEL: Record<Banner["placement"], string> = {
  home_hero: "Home hero",
  home_strip: "Home strip",
  category_top: "Category top",
};

const AUDIENCE_LABEL: Record<Banner["audience"], string> = {
  all: "Everyone",
  new_customers: "New customers",
  returning_customers: "Returning customers",
};

export function BannersView({ banners, canWrite }: { banners: Banner[]; canWrite: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [order, setOrder] = useState(banners);
  const [draft, setDraft] = useState<Partial<Banner> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [studioOpen, setStudioOpen] = useState(false);
  const [removing, setRemoving] = useState<Banner | null>(null);
  const orderRef = useRef(banners.map((b) => b.id));

  useEffect(() => {
    orderRef.current = banners.map((b) => b.id);
    queueMicrotask(() => setOrder(banners));
  }, [banners]);

  useEffect(() => {
    if (params.get("new") === "1" && canWrite) {
      queueMicrotask(() => setDraft(blankBanner(banners.length + 1)));
    }
  }, [params, canWrite, banners.length]);

  const persistOrder = useCallback(
    (next: Banner[]) => {
      const ids = next.map((b) => b.id);
      if (ids.join(",") === orderRef.current.join(",")) return;
      orderRef.current = ids;
      startTransition(async () => {
        const result = await reorderBannersAction(ids);
        if (!result.ok) {
          toast.error(result.error);
          router.refresh();
        }
      });
    },
    [router],
  );

  const save = () => {
    if (!draft) return;
    setErrors({});
    startTransition(async () => {
      const result = await saveBannerAction({
        ...draft,
        subtitle: draft.subtitle || null,
        imageUrl: draft.imageUrl || null,
        ctaLabel: draft.ctaLabel || null,
        ctaLink: draft.ctaLink || null,
        endsAt: draft.endsAt ?? null,
        sortOrder: draft.sortOrder ?? banners.length + 1,
      });
      if (result.ok) {
        toast.success(result.message ?? "Saved");
        setDraft(null);
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
      const result = await deleteBannerAction(removing.id);
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
      <Card>
        <CardHeader
          title="Home content"
          subtitle="Drag to set the order the app shows them in"
          action={
            canWrite ? (
              <Button size="sm" onClick={() => setDraft(blankBanner(banners.length + 1))}>
                <Plus className="size-4" />
                New banner
              </Button>
            ) : null
          }
        />
        {banners.length === 0 ? (
          <EmptyState
            title="No banners yet"
            message="Banners drive the app's hero slider and home strips."
            icon={<ImageIcon className="size-5" />}
          />
        ) : (
          <Reorder.Group axis="y" values={order} onReorder={setOrder} className="divide-y divide-[var(--hm-border)]">
            {order.map((banner) => (
              <BannerRow
                key={banner.id}
                banner={banner}
                canWrite={canWrite}
                onDragEnd={() => persistOrder(order)}
                onEdit={() => setDraft(banner)}
                onDelete={() => setRemoving(banner)}
              />
            ))}
          </Reorder.Group>
        )}
      </Card>

      <Dialog
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? `Edit ${draft.title}` : "New banner"}
        description="Preview shows the card as the app renders it."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={pending}>Cancel</Button>
            <Button onClick={save} loading={pending}>Save banner</Button>
          </>
        }
      >
        {draft ? (
          <div className="flex flex-col gap-5 lg:flex-row">
            <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Title" htmlFor="b-title" required error={errors.title} className="sm:col-span-2">
                <Input
                  id="b-title"
                  value={draft.title ?? ""}
                  invalid={Boolean(errors.title)}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Fresh & Fast Delivery"
                />
              </Field>
              <Field label="Subtitle" htmlFor="b-sub" className="sm:col-span-2">
                <Input
                  id="b-sub"
                  value={draft.subtitle ?? ""}
                  onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
                  placeholder="Groceries at your door in under 45 minutes"
                />
              </Field>
              <Field label="CTA label" htmlFor="b-cta">
                <Input
                  id="b-cta"
                  value={draft.ctaLabel ?? ""}
                  onChange={(e) => setDraft({ ...draft, ctaLabel: e.target.value })}
                  placeholder="Shop now"
                />
              </Field>
              <Field label="CTA link" htmlFor="b-link" hint="Deep link or path in the app">
                <Input
                  id="b-link"
                  value={draft.ctaLink ?? ""}
                  onChange={(e) => setDraft({ ...draft, ctaLink: e.target.value })}
                  placeholder="/products/retail"
                />
              </Field>
              <Field label="Placement" htmlFor="b-placement">
                <Select
                  id="b-placement"
                  value={draft.placement ?? "home_hero"}
                  onChange={(e) => setDraft({ ...draft, placement: e.target.value as Banner["placement"] })}
                >
                  {Object.entries(PLACEMENT_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Audience" htmlFor="b-audience">
                <Select
                  id="b-audience"
                  value={draft.audience ?? "all"}
                  onChange={(e) => setDraft({ ...draft, audience: e.target.value as Banner["audience"] })}
                >
                  {Object.entries(AUDIENCE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Starts" htmlFor="b-start" required>
                <Input
                  id="b-start"
                  type="date"
                  value={(draft.startsAt ?? "").slice(0, 10)}
                  onChange={(e) => setDraft({ ...draft, startsAt: new Date(e.target.value).toISOString() })}
                />
              </Field>
              <Field label="Ends" htmlFor="b-end">
                <Input
                  id="b-end"
                  type="date"
                  value={(draft.endsAt ?? "").slice(0, 10)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      endsAt: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : null,
                    })
                  }
                />
              </Field>
              <Field label="Status" htmlFor="b-status" className="sm:col-span-2">
                <Select
                  id="b-status"
                  value={draft.status ?? "draft"}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value as Banner["status"] })}
                >
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="live">Live</option>
                  <option value="expired">Expired</option>
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Button variant="outline" size="sm" onClick={() => setStudioOpen(true)}>
                  <Sparkles className="size-4" />
                  {draft.imageUrl ? "Replace image" : "Add image"}
                </Button>
              </div>
            </div>

            <div className="lg:w-[240px]">
              <p className="mb-2 text-[12.5px] font-semibold text-[var(--hm-ink-700)]">Preview</p>
              <BannerPreview banner={draft} />
            </div>
          </div>
        ) : null}
      </Dialog>

      {draft ? (
        <MediaStudio
          open={studioOpen}
          onClose={() => setStudioOpen(false)}
          onSave={(media) =>
            setDraft((prev) =>
              prev
                ? {
                    ...prev,
                    imageUrl: media.cutout?.url ?? media.original.url,
                    palette: media.palette,
                  }
                : prev,
            )
          }
          productName={draft.title ?? ""}
          unitLabel="Banner"
          price={0}
          compareAtPrice={null}
          emoji={null}
          title="Banner media studio"
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        title={`Delete ${removing?.title ?? "banner"}?`}
        message="It disappears from the app immediately. This cannot be undone."
        confirmLabel="Delete"
        loading={pending}
      />
    </>
  );
}

function BannerRow({
  banner,
  canWrite,
  onDragEnd,
  onEdit,
  onDelete,
}: {
  banner: Banner;
  canWrite: boolean;
  onDragEnd: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={banner}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      whileDrag={{ scale: 1.01, boxShadow: "var(--hm-shadow-lg)", zIndex: 5 }}
      className="flex items-center gap-3 bg-white px-4 py-3"
    >
      {canWrite ? (
        <button
          type="button"
          onPointerDown={(event) => controls.start(event)}
          aria-label={`Reorder ${banner.title}`}
          className="cursor-grab touch-none rounded p-1 text-[var(--hm-ink-300)] hover:text-[var(--hm-ink-600,#475569)] active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
      ) : null}

      <span
        className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-[var(--hm-border)]"
        style={{ background: banner.palette?.cardBg ?? "var(--hm-cyan-50)" }}
      >
        {banner.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner.imageUrl} alt="" className="size-full object-cover" />
        ) : (
          <ImageIcon className="size-4 text-[var(--hm-cyan-600)]" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold text-[var(--hm-ink-900)]">{banner.title}</p>
        <p className="truncate text-[11.5px] text-[var(--hm-ink-500)]">
          {PLACEMENT_LABEL[banner.placement]} · {AUDIENCE_LABEL[banner.audience]} ·{" "}
          {formatDate(banner.startsAt)} → {banner.endsAt ? formatDate(banner.endsAt) : "open"}
        </p>
      </div>

      <Chip tone={STATUS_TONE[banner.status]}>{banner.status}</Chip>

      {canWrite ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" onClick={onEdit}>Edit</Button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${banner.title}`}
            className="rounded-[8px] p-1.5 text-[var(--hm-ink-400)] transition-colors hover:bg-[var(--hm-danger-50)] hover:text-[var(--hm-danger-700)]"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ) : null}
    </Reorder.Item>
  );
}

function BannerPreview({ banner }: { banner: Partial<Banner> }) {
  const palette = banner.palette as MediaPalette | null | undefined;
  return (
    <div
      className="overflow-hidden rounded-[16px] border border-[var(--hm-border)]"
      style={{ background: palette?.cardBg ?? "var(--hm-cyan-50)" }}
    >
      {banner.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={banner.imageUrl} alt="" className="h-24 w-full object-cover" />
      ) : (
        <div className="flex h-24 items-center justify-center">
          <ImageIcon className="size-6 text-[var(--hm-cyan-600)]" />
        </div>
      )}
      <div className="px-3.5 py-3" style={{ color: palette?.textColor ?? "#0F172A" }}>
        <p className="text-[14px] font-bold">{banner.title || "Banner title"}</p>
        {banner.subtitle ? <p className="mt-0.5 text-[12px] opacity-80">{banner.subtitle}</p> : null}
        {banner.ctaLabel ? (
          <span className="mt-2 inline-block rounded-full bg-[var(--hm-cyan-500)] px-3 py-1 text-[11.5px] font-bold text-white">
            {banner.ctaLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function blankBanner(sortOrder: number): Partial<Banner> {
  return {
    title: "",
    subtitle: null,
    imageUrl: null,
    palette: null,
    ctaLabel: null,
    ctaLink: null,
    audience: "all",
    placement: "home_hero",
    startsAt: new Date().toISOString(),
    endsAt: null,
    sortOrder,
    status: "draft",
  };
}
