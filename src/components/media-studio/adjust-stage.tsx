"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crop, Maximize2, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { DEFAULT_TRANSFORM, renderTransformed, type Transform } from "./image-utils";

/**
 * Crop / rotate / object-fit stage of the media pipeline (PRD §5.5).
 * The crop box is dragged directly on the image; nothing is destructive until
 * the admin moves on, and Reset always returns to the untouched source.
 */
export function AdjustStage({
  image,
  transform,
  onChange,
}: {
  image: HTMLImageElement;
  transform: Transform;
  onChange: (next: Transform) => void;
}) {
  const previewRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ startX: number; startY: number } | null>(null);

  const paint = useCallback(() => {
    const target = previewRef.current;
    if (!target) return;
    const rendered = renderTransformed(image, { ...transform, size: 420 });
    target.width = rendered.width;
    target.height = rendered.height;
    const ctx = target.getContext("2d");
    ctx?.clearRect(0, 0, target.width, target.height);
    ctx?.drawImage(rendered, 0, 0);
  }, [image, transform]);

  useEffect(() => {
    paint();
  }, [paint]);

  const rotate = (delta: number) =>
    onChange({ ...transform, rotation: (((transform.rotation + delta) % 360) + 360) % 360 });

  const onPointerDown = (event: React.PointerEvent) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    setDrag({
      startX: (event.clientX - rect.left) / rect.width,
      startY: (event.clientY - rect.top) / rect.height,
    });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    const left = Math.max(0, Math.min(drag.startX, x));
    const top = Math.max(0, Math.min(drag.startY, y));
    const width = Math.min(1 - left, Math.abs(x - drag.startX));
    const height = Math.min(1 - top, Math.abs(y - drag.startY));

    if (width > 0.05 && height > 0.05) {
      onChange({ ...transform, crop: { x: left, y: top, width, height } });
    }
  };

  const cropped =
    transform.crop.x !== 0 ||
    transform.crop.y !== 0 ||
    transform.crop.width !== 1 ||
    transform.crop.height !== 1;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex-1">
        <p className="mb-2 text-[12.5px] font-semibold text-[var(--hm-ink-700)]">
          Source — drag to crop
        </p>
        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => setDrag(null)}
          onPointerCancel={() => setDrag(null)}
          className="relative cursor-crosshair touch-none overflow-hidden rounded-[var(--hm-radius-card)] border border-[var(--hm-border)] bg-[var(--hm-ink-100)] select-none"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.src}
            alt="Source image"
            draggable={false}
            className="block max-h-[340px] w-full object-contain"
          />
          {cropped ? (
            <div
              aria-hidden
              className="pointer-events-none absolute border-2 border-[var(--hm-cyan-400)] bg-[var(--hm-cyan-400)]/12"
              style={{
                left: `${transform.crop.x * 100}%`,
                top: `${transform.crop.y * 100}%`,
                width: `${transform.crop.width * 100}%`,
                height: `${transform.crop.height * 100}%`,
              }}
            />
          ) : null}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => rotate(-90)}>
            <RotateCcw className="size-3.5" />
            Rotate left
          </Button>
          <Button variant="outline" size="sm" onClick={() => rotate(90)}>
            <RotateCw className="size-3.5" />
            Rotate right
          </Button>
          <Button
            variant={transform.fit === "contain" ? "secondary" : "outline"}
            size="sm"
            onClick={() => onChange({ ...transform, fit: "contain" })}
          >
            <Maximize2 className="size-3.5" />
            Contain
          </Button>
          <Button
            variant={transform.fit === "cover" ? "secondary" : "outline"}
            size="sm"
            onClick={() => onChange({ ...transform, fit: "cover" })}
          >
            <Crop className="size-3.5" />
            Cover
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...DEFAULT_TRANSFORM, size: transform.size })}
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="lg:w-[300px]">
        <p className="mb-2 text-[12.5px] font-semibold text-[var(--hm-ink-700)]">Square result</p>
        <div
          className={cn(
            "hm-checkerboard overflow-hidden rounded-[var(--hm-radius-card)] border border-[var(--hm-border)]",
          )}
        >
          <canvas ref={previewRef} className="block aspect-square w-full" />
        </div>
        <p className="mt-2 text-[11.5px] text-[var(--hm-ink-500)]">
          Product cards are square. Anything outside the crop is discarded before background removal.
        </p>
      </div>
    </div>
  );
}
