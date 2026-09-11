"use client";

import type { MediaPalette } from "@/types";
import {
  BackgroundRemovalUnavailableError,
  DEFAULT_REMBG_MODEL,
  removeBackground,
  type RembgModel,
} from "./background-removal";
import { paletteFromCanvas } from "./extract-palette";
import {
  judgeCutout,
  planRemoval,
  removeFlatBackground,
  type RemovalMethod,
} from "./flat-background";
import { proxiedImageUrl } from "./providers/hosts";
import { FALLBACK_PALETTE, buildPalette, generateCardBackgrounds } from "./palette";
import {
  DEFAULT_TRANSFORM,
  canvasToBlob,
  loadImage,
  renderTransformed,
  trimTransparent,
  type Transform,
} from "@/components/media-studio/image-utils";

/**
 * The automatic media pipeline (PRD §5).
 *
 * The admin's only decision is which photograph to use. Everything after that —
 * squaring it, cutting the product out, trimming the empty surround, reading the
 * colours off the result and choosing a card background that passes contrast —
 * runs here, in order, without asking anything.
 *
 * The steps are sequenced deliberately: the cutout has to exist before the
 * palette is read, because colours taken from the untouched photo describe the
 * photographer's backdrop rather than the product. Each step reports progress
 * from real work, and a failed cutout downgrades the run instead of ending it —
 * a product with a background is still better than a product with no image.
 */

export type PipelineStep =
  | "loading"
  | "squaring"
  | "cutout"
  | "trimming"
  | "palette"
  | "done"
  | "failed";

export interface PipelineProgress {
  step: PipelineStep;
  /** 0-100 across the whole run, not per step. */
  progress: number;
  message: string;
}

export interface PipelineResult {
  /** The squared source, always present — this is what gets stored. */
  squared: HTMLCanvasElement;
  /** How the background was dealt with, and why. */
  method: RemovalMethod;
  methodReason: string;
  /** The cut-out product, when removal succeeded. */
  cutout: HTMLCanvasElement | null;
  /** What the card shows: the trimmed cutout, or the squared original. */
  display: HTMLCanvasElement;
  palette: MediaPalette;
  model: RembgModel | null;
  modelVersion: string | null;
  /** Set when removal was attempted and did not work. Never hidden. */
  cutoutFailure: string | null;
  timings: { total: number; cutout: number; palette: number };
}

export interface PipelineOptions {
  model?: RembgModel;
  transform?: Transform;
  onProgress?: (progress: PipelineProgress) => void;
  signal?: AbortSignal;
  /**
   * What the picture holds. A group photo that fills its frame has no
   * background to remove, and asking for one anyway is what produces a pear
   * sliced flat across the middle.
   */
  subject?: "single" | "group";
  /** Forces removal even when the picture looks like it has no background. */
  forceRemoval?: boolean;
}

/** Weights for the overall progress bar, so it moves at a believable rate. */
const WEIGHTS = { load: 8, square: 6, cutout: 72, trim: 4, palette: 10 };

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
}

