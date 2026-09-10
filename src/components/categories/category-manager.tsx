"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Reorder, motion, useDragControls } from "motion/react";
import {
  Eye,
  EyeOff,
  GripVertical,
  ImageIcon,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";
import { MediaStudio } from "@/components/media-studio/media-studio";
import { cn } from "@/lib/utils/cn";
import { slugify } from "@/lib/utils/format";
import {
  deleteCategoryAction,
  reorderCategoriesAction,
  saveCategoryAction,
  toggleCategoryVisibilityAction,
} from "@/server/actions/categories";
import type { Category, ProductMedia } from "@/types";

interface Editing {
  id?: string;
  name: string;
  slug: string;
  parentId: string | null;
  description: string;
  icon: string;
  media: ProductMedia | null;
  sortOrder: number;
  status: Category["status"];
}

function blank(sortOrder: number): Editing {
  return {
    name: "",
    slug: "",
    parentId: null,
    description: "",
    icon: "",
    media: null,
    sortOrder,
    status: "active",
  };
}

export function CategoryManager({
  categories,
  canWrite,
}: {
  categories: Category[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [order, setOrder] = useState(categories);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [studioOpen, setStudioOpen] = useState(false);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const orderRef = useRef<string[]>(categories.map((c) => c.id));

  // Keep the local list in step when the server sends fresh data. Deferred so
  // the state update does not cascade a render inside the effect body.
  useEffect(() => {
    orderRef.current = categories.map((c) => c.id);
    queueMicrotask(() => setOrder(categories));
  }, [categories]);

  // The command palette and dashboard link here with ?new=1.
  useEffect(() => {
    if (params.get("new") === "1" && canWrite) {
      queueMicrotask(() => setEditing(blank(categories.length + 1)));
    }
  }, [params, canWrite, categories.length]);

  const persistOrder = useCallback(
    (next: Category[]) => {
      const ids = next.map((c) => c.id);
      if (ids.join(",") === orderRef.current.join(",")) return;
      orderRef.current = ids;
      startTransition(async () => {
        const result = await reorderCategoriesAction(ids);
        if (!result.ok) {
          toast.error(result.error);
          router.refresh();
        }
      });
    },
    [router],
  );

  const save = () => {
    if (!editing) return;
    setErrors({});
    startTransition(async () => {
      const result = await saveCategoryAction({
        ...editing,
        description: editing.description || null,
        icon: editing.icon || null,
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Saved");
      setEditing(null);
      router.refresh();
    });
  };

  const toggleVisibility = (category: Category) => {
    startTransition(async () => {
      const result = await toggleCategoryVisibilityAction(category.id);
      if (result.ok) {
        toast.success(result.message ?? "Updated");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const remove = () => {
    if (!deleting) return;
    startTransition(async () => {
      const result = await deleteCategoryAction(deleting.id);
      if (result.ok) {
        toast.success(result.message ?? "Deleted");
        setDeleting(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  if (categories.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No categories yet"
          message="Categories group the catalog and drive the app's browse screens."
          action={
            canWrite ? (
              <Button onClick={() => setEditing(blank(1))}>
                <Plus className="size-4" />
                Add category
              </Button>
            ) : null
          }
        />
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Category order"
          subtitle="Drag to reorder — the app browses categories in this order"
          action={
            canWrite ? (
              <Button size="sm" onClick={() => setEditing(blank(categories.length + 1))}>
                <Plus className="size-4" />
                Add category
              </Button>
            ) : null
          }
        />
        <Reorder.Group
          axis="y"
          values={order}
          onReorder={setOrder}
          className="divide-y divide-[var(--hm-border)]"
        >
          {order.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              canWrite={canWrite}
              pending={pending}
              onDragEnd={() => persistOrder(order)}
              onEdit={() =>
                setEditing({
                  id: category.id,
                  name: category.name,
                  slug: category.slug,
                  parentId: category.parentId,
                  description: category.description ?? "",
                  icon: category.icon ?? "",
                  media: category.media,
                  sortOrder: category.sortOrder,
                  status: category.status,
                })
              }
              onToggle={() => toggleVisibility(category)}
              onDelete={() => setDeleting(category)}
            />
          ))}
        </Reorder.Group>
      </Card>

      {/* Editor */}
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit category" : "Add category"}
        description="Category art can be searched or uploaded. Background removal is optional here."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} loading={pending}>
              {editing?.id ? "Save changes" : "Add category"}
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="cat-name" required error={errors.name} className="sm:col-span-2">
              <Input
                id="cat-name"
                value={editing.name}
                invalid={Boolean(errors.name)}
                onChange={(e) =>
                  setEditing((prev) =>
                    prev
                      ? {
                          ...prev,
                          name: e.target.value,
                          slug:
                            !prev.id && (prev.slug === "" || prev.slug === slugify(prev.name))
                              ? slugify(e.target.value)
                              : prev.slug,
                        }
                      : prev,
                  )
                }
                placeholder="Fresh Vegetables"
              />
            </Field>

            <Field label="Slug" htmlFor="cat-slug" required error={errors.slug}>
              <Input
                id="cat-slug"
                value={editing.slug}
                invalid={Boolean(errors.slug)}
                onChange={(e) => setEditing({ ...editing, slug: slugify(e.target.value) })}
                className="font-mono"
              />
            </Field>

            <Field label="Icon" htmlFor="cat-icon" hint="Emoji shown beside the name">
              <Input
                id="cat-icon"
                value={editing.icon}
                onChange={(e) => setEditing({ ...editing, icon: e.target.value })}
                placeholder="🥬"
                maxLength={8}
              />
            </Field>

            <Field label="Parent category" htmlFor="cat-parent" error={errors.parentId}>
              <Select
                id="cat-parent"
                value={editing.parentId ?? ""}
                onChange={(e) => setEditing({ ...editing, parentId: e.target.value || null })}
              >
                <option value="">None — top level</option>
                {categories
                  .filter((c) => c.id !== editing.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </Select>
            </Field>

            <Field label="Visibility" htmlFor="cat-status">
              <Select
                id="cat-status"
                value={editing.status}
                onChange={(e) =>
                  setEditing({ ...editing, status: e.target.value as Category["status"] })
                }
              >
                <option value="active">Visible</option>
                <option value="hidden">Hidden</option>
              </Select>
            </Field>

            <Field label="Description" htmlFor="cat-desc" className="sm:col-span-2">
              <Textarea
                id="cat-desc"
                rows={3}
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </Field>

            <div className="sm:col-span-2">
              <p className="mb-2 text-[12.5px] font-semibold text-[var(--hm-ink-700)]">
                Category art
              </p>
              <div className="flex items-center gap-4 rounded-[var(--hm-radius-card)] border border-[var(--hm-border)] p-4">
                <span
                  className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-[var(--hm-border)]"
                  style={{ background: editing.media?.palette.cardBg ?? "var(--hm-cyan-50)" }}
                >
                  {editing.media ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={editing.media.cutout?.url ?? editing.media.original.url}
                      alt=""
                      className="size-full object-contain p-1.5"
                    />
                  ) : (
                    <span className="text-[26px]" aria-hidden>{editing.icon || "🗂️"}</span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-[var(--hm-ink-700)]">
                    {editing.media
                      ? `${editing.media.source.provider} · card ${editing.media.palette.cardBg}`
                      : "No image set — the icon is used as the fallback."}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setStudioOpen(true)}>
                      <Sparkles className="size-3.5" />
                      {editing.media ? "Replace" : "Add image"}
                    </Button>
                    {editing.media ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing({ ...editing, media: null })}
                      >
                        <Trash2 className="size-3.5" />
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Dialog>

      {editing ? (
        <MediaStudio
          open={studioOpen}
          onClose={() => setStudioOpen(false)}
          onSave={(media) => setEditing((prev) => (prev ? { ...prev, media } : prev))}
          productName={editing.name}
          unitLabel="Category"
          price={0}
          compareAtPrice={null}
          emoji={editing.icon || null}
          existing={editing.media}
          title="Category media studio"
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title={`Delete ${deleting?.name ?? "category"}?`}
        message={
          deleting && deleting.productCount > 0
            ? `${deleting.productCount} product${deleting.productCount === 1 ? "" : "s"} still use this category. Move them first — deletion is blocked while any product references it.`
            : "This category has no products, so it can be removed safely."
        }
        confirmLabel="Delete"
        loading={pending}
      />
    </>
  );
}

function CategoryRow({
  category,
  canWrite,
  pending,
  onDragEnd,
  onEdit,
  onToggle,
  onDelete,
}: {
  category: Category;
  canWrite: boolean;
  pending: boolean;
  onDragEnd: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={category}
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
          aria-label={`Reorder ${category.name}`}
          className="cursor-grab touch-none rounded p-1 text-[var(--hm-ink-300)] transition-colors hover:text-[var(--hm-ink-600,#475569)] active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
      ) : null}

      <span
        className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-[var(--hm-border)]"
        style={{ background: category.media?.palette.cardBg ?? "var(--hm-cyan-50)" }}
      >
        {category.media ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={category.media.cutout?.url ?? category.media.original.url}
            alt=""
            className="size-full object-contain p-1"
          />
        ) : category.icon ? (
          <span className="text-[20px]" aria-hidden>{category.icon}</span>
        ) : (
          <ImageIcon className="size-4 text-[var(--hm-cyan-600)]" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-[13.5px] font-semibold text-[var(--hm-ink-900)]">
          {category.name}
          {category.status === "hidden" ? <Chip tone="neutral">Hidden</Chip> : null}
        </p>
        <p className="truncate text-[11.5px] text-[var(--hm-ink-500)]">
          <code className="font-mono">{category.slug}</code>
          {" · "}
          {category.productCount} product{category.productCount === 1 ? "" : "s"}
          {" · "}
          {category.activeProductCount} active
          {category.hiddenProductCount > 0 ? ` · ${category.hiddenProductCount} hidden` : ""}
        </p>
      </div>

      {category.lowStockCount > 0 ? (
        <Link href={`/inventory?category=${category.id}`}>
          <Chip tone="warning">{category.lowStockCount} low</Chip>
        </Link>
      ) : null}

      <Link
        href={`/products?category=${category.id}`}
        className="hidden shrink-0 rounded-[9px] border border-[var(--hm-border)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--hm-ink-700)] transition-colors hover:border-[var(--hm-cyan-300)] hover:text-[var(--hm-cyan-700)] sm:block"
      >
        View products
      </Link>

      {canWrite ? (
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onToggle}
            disabled={pending}
            aria-label={category.status === "active" ? `Hide ${category.name}` : `Show ${category.name}`}
            className="rounded-[8px] p-1.5 text-[var(--hm-ink-400)] transition-colors hover:bg-[var(--hm-ink-100)] hover:text-[var(--hm-ink-800)] disabled:opacity-50"
          >
            {category.status === "active" ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </button>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${category.name}`}
            className="rounded-[8px] p-1.5 text-[var(--hm-ink-400)] transition-colors hover:bg-[var(--hm-cyan-50)] hover:text-[var(--hm-cyan-700)]"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${category.name}`}
            className={cn(
              "rounded-[8px] p-1.5 transition-colors",
              category.productCount > 0
                ? "cursor-not-allowed text-[var(--hm-ink-300)]"
                : "text-[var(--hm-ink-400)] hover:bg-[var(--hm-danger-50)] hover:text-[var(--hm-danger-700)]",
            )}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ) : null}
    </Reorder.Item>
  );
}

/** Category card preview matching the mobile app, shown beside the editor. */
export function CategoryPreview({ category }: { category: Category }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="w-[150px] overflow-hidden rounded-[16px] border border-[var(--hm-border)]"
      style={{ background: category.media?.palette.cardBg ?? "var(--hm-cyan-50)" }}
    >
      <div className="flex h-[92px] items-center justify-center">
        {category.media ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={category.media.cutout?.url ?? category.media.original.url}
            alt=""
            className="max-h-[78%] max-w-[78%] object-contain"
          />
        ) : (
          <span className="text-[38px]" aria-hidden>{category.icon ?? "🗂️"}</span>
        )}
      </div>
      <p
        className="px-3 py-2 text-center text-[12.5px] font-semibold"
        style={{ color: category.media?.palette.textColor ?? "var(--hm-ink-900)" }}
      >
        {category.name}
      </p>
    </motion.div>
  );
}
