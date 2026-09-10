"use client";

import { useCallback, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AlertCircle, ExternalLink, Loader2, Search, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/field";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { cn } from "@/lib/utils/cn";
import { MAX_UPLOAD_BYTES } from "./constants";
import { useProviderSearch, type ProviderTab } from "./use-provider-search";
import type { ProviderImageResult } from "@/types";

const TABS: { id: ProviderTab | "upload"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pixabay", label: "Pixabay" },
  { id: "pexels", label: "Pexels" },
  { id: "unsplash", label: "Unsplash" },
  { id: "upload", label: "Upload" },
];

const PROVIDER_TONE = {
  pixabay: "success",
  pexels: "info",
  unsplash: "navy",
} as const;

/** Staggered reveal, capped so a large page never becomes slow (PRD §13.2). */
const STAGGER_CAP = 24;

export function SourcePicker({
  productName,
  onSelectProvider,
  onSelectUpload,
}: {
  productName?: string;
  onSelectProvider: (result: ProviderImageResult) => void;
  onSelectUpload: (file: File) => void;
}) {
  const reduced = useReducedMotion();
  const search = useProviderSearch();
  const [uploadTab, setUploadTab] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File | undefined) => {
      setUploadError(null);
      if (!file) return;
      if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) {
        setUploadError("Only JPG, PNG, WEBP and AVIF images are allowed.");
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setUploadError(`Image must be smaller than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
        return;
      }
      onSelectUpload(file);
    },
    [onSelectUpload],
  );

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Provider tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((tab) => {
          const active = tab.id === "upload" ? uploadTab : !uploadTab && search.tab === tab.id;
          const status = search.statuses.find((s) => s.provider === tab.id);
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (tab.id === "upload") setUploadTab(true);
                else {
                  setUploadTab(false);
                  search.setTab(tab.id);
                }
              }}
              className={cn(
                "relative rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors duration-[var(--hm-dur-fast)]",
                active
                  ? "border-[var(--hm-cyan-300)] bg-[var(--hm-cyan-50)] text-[var(--hm-cyan-800)]"
                  : "border-[var(--hm-border)] bg-white text-[var(--hm-ink-600,#475569)] hover:border-[var(--hm-cyan-200)]",
              )}
            >
              {tab.label}
              {status?.error === "Not configured" ? (
                <span className="ml-1.5 text-[10px] font-normal text-[var(--hm-warning-700)]">
                  not configured
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {uploadTab ? (
        <div className="flex flex-1 flex-col">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "flex flex-1 flex-col items-center justify-center rounded-[var(--hm-radius-card)] border-2 border-dashed px-6 py-12 text-center transition-colors",
              dragging
                ? "border-[var(--hm-cyan-400)] bg-[var(--hm-cyan-50)]"
                : "border-[var(--hm-border-strong)] bg-[var(--hm-ink-50)]",
            )}
          >
            <span className="mb-3 flex size-12 items-center justify-center rounded-[14px] bg-[var(--hm-cyan-50)] text-[var(--hm-cyan-700)]">
              <Upload className="size-5" />
            </span>
            <p className="text-[14px] font-semibold text-[var(--hm-ink-900)]">
              Drop a packshot here
            </p>
            <p className="mt-1 max-w-sm text-[12.5px] text-[var(--hm-ink-500)]">
              Supplier or own-brand imagery is preferred for product packshots — ownership and
              licensing are unambiguous. JPG, PNG, WEBP or AVIF up to{" "}
              {Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => fileRef.current?.click()}>
              Choose file
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="sr-only"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            {uploadError ? (
              <p role="alert" className="mt-3 text-[12.5px] font-medium text-[var(--hm-danger-700)]">
                {uploadError}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--hm-ink-400)]" />
            <Input
              value={search.query}
              onChange={(e) => search.setQuery(e.target.value)}
              placeholder="Search stock photos — try “fresh tomatoes”"
              aria-label="Search stock images"
              className="pl-9"
              autoFocus
            />
            {search.query ? (
              <button
                type="button"
                onClick={() => search.setQuery("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-[var(--hm-ink-400)] hover:text-[var(--hm-ink-700)]"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          {/* Product-name shortcut and recent searches (PRD §5.2) */}
          {search.query.trim().length < search.minQuery ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {productName ? (
                <button
                  type="button"
                  onClick={() => search.setQuery(productName)}
                  className="rounded-full bg-[var(--hm-cyan-50)] px-2.5 py-1 text-[12px] font-semibold text-[var(--hm-cyan-800)] transition-colors hover:bg-[var(--hm-cyan-100)]"
                >
                  Search “{productName}”
                </button>
              ) : null}
              {search.recent.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => search.setQuery(term)}
                  className="rounded-full border border-[var(--hm-border)] px-2.5 py-1 text-[12px] text-[var(--hm-ink-600,#475569)] transition-colors hover:border-[var(--hm-cyan-200)]"
                >
                  {term}
                </button>
              ))}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {search.error ? (
              <div className="flex items-start gap-2 rounded-[var(--hm-radius-control)] border border-[var(--hm-danger-100)] bg-[var(--hm-danger-50)] px-3 py-2.5 text-[12.5px] text-[var(--hm-danger-700)]">
                <AlertCircle className="mt-px size-4 shrink-0" />
                <span>{search.error}</span>
              </div>
            ) : search.loading ? (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-[12px]" />
                ))}
              </div>
            ) : search.query.trim().length < search.minQuery ? (
              <EmptyState
                title="Search across Pixabay, Pexels and Unsplash"
                message="Type at least two characters. Every request goes through the HashmiMart server — provider keys never reach the browser."
                icon={<Search className="size-5" />}
              />
            ) : search.results.length === 0 ? (
              <EmptyState
                title={`Nothing found for “${search.query}”`}
                message="Try a different term, or upload your own packshot."
              />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                  {search.results.map((result, index) => (
                    <motion.button
                      key={`${result.provider}-${result.id}`}
                      type="button"
                      initial={reduced ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.2,
                        delay: reduced ? 0 : Math.min(index, STAGGER_CAP) * 0.025,
                      }}
                      onClick={() => onSelectProvider(result)}
                      className="group relative overflow-hidden rounded-[12px] border border-[var(--hm-border)] bg-[var(--hm-ink-50)] text-left transition-all duration-[var(--hm-dur-fast)] hover:-translate-y-0.5 hover:border-[var(--hm-cyan-300)] hover:shadow-[var(--hm-shadow-md)]"
                    >
                      <span className="block aspect-square overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={result.previewUrl}
                          alt={result.attributionText}
                          loading="lazy"
                          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                        />
                      </span>
                      <span className="absolute top-1.5 left-1.5">
                        <Chip tone={PROVIDER_TONE[result.provider]} className="px-1.5 py-0.5 text-[9.5px]">
                          {result.provider}
                        </Chip>
                      </span>
                      <span className="block border-t border-[var(--hm-border)] bg-white px-2 py-1.5">
                        <span className="block truncate text-[11.5px] font-semibold text-[var(--hm-ink-800)]">
                          {result.author ?? "Unknown"}
                        </span>
                        <span className="flex items-center justify-between text-[10.5px] text-[var(--hm-ink-400)]">
                          <span>
                            {result.width && result.height ? `${result.width}×${result.height}` : "—"}
                          </span>
                          {result.hotlinkOnly ? (
                            <span title="Unsplash requires hotlinking, so this image is referenced rather than copied">
                              hotlink
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="pointer-events-none absolute inset-x-0 bottom-[46px] flex justify-center pb-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <span className="rounded-full bg-[var(--hm-cyan-600)] px-2.5 py-1 text-[11px] font-bold text-white shadow-md">
                          Use image
                        </span>
                      </span>
                    </motion.button>
                  ))}
                </div>

                <div className="flex items-center justify-center py-4">
                  <Button variant="outline" size="sm" onClick={search.loadMore} disabled={search.loadingMore}>
                    {search.loadingMore ? <Loader2 className="size-4 animate-spin" /> : null}
                    {search.loadingMore ? "Loading…" : "Load more"}
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Attribution notice — required by the provider terms (PRD §5.1) */}
          {search.results.length > 0 ? (
            <p className="flex items-center gap-1.5 border-t border-[var(--hm-border)] pt-2.5 text-[11px] text-[var(--hm-ink-400)]">
              <ExternalLink className="size-3" />
              Photographer and source are stored with the product. Unsplash images stay hotlinked as
              their API terms require; Pixabay and Pexels selections are copied into HashmiMart
              storage.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
