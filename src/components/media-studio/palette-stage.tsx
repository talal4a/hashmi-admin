"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/utils/cn";
import {
  FALLBACK_PALETTE,
  buildPalette,
  contrastRatio,
  foregroundFor,
  generateCardBackgrounds,
  isValidHex,
  type CardBackgroundCandidate,
} from "@/lib/media/palette";
import { extractSwatches, type ExtractedSwatches } from "@/lib/media/extract-palette";
import { ProductCardPreview } from "@/components/products/product-card-preview";
import type { MediaPalette } from "@/types";

/**
 * Palette extraction and card-background choice (PRD §5.4).
 *
 * Swatches come from the cutout where one exists, three softened candidates are
 * proposed, a manual hex override is always available, and the exact card the
 * mobile app will render is previewed before anything is saved.
 */
export function PaletteStage({
  imageSource,
  productName,
  unitLabel,
  price,
  compareAtPrice,
  emoji,
  palette,
  onChange,
}: {
  imageSource: string;
  productName: string;
  unitLabel: string;
  price: number;
  compareAtPrice: number | null;
  emoji: string | null;
  palette: MediaPalette | null;
  onChange: (next: MediaPalette) => void;
}) {
  const [swatches, setSwatches] = useState<ExtractedSwatches | null>(null);
  const [candidates, setCandidates] = useState<CardBackgroundCandidate[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [manualHex, setManualHex] = useState(palette?.cardBg ?? "");
  const [failed, setFailed] = useState(false);

  const extract = useCallback(async () => {
    setExtracting(true);
    setFailed(false);
    try {
      const found = await extractSwatches(imageSource);
      setSwatches(found);
      const generated = generateCardBackgrounds(found);
      setCandidates(generated);
      if (!found.dominant && !found.vibrant) setFailed(true);
      // Adopt the first candidate unless the admin already picked something.
      if (!palette) {
        onChange(buildPalette(found, generated[0].hex));
        setManualHex(generated[0].hex);
      }
    } catch {
      setFailed(true);
      setCandidates(generateCardBackgrounds({}));
      if (!palette) onChange(FALLBACK_PALETTE);
    } finally {
      setExtracting(false);
    }
  }, [imageSource, palette, onChange]);

  useEffect(() => {
    // Deferred so the first state update lands after the effect body, rather
    // than cascading a render inside it.
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void extract();
    });
    return () => {
      cancelled = true;
    };
    // Re-extract whenever the underlying image changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSource]);

  const active = palette?.cardBg ?? FALLBACK_PALETTE.cardBg;

  const choose = (hex: string) => {
    setManualHex(hex);
    onChange(buildPalette(swatches ?? {}, hex));
  };

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <div className="flex-1">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-[12.5px] font-semibold text-[var(--hm-ink-700)]">
            Card background candidates
          </p>
          <Button variant="ghost" size="sm" onClick={extract} disabled={extracting}>
            {extracting ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Re-extract
          </Button>
        </div>

        {failed ? (
          <p className="mb-3 rounded-[var(--hm-radius-control)] border border-[var(--hm-warning-100)] bg-[var(--hm-warning-50)] px-3 py-2 text-[12px] text-[var(--hm-warning-700)]">
            Colours could not be read from this image, so HashmiMart&apos;s default pale cyan is
            offered instead. You can still set any colour by hand.
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {(candidates.length ? candidates : generateCardBackgrounds({})).map((candidate) => {
            const selected = candidate.hex.toUpperCase() === active.toUpperCase();
            return (
              <motion.button
                key={candidate.id}
                type="button"
                whileHover={{ y: -2 }}
                onClick={() => choose(candidate.hex)}
                aria-pressed={selected}
                className={cn(
                  "overflow-hidden rounded-[var(--hm-radius-control-lg)] border-2 text-left transition-colors",
                  selected
                    ? "border-[var(--hm-cyan-500)] shadow-[var(--hm-shadow-cyan)]"
                    : "border-[var(--hm-border)] hover:border-[var(--hm-cyan-200)]",
                )}
              >
                <span
                  className="flex h-16 items-center justify-center"
                  style={{ background: candidate.hex }}
                >
                  <span
                    className="text-[13px] font-bold"
                    style={{ color: candidate.textColor }}
                  >
                    {productName ? productName.slice(0, 14) : "HashmiMart"}
                  </span>
                  {selected ? (
                    <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-[var(--hm-cyan-500)] text-white">
                      <Check className="size-3" />
                    </span>
                  ) : null}
                </span>
                <span className="block bg-white px-2.5 py-2">
                  <span className="block text-[12px] font-semibold text-[var(--hm-ink-800)]">
                    {candidate.label}
                  </span>
                  <span className="flex items-center justify-between text-[10.5px] text-[var(--hm-ink-400)]">
                    <code className="font-mono">{candidate.hex}</code>
                    <span title="Contrast against the chosen text colour">
                      {candidate.contrast.toFixed(1)}:1
                    </span>
                  </span>
                </span>
              </motion.button>
            );
          })}
        </div>

        <div className="mt-4">
          <Field
            label="Manual override"
            htmlFor="card-bg-hex"
            hint="Any hex value. Text colour is recomputed from contrast, so it always stays readable."
            error={manualHex && !isValidHex(manualHex) ? "Enter a valid hex colour" : null}
          >
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={isValidHex(manualHex) ? manualHex : "#ECFEFF"}
                onChange={(e) => choose(e.target.value.toUpperCase())}
                aria-label="Pick card background colour"
                className="h-9.5 w-12 cursor-pointer rounded-[var(--hm-radius-control)] border border-[var(--hm-border)] bg-white p-1"
              />
              <Input
                id="card-bg-hex"
                value={manualHex}
                onChange={(e) => {
                  const next = e.target.value.toUpperCase();
                  setManualHex(next);
                  if (isValidHex(next)) choose(next);
                }}
                placeholder="#ECFEFF"
                className="font-mono"
                invalid={Boolean(manualHex) && !isValidHex(manualHex)}
              />
            </div>
          </Field>
        </div>

        {/* Extracted swatches, for reference */}
        {swatches ? (
          <div className="mt-4">
            <p className="mb-1.5 text-[12px] font-semibold text-[var(--hm-ink-700)]">
              Extracted swatches
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["Dominant", swatches.dominant],
                  ["Vibrant", swatches.vibrant],
                  ["Muted", swatches.muted],
                  ["Light", swatches.light],
                  ["Dark", swatches.dark],
                ] as const
              ).map(([label, hex]) =>
                hex ? (
                  <button
                    key={label}
                    type="button"
                    onClick={() => choose(hex)}
                    title={`${label} ${hex} — click to soften into a card background`}
                    className="flex items-center gap-1.5 rounded-full border border-[var(--hm-border)] bg-white py-1 pr-2.5 pl-1 text-[11px] text-[var(--hm-ink-600,#475569)] transition-colors hover:border-[var(--hm-cyan-300)]"
                  >
                    <span className="size-4 rounded-full" style={{ background: hex }} />
                    {label}
                  </button>
                ) : null,
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Exact mobile-card preview */}
      <div className="lg:w-[240px]">
        <p className="mb-2 text-[12.5px] font-semibold text-[var(--hm-ink-700)]">
          Mobile card preview
        </p>
        <div className="flex justify-center rounded-[var(--hm-radius-card)] border border-[var(--hm-border)] bg-[var(--hm-ink-50)] p-5">
          <ProductCardPreview
            name={productName || "Product name"}
            unitLabel={unitLabel}
            price={price}
            compareAtPrice={compareAtPrice}
            imageUrl={imageSource}
            emoji={emoji}
            palette={palette}
          />
        </div>
        <dl className="mt-3 space-y-1.5 text-[11.5px]">
          <div className="flex justify-between">
            <dt className="text-[var(--hm-ink-500)]">Background</dt>
            <dd className="font-mono text-[var(--hm-ink-800)]">{active}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--hm-ink-500)]">Text colour</dt>
            <dd className="font-mono text-[var(--hm-ink-800)]">
              {palette?.textColor ?? foregroundFor(active)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--hm-ink-500)]">Contrast</dt>
            <dd className="text-[var(--hm-ink-800)]">
              {contrastRatio(active, palette?.textColor ?? foregroundFor(active)).toFixed(2)}:1
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-[11px] text-[var(--hm-ink-400)]">
          These values are saved with the product, so the app renders the card without recomputing
          any colour on the device.
        </p>
      </div>
    </div>
  );
}
