"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
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

/** The order currently on the server, one signature per level. */
function signatures(categories: Category[]): Map<string, string> {
  const levels = new Map<string, string[]>();
  for (const category of categories) {
    const key = category.parentId ?? "";
    levels.set(key, [...(levels.get(key) ?? []), category.id]);
  }
  return new Map([...levels].map(([key, ids]) => [key, ids.join(",")]));
}

function toEditing(category: Category): Editing {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    parentId: category.parentId,
    description: category.description ?? "",
    icon: category.icon ?? "",
    media: category.media,
    sortOrder: category.sortOrder,
    status: category.status,
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
  const [query, setQuery] = useState("");
  /** Last order actually written, per level, so a drag that changes nothing is not saved. */
  const persistedRef = useRef<Map<string, string>>(new Map());

  // Keep the local list in step when the server sends fresh data. Deferred so
  // the state update does not cascade a render inside the effect body.
  useEffect(() => {
    persistedRef.current = signatures(categories);
    queueMicrotask(() => setOrder(categories));
  }, [categories]);

  // The command palette and dashboard link here with ?new=1; a category's own
  // page links back with ?edit=<id> rather than carrying a second copy of this
  // form, so there is only ever one editor to keep correct.
  useEffect(() => {
    if (!canWrite) return;
    if (params.get("new") === "1") {
      queueMicrotask(() => setEditing(blank(categories.length + 1)));
      return;
    }
    const editId = params.get("edit");
    if (!editId) return;
    const target = categories.find((c) => c.id === editId);
    if (target) queueMicrotask(() => setEditing(toEditing(target)));
  }, [params, canWrite, categories]);

  /* The tree, derived from the single ordered list the drag handlers mutate. */
  const byId = useMemo(() => new Map(order.map((c) => [c.id, c])), [order]);
  const roots = useMemo(
    () => order.filter((c) => !c.parentId || !byId.has(c.parentId)),
    [order, byId],
  );
  const childrenOf = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const category of order) {
      if (!category.parentId || !byId.has(category.parentId)) continue;
      const siblings = map.get(category.parentId) ?? [];
      siblings.push(category);
      map.set(category.parentId, siblings);
    }
    return map;
  }, [order, byId]);

  const trimmed = query.trim().toLowerCase();
  const filtering = trimmed.length > 0;
  const matches = useMemo(
    () =>
      filtering
        ? order.filter(
            (c) =>
              c.name.toLowerCase().includes(trimmed) || c.slug.toLowerCase().includes(trimmed),
          )
        : [],
    [order, filtering, trimmed],
  );

  /** Rebuilds the flat list so each parent is immediately followed by its own. */
  const flatten = useCallback(
    (nextRoots: Category[], overrides?: { parentId: string; children: Category[] }) => {
      const out: Category[] = [];
      for (const root of nextRoots) {
        out.push(root);
        const children =
          overrides && overrides.parentId === root.id
            ? overrides.children
            : (childrenOf.get(root.id) ?? []);
        out.push(...children);
      }
      return out;
    },
    [childrenOf],
  );

  const reorderRoots = useCallback(
    (next: Category[]) => setOrder(flatten(next)),
    [flatten],
  );

  const reorderChildren = useCallback(
    (parentId: string, next: Category[]) =>
      setOrder(flatten(roots, { parentId, children: next })),
    [flatten, roots],
  );

  /**
   * Each level is numbered independently — a subcategory's position only ever
   * matters against its siblings — so positions repeat across parents by
   * design rather than by accident.
   */
  const persistOrder = useCallback(
    (slice: Category[]) => {
      if (slice.length === 0) return;
      const key = slice[0].parentId ?? "";
      const ids = slice.map((c) => c.id);
      const signature = ids.join(",");
      if (persistedRef.current.get(key) === signature) return;
      persistedRef.current.set(key, signature);
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
        {/* Searching flattens the tree: hunting for one category should not
            require knowing which parent it lives under. Dragging is turned off
            while filtered, because a reorder of a subset is meaningless. */}
        <div className="border-b border-[var(--hm-border)] px-4 py-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--hm-ink-400)]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a category"
              aria-label="Find a category"
              className="pl-9"
            />
          </div>
        </div>

        {filtering ? (
          <div className="divide-y divide-[var(--hm-border)]">
            {matches.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-[var(--hm-ink-500)]">
                Nothing matches “{query}”.
              </p>
            ) : (
              matches.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  parentName={
                    category.parentId ? byId.get(category.parentId)?.name : undefined
                  }
                  canWrite={canWrite}
                  pending={pending}
                  draggable={false}
                  onEdit={() => setEditing(toEditing(category))}
                  onToggle={() => toggleVisibility(category)}
                  onDelete={() => setDeleting(category)}
                />
              ))
            )}
          </div>
        ) : (
          <Reorder.Group
            axis="y"
            values={roots}
            onReorder={reorderRoots}
            className="divide-y divide-[var(--hm-border)]"
          >
            {roots.map((category) => {
              const children = childrenOf.get(category.id) ?? [];
              return (
                <div key={category.id}>
                  <CategoryRow
                    category={category}
                    canWrite={canWrite}
                    pending={pending}
                    draggable={canWrite}
                    onDragEnd={() => persistOrder(roots)}
                    onEdit={() => setEditing(toEditing(category))}
                    onToggle={() => toggleVisibility(category)}
                    onDelete={() => setDeleting(category)}
                  />
                  {children.length > 0 ? (
                    <Reorder.Group
                      axis="y"
                      values={children}
                      onReorder={(next) => reorderChildren(category.id, next)}
                      className="divide-y divide-[var(--hm-border)] border-t border-[var(--hm-border)] bg-[var(--hm-ink-50)]/60 pl-8"
                    >
                      {children.map((child) => (
                        <CategoryRow
                          key={child.id}
                          category={child}
                          canWrite={canWrite}
                          pending={pending}
                          draggable={canWrite}
                          nested
                          onDragEnd={() => persistOrder(children)}
                          onEdit={() => setEditing(toEditing(child))}
                          onToggle={() => toggleVisibility(child)}
                          onDelete={() => setDeleting(child)}
                        />
                      ))}
                    </Reorder.Group>
                  ) : null}
                </div>
              );
            })}
          </Reorder.Group>
        )}
      </Card>

      {/* What the arrangement above actually produces in the app. */}
      <Card className="mt-5">
        <CardHeader
          title="Browse preview"
          subtitle="The category strip as customers will see it, in this order"
        />
        <CardBody>
          <div className="flex flex-wrap gap-3">
            {roots
              .filter((c) => c.status === "active")
              .map((category) => (
                <Link key={category.id} href={`/categories/${category.id}`}>
                  <CategoryPreview category={category} />
                </Link>
              ))}
            {roots.every((c) => c.status !== "active") ? (
              <p className="text-[12.5px] text-[var(--hm-ink-500)]">
                Every category is hidden, so the app shows no category strip at all.
              </p>
            ) : null}
          </div>
        </CardBody>
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
  parentName,
  canWrite,
  pending,
  draggable = false,
  nested = false,
  onDragEnd,
  onEdit,
  onToggle,
  onDelete,
}: {
  category: Category;
  /** Shown in search results, where the tree that would place it is gone. */
  parentName?: string;
  canWrite: boolean;
  pending: boolean;
  draggable?: boolean;
  nested?: boolean;
  onDragEnd?: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const controls = useDragControls();

  const body = (
    <>
      {draggable && canWrite ? (
        <button
          type="button"
          onPointerDown={(event) => controls.start(event)}
          aria-label={`Reorder ${category.name}`}
          className="cursor-grab touch-none rounded p-1 text-[var(--hm-ink-300)] transition-colors hover:text-[var(--hm-ink-600,#475569)] active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
      ) : (
        <span aria-hidden className="w-6 shrink-0" />
      )}

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
          <Link
            href={`/categories/${category.id}`}
            className="truncate transition-colors hover:text-[var(--hm-cyan-700)]"
          >
            {category.name}
          </Link>
          {category.status === "hidden" ? <Chip tone="neutral">Hidden</Chip> : null}
        </p>
        <p className="truncate text-[11.5px] text-[var(--hm-ink-500)]">
          {parentName ? `${parentName} · ` : ""}
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
    </>
  );

  const className = cn(
    "flex items-center gap-3 px-4 py-3",
    nested ? "bg-transparent" : "bg-white",
  );

  // A filtered list is not reorderable, and a plain row there keeps the drag
  // machinery — and its pointer handling — out of the way entirely.
  return draggable ? (
    <Reorder.Item
      value={category}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      whileDrag={{ scale: 1.01, boxShadow: "var(--hm-shadow-lg)", zIndex: 5 }}
      className={className}
    >
      {body}
    </Reorder.Item>
  ) : (
    <div className={className}>{body}</div>
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
