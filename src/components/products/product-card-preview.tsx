"use client";

import { cn } from "@/lib/utils/cn";
import { formatPKR } from "@/lib/utils/format";
import { discountPercent } from "@/lib/utils/pricing";
import { FALLBACK_PALETTE } from "@/lib/media/palette";
import type { MediaPalette } from "@/types";

/**
 * The product card exactly as the mobile app consumes it (PRD §5.4 / §24):
 * foreground cutout, saved background colour, computed text contrast, discount
 * state and the emoji fallback when there is no image.
 */
export function ProductCardPreview({
  name,
  unitLabel,
  price,
  compareAtPrice,
  imageUrl,
  emoji,
  palette,
  outOfStock,
  size = "md",
  className,
}: {
  name: string;
  unitLabel: string;
  price: number;
  compareAtPrice?: number | null;
  imageUrl?: string | null;
  emoji?: string | null;
  palette?: MediaPalette | null;
  outOfStock?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const p = palette ?? FALLBACK_PALETTE;
  const discount = discountPercent({ price, compareAtPrice: compareAtPrice ?? null });

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[18px] border border-[var(--hm-border)] bg-white shadow-[var(--hm-shadow-sm)]",
        size === "sm" ? "w-[150px]" : "w-[188px]",
        className,
      )}
    >
      <div
        className="relative flex items-center justify-center"
        style={{
          background: p.cardBg,
          height: size === "sm" ? 112 : 142,
        }}
      >
        {discount !== null ? (
          <span className="absolute top-2 left-2 rounded-full bg-[var(--hm-danger-500)] px-1.5 py-0.5 text-[10px] font-bold text-white">
            -{discount}%
          </span>
        ) : null}
        {outOfStock ? (
          <span className="absolute top-2 right-2 rounded-full bg-[rgba(15,23,42,0.72)] px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide text-white uppercase">
            Out of stock
          </span>
        ) : null}

        {imageUrl ? (
          // Provider media is remote and arbitrary; a plain img avoids needing a
          // remote-pattern allowlist for every provider CDN.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="max-h-[78%] max-w-[78%] object-contain"
            loading="lazy"
          />
        ) : (
          <span className={size === "sm" ? "text-[40px]" : "text-[52px]"} aria-hidden>
            {emoji ?? "🛒"}
          </span>
        )}
      </div>

      <div className="px-3 py-2.5" style={{ color: p.textColor === "#FFFFFF" ? undefined : undefined }}>
        <p className="truncate text-[13px] font-semibold text-[var(--hm-ink-900)]">
          {name || "Untitled product"}
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--hm-ink-500)]">{unitLabel || "—"}</p>
        <p className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-[14px] font-bold text-[var(--hm-ink-900)]">{formatPKR(price)}</span>
          {compareAtPrice && compareAtPrice > price ? (
            <span className="text-[11.5px] text-[var(--hm-ink-400)] line-through">
              {formatPKR(compareAtPrice)}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}

/** Small square tile used in tables and pickers. */
export function ProductThumb({
  imageUrl,
  emoji,
  palette,
  size = 40,
  alt = "",
}: {
  imageUrl?: string | null;
  emoji?: string | null;
  palette?: MediaPalette | null;
  size?: number;
  alt?: string;
}) {
  const p = palette ?? FALLBACK_PALETTE;
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-[var(--hm-border)]"
      style={{ background: p.cardBg, width: size, height: size }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={alt} className="size-full object-contain p-1" loading="lazy" />
      ) : (
        <span style={{ fontSize: size * 0.5 }} aria-hidden>
          {emoji ?? "🛒"}
        </span>
      )}
    </span>
  );
}
