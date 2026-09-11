"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/utils/cn";
import { MAX_COLLAGE_ITEMS, type CategoryArtSource } from "@/lib/media/collage";

/**
 * Choosing which of a category's products go into its tile (PRD §6).
 *
 * The tiles in the app show a pile of mixed goods, and a stock photo of
 * somebody else's produce is only ever an approximation of that. Every product
 * that has been through the media studio already has a background-free cutout,
 * so the honest version of that tile is simply several of them arranged
 * together — and it stays accurate as the catalogue changes.
 *
 * Products whose background has not been removed can still be used; the studio
 * removes it on the way through, which costs a few seconds each. That is called
 * out here rather than discovered as an unexplained wait.
 */
export function CollagePicker({
  sources,
  onBuild,
}: {
  sources: CategoryArtSource[];
  onBuild: (chosen: CategoryArtSource[]) => void;
}) {
  /** Cutouts first: they compose instantly and they compose cleanly. */
  const ordered = useMemo(
    () => [...sources].sort((a, b) => Number(b.hasCutout) - Number(a.hasCutout)),
    [sources],
  );

  const [selected, setSelected] = useState<string[]>(() =>
    ordered.slice(0, Math.min(MAX_COLLAGE_ITEMS, 5)).map((s) => s.id),
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (prev.length >= MAX_COLLAGE_ITEMS) return prev;
      return [...prev, id];
    });
  };

  const chosen = ordered.filter((s) => selected.includes(s.id));
  const needsRemoval = chosen.filter((s) => !s.hasCutout).length;

  if (sources.length === 0) {
    return (
      <EmptyState
        title="No product pictures in this category yet"
        message="Add an image to a few of this category's products, then come back and this will build the tile out of them. Until then, search the photo libraries instead."
        icon={<Sparkles className="size-5" />}
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-[12.5px] text-[var(--hm-ink-600,#475569)]">
        Pick up to {MAX_COLLAGE_ITEMS} products and they will be arranged into one picture — the
        same look the app&apos;s category tiles have. Choosing items that look different from each
        other reads best.
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
          {ordered.map((source) => {
            const isSelected = selected.includes(source.id);
            const position = selected.indexOf(source.id) + 1;
            const full = !isSelected && selected.length >= MAX_COLLAGE_ITEMS;
            return (
              <motion.button
                key={source.id}
                type="button"
                whileHover={full ? undefined : { y: -2 }}
                onClick={() => toggle(source.id)}
                disabled={full}
                aria-pressed={isSelected}
                className={cn(
                  "relative overflow-hidden rounded-[12px] border-2 bg-white text-left transition-colors",
                  isSelected
                    ? "border-[var(--hm-cyan-500)] shadow-[var(--hm-shadow-cyan)]"
                    : "border-[var(--hm-border)] hover:border-[var(--hm-cyan-200)]",
                  full && "cursor-not-allowed opacity-45",
                )}
              >
                <span className="block aspect-square bg-[var(--hm-ink-50)] p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={source.imageUrl}
                    alt={source.name}
                    loading="lazy"
                    className="size-full object-contain"
                  />
                </span>
                {isSelected ? (
                  <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-[var(--hm-cyan-600)] text-[10px] font-bold text-white tabular-nums">
                    {position}
                  </span>
                ) : null}
                <span className="block border-t border-[var(--hm-border)] px-2 py-1.5">
                  <span className="block truncate text-[11.5px] font-semibold text-[var(--hm-ink-800)]">
                    {source.name}
                  </span>
                  <span
                    className={cn(
                      "block text-[10.5px]",
                      source.hasCutout
                        ? "text-[var(--hm-success-700)]"
                        : "text-[var(--hm-ink-400)]",
                    )}
                  >
                    {source.hasCutout ? "cut out" : "background to remove"}
                  </span>
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--hm-border)] pt-3">
        <span className="text-[11.5px] text-[var(--hm-ink-500)]">
          {chosen.length === 0
            ? "Choose at least one product."
            : `${chosen.length} chosen${
                needsRemoval > 0
                  ? ` — ${needsRemoval} still ${needsRemoval === 1 ? "needs" : "need"} its background removed, which adds a few seconds each`
                  : ""
              }.`}
        </span>
        <Button onClick={() => onBuild(chosen)} disabled={chosen.length === 0}>
          <Wand2 className="size-4" />
          Build the picture
        </Button>
      </div>
    </div>
  );
}