function pixelsOf(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return new Uint8ClampedArray(0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

function canvasFrom(pixels: Uint8ClampedArray, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  // Copied into a fresh ImageData rather than wrapping the array: the buffer
  // that reaches here is not necessarily one ImageData will accept directly.
  const image = new ImageData(width, height);
  image.data.set(pixels);
  canvas.getContext("2d")?.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Loads the chosen image ready for canvas work.
 *
 * Provider URLs are rewritten to the same-origin proxy first. Reading pixels
 * from a third-party image is either refused outright — Pixabay's CDN sends no
 * CORS header — or taints the canvas, and a tainted canvas can be neither cut
 * out nor sampled for colour.
 */
export async function loadForEditing(url: string): Promise<HTMLImageElement> {
  const { element } = await loadImage(proxiedImageUrl(url), true);
  return element;
}

export async function runPipeline(
  source: HTMLImageElement | string,
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  const started = performance.now();
  const report = options.onProgress ?? (() => {});
  let done = 0;

  const advance = (weight: number, step: PipelineStep, message: string, within = 1) => {
    report({
      step,
      progress: Math.min(99, Math.round(done + weight * within)),
      message,
    });
  };

  /* 1. The image itself. */
  advance(0, "loading", "Opening the picture…");
  const image = typeof source === "string" ? await loadForEditing(source) : source;
  throwIfAborted(options.signal);
  done += WEIGHTS.load;

  /*
   * 2. A square canvas, because every product card is square.
   *
   * How it is fitted depends on what happens next. A picture that keeps its
   * background wants to fill the tile, so it is cropped to the square; one that
   * is about to be cut out is fitted whole, so nothing is lost before the
   * removal has had a chance to look at it.
   */
  advance(0, "squaring", "Fitting it to the card…");
  const requested = options.transform ?? DEFAULT_TRANSFORM;
  const probe = renderTransformed(image, requested);
  const plan = planRemoval(pixelsOf(probe), probe.width, probe.height, {
    subject: options.subject,
  });
  const method: RemovalMethod = options.forceRemoval && plan.method === "none" ? "model" : plan.method;

  const squared =
    method === "none" && requested.fit === "contain"
      ? renderTransformed(image, { ...requested, fit: "cover" })
      : probe;
  throwIfAborted(options.signal);
  done += WEIGHTS.square;

  /* 3. Background removal, by whichever means suits the picture. */
  const cutoutStarted = performance.now();
  let cutout: HTMLCanvasElement | null = null;
  let model: RembgModel | null = null;
  let modelVersion: string | null = null;
  let cutoutFailure: string | null = null;

  if (method === "none") {
    // Nothing to remove. Said plainly rather than attempted and botched.
    advance(WEIGHTS.cutout, "cutout", plan.reason);
  } else if (method === "flat") {
    advance(WEIGHTS.cutout, "cutout", "Clearing the backdrop…");
    const cleared = removeFlatBackground(
      pixelsOf(squared),
      squared.width,
      squared.height,
      plan.background!,
    );
    const canvas = canvasFrom(cleared.pixels, squared.width, squared.height);
    const quality = judgeCutout(cleared.pixels, squared.width, squared.height);
    if (quality.usable) {
      cutout = canvas;
    } else {
      cutoutFailure = `The backdrop could not be cleared cleanly — ${quality.reason}.`;
    }
  } else {
    try {
      const blob = await canvasToBlob(squared, "image/png");
      const result = await removeBackground(blob, {
        model: options.model ?? DEFAULT_REMBG_MODEL,
        signal: options.signal,
        onProgress: (info) => {
          advance(WEIGHTS.cutout, "cutout", info.message, info.progress / 100);
        },
      });

      const { element } = await loadImage(result.objectUrl, false);
      const canvas = document.createElement("canvas");
      canvas.width = element.naturalWidth;
      canvas.height = element.naturalHeight;
      canvas.getContext("2d")?.drawImage(element, 0, 0);
      URL.revokeObjectURL(result.objectUrl);

      // The model always returns a mask, including when it could not read the
      // picture. Judging the result is the only way to tell those apart.
      const quality = judgeCutout(pixelsOf(canvas), canvas.width, canvas.height);
      if (quality.usable) {
        cutout = canvas;
        model = result.model;
        modelVersion = result.modelVersion;
      } else {
        cutoutFailure = `The cutout came out wrong — ${quality.reason}, so the photo is used as it is.`;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      cutoutFailure =
        error instanceof BackgroundRemovalUnavailableError
          ? error.message
          : error instanceof Error
            ? error.message
            : "The background could not be removed.";
      console.warn(`[hashmimart-admin] cutout skipped: ${cutoutFailure}`);
    }
  }
  const cutoutMs = Math.round(performance.now() - cutoutStarted);
  done += WEIGHTS.cutout;
  throwIfAborted(options.signal);

  /* 4. Trim the empty surround so the product fills its card. */
  advance(0, "trimming", "Centring the product…");
  const display = cutout ? trimTransparent(cutout) : squared;
  done += WEIGHTS.trim;
  throwIfAborted(options.signal);

  /* 5. Colours, read from the cutout where there is one. */
  advance(0, "palette", "Reading the colours…");
  const paletteStarted = performance.now();
  const palette = autoPalette(display);
  const paletteMs = Math.round(performance.now() - paletteStarted);
  done += WEIGHTS.palette;

  report({ step: "done", progress: 100, message: "Ready" });

  return {
    squared,
    method,
    methodReason: plan.reason,
    cutout,
    display,
    palette,
    model,
    modelVersion,
    cutoutFailure,
    timings: { total: Math.round(performance.now() - started), cutout: cutoutMs, palette: paletteMs },
  };
}

/**
 * Reads the colours and picks the card background without asking.
 *
 * `generateCardBackgrounds` already guarantees every candidate clears 4.5:1
 * against its own chosen text colour, so the choice is about which one looks
 * like the product: the soft tint of the dominant colour. It only gives way
 * when the dominant colour is so close to white that the tint is invisible,
 * in which case the brighter vibrant tint carries the card instead.
 */
export function autoPalette(canvas: HTMLCanvasElement): MediaPalette {
  const base = paletteFromCanvas(canvas);
  if (!base.dominant) return FALLBACK_PALETTE;

  const [soft, bright] = generateCardBackgrounds(base);
  const chosen = isNearWhite(soft.hex) && !isNearWhite(bright.hex) ? bright : soft;
  return buildPalette(base, chosen.hex);
}

/** A background this pale reads as plain white next to the app's own surface. */
function isNearWhite(hex: string): boolean {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return r > 246 && g > 246 && b > 246;
}
