"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/utils/cn";
import {
  FALLBACK_PALETTE,
  buildPalette,
  contrastRatio,
  foregroundFor,
  generateCardBackgrounds,
  isValidHex,
} from "@/lib/media/palette";
import type { ExtractedSwatches } from "@/lib/media/quantize";
import type { MediaPalette } from "@/types";

/**
 * Card-colour override (PRD §5.4).
 *
 * The pipeline has already read the colours and chosen a background, so this is
 * only here for the times an admin wants a different one. It is deliberately
 * controlled: it never extracts anything itself, which is what the old stage
 * did — badly, because it re-read the image through a canvas it did not own and
 * silently produced nothing whenever that read was blocked.
 *
 * Every candidate is guaranteed to clear 4.5:1 against its own text colour, and
 * the contrast of whatever is chosen is shown rather than assumed.
 */
export function ColourPanel({
  swatches,
  productName,
  palette,
  onChange,
}: {
  swatches: ExtractedSwatches | null;
  productName: string;
  palette: MediaPalette | null;
  onChange: (next: MediaPalette) => void;
}) {
  const active = palette?.cardBg ?? FALLBACK_PALETTE.cardBg;
  const [manualHex, setManualHex] = useState(active);

  const candidates = useMemo(
    () => generateCardBackgrounds(swatches ?? {}),
    [swatches],
  );

  const choose = (hex: string) => {
    setManualHex(hex.toUpperCase());
    onChange(buildPalette(swatches ?? {}, hex));
  };

  const textColor = palette?.textColor ?? foregroundFor(active);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {candidates.map((candidate) => {
          const selected = candidate.hex.toUpperCase() === active.toUpperCase();
          return (
            <motion.button
              key={candidate.id}
              type="button"
              whileHover={{ y: -2 }}
              onClick={() => choose(candidate.hex)}
              aria-pressed={selected}
              className={cn(
                "relative overflow-hidden rounded-[var(--hm-radius-control-lg)] border-2 text-left transition-colors",
                selected
                  ? "border-[var(--hm-cyan-500)] shadow-[var(--hm-shadow-cyan)]"
                  : "border-[var(--hm-border)] hover:border-[var(--hm-cyan-200)]",
              )}
            >
              <span
                className="flex h-14 items-center justify-center"
                style={{ background: candidate.hex }}
              >
                <span className="text-[13px] font-bold" style={{ color: candidate.textColor }}>
                  {productName ? productName.slice(0, 14) : "HashmiMart"}
                </span>
              </span>
              {selected ? (
                <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-[var(--hm-cyan-500)] text-white">
                  <Check className="size-3" />
                </span>
              ) : null}
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

      {/* The colours actually read off the product, offered as shortcuts. */}
      {swatches ? (
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-[var(--hm-ink-700)]">
            Colours found in this product
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
                  title={`${label} ${hex} — click to soften it into a card background`}
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

      <Field
        label="Any other colour"
        htmlFor="card-bg-hex"
        hint="Text colour is recomputed from contrast, so it always stays readable."
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
          <span className="shrink-0 text-[11.5px] text-[var(--hm-ink-500)] tabular-nums">
            {contrastRatio(active, textColor).toFixed(2)}:1
          </span>
        </div>
      </Field>
    </div>
  );
}
