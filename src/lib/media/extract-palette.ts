"use client";

import type { MediaPalette } from "@/types";
import { FALLBACK_PALETTE, buildPalette } from "./palette";
import { EMPTY_SWATCHES, swatchesFromPixels, type ExtractedSwatches } from "./quantize";

export type { ExtractedSwatches };

/**
 * Palette extraction from a canvas (PRD §5.4).
 *
 * The pixels come straight from the canvas the pipeline has already produced —
 * the cutout where there is one, so the swatches describe the product and not
 * whatever background the stock photo happened to have.
 *
 * Failure is never fatal: the caller gets the HashmiMart pale cyan default, as
 * PRD §16.1 requires.
 */

/** Sampling one pixel in ~120k keeps a 4000px photo under a few milliseconds. */
const TARGET_SAMPLES = 24_000;

function strideFor(width: number, height: number): number {
  return Math.max(1, Math.floor((width * height) / TARGET_SAMPLES));
}

export function extractSwatchesFromCanvas(canvas: HTMLCanvasElement): ExtractedSwatches {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return EMPTY_SWATCHES;

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    // Only reachable if a caller draws a cross-origin image without the proxy;
    // the studio routes provider images through /api/media/proxy so it cannot.
    console.warn("[hashmimart-admin] canvas is tainted — colours cannot be read from it.");
    return EMPTY_SWATCHES;
  }

  return swatchesFromPixels(data, { stride: strideFor(canvas.width, canvas.height) });
}

/** Convenience wrapper returning a persistable palette. Never throws. */
export function paletteFromCanvas(
  canvas: HTMLCanvasElement,
  chosenBackground?: string | null,
): MediaPalette {
  const swatches = extractSwatchesFromCanvas(canvas);
  if (!swatches.dominant) {
    return chosenBackground ? buildPalette({}, chosenBackground) : FALLBACK_PALETTE;
  }
  return buildPalette(swatches, chosenBackground);
}

/**
 * Same, from any image source. Used for media already saved on a product, where
 * only a URL survives. The image is drawn once at a reduced size — the palette
 * does not need 4000 pixels to find a colour.
 */
export async function extractSwatchesFromUrl(url: string): Promise<ExtractedSwatches> {
  const canvas = await drawToCanvas(url, 320);
  return canvas ? extractSwatchesFromCanvas(canvas) : EMPTY_SWATCHES;
}

async function drawToCanvas(url: string, maxEdge: number): Promise<HTMLCanvasElement | null> {
  const image = await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  if (!image) return null;

  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}
