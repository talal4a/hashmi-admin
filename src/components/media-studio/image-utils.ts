"use client";

export interface LoadedImage {
  element: HTMLImageElement;
  width: number;
  height: number;
}

/** Loads an image for canvas work, requesting CORS so remote pixels are readable. */
export function loadImage(src: string, crossOrigin = true): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve({ element: img, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () =>
      reject(
        new Error(
          "This image could not be loaded for editing. The provider may block cross-origin reads — try uploading the file instead.",
        ),
      );
    img.src = src;
  });
}

export interface Transform {
  /** Degrees, always a multiple of 90. */
  rotation: number;
  /** Normalised crop box within the source image, 0..1. */
  crop: { x: number; y: number; width: number; height: number };
  fit: "contain" | "cover";
  /** Square output edge in pixels. */
  size: number;
}

export const DEFAULT_TRANSFORM: Transform = {
  rotation: 0,
  crop: { x: 0, y: 0, width: 1, height: 1 },
  fit: "contain",
  size: 1000,
};

/**
 * Renders the source through the crop/rotate/fit transform onto a square canvas.
 * Transparency is preserved so a cutout can be re-rendered without a matte.
 */
export function renderTransformed(image: HTMLImageElement, transform: Transform): HTMLCanvasElement {
  const { rotation, crop, fit, size } = transform;

  const sw = image.naturalWidth;
  const sh = image.naturalHeight;
  const sx = Math.round(crop.x * sw);
  const sy = Math.round(crop.y * sh);
  const cw = Math.max(1, Math.round(crop.width * sw));
  const ch = Math.max(1, Math.round(crop.height * sh));

  // A quarter turn swaps the effective width and height.
  const quarter = ((rotation % 360) + 360) % 360;
  const swapped = quarter === 90 || quarter === 270;
  const effW = swapped ? ch : cw;
  const effH = swapped ? cw : ch;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");

  const scale = fit === "cover" ? Math.max(size / effW, size / effH) : Math.min(size / effW, size / effH);
  const drawW = effW * scale;
  const drawH = effH * scale;

  ctx.imageSmoothingQuality = "high";
  ctx.translate(size / 2, size / 2);
  ctx.rotate((quarter * Math.PI) / 180);
  ctx.drawImage(
    image,
    sx,
    sy,
    cw,
    ch,
    swapped ? -drawH / 2 : -drawW / 2,
    swapped ? -drawW / 2 : -drawH / 2,
    swapped ? drawH : drawW,
    swapped ? drawW : drawH,
  );

  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not read the edited image."))),
      type,
      quality,
    );
  });
}

/** Trims fully transparent edges so the cutout sits centred on the card. */
export function trimTransparent(canvas: HTMLCanvasElement, padding = 0.04): HTMLCanvasElement {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;

  const { width, height } = canvas;
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, width, height).data;
  } catch {
    // Tainted canvas — return as-is rather than failing the pipeline.
    return canvas;
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0 || maxY < 0) return canvas; // fully transparent

  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  const edge = Math.max(boxW, boxH);
  const pad = Math.round(edge * padding);
  const out = document.createElement("canvas");
  out.width = edge + pad * 2;
  out.height = edge + pad * 2;

  const outCtx = out.getContext("2d");
  if (!outCtx) return canvas;
  outCtx.drawImage(
    canvas,
    minX,
    minY,
    boxW,
    boxH,
    pad + (edge - boxW) / 2,
    pad + (edge - boxH) / 2,
    boxW,
    boxH,
  );
  return out;
}

/**
 * A small copy of a canvas, for showing on screen.
 *
 * A full-resolution PNG data URL of a 1000px cutout is roughly a megabyte of
 * string held in React state and re-parsed on every render, all to fill a
 * 150px card. The stored asset still comes from the full-size canvas; only
 * what the eye sees is scaled down.
 */
export function previewDataUrl(canvas: HTMLCanvasElement, maxEdge = 512): string {
  const longest = Math.max(canvas.width, canvas.height);
  if (longest <= maxEdge) return canvas.toDataURL("image/png");

  const scale = maxEdge / longest;
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(canvas.width * scale));
  small.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = small.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/png");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, small.width, small.height);
  return small.toDataURL("image/png");
}

/**
 * Grounds a cutout with a soft contact shadow (PRD §5.5, layer 9).
 *
 * A cut-out product on a flat card floats; a shadow beneath it sits. It is
 * drawn as an ellipse under the product's own base — found from the alpha, not
 * assumed to be the bottom of the canvas — and composited underneath, so it
 * never darkens the product itself.
 *
 * Baked into the transparent PNG deliberately. Kept faint and neutral, it reads
 * correctly on any light card, and the alternative — re-deriving it wherever
 * the image is rendered — would put this logic in the phone app too.
 */
export function addContactShadow(
  canvas: HTMLCanvasElement,
  options: { opacity?: number; spread?: number } = {},
): HTMLCanvasElement {
  const opacity = options.opacity ?? 0.2;
  const spread = options.spread ?? 0.45;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return canvas;
  }

  // Where the product actually stands, so the shadow lands under its base.
  let minX = canvas.width;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] <= 24) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxY < 0 || maxX < minX) return canvas;

  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const outCtx = out.getContext("2d");
  if (!outCtx) return canvas;

  const centreX = (minX + maxX) / 2;
  const width = (maxX - minX + 1) * spread;
  const height = Math.max(4, (maxX - minX + 1) * 0.055);
  // Just inside the base, so the shadow reads as contact rather than a halo.
  const centreY = Math.min(canvas.height - 1, maxY - height * 0.35);

  outCtx.save();
  outCtx.translate(centreX, centreY);
  outCtx.scale(1, height / width);
  const gradient = outCtx.createRadialGradient(0, 0, 0, 0, 0, width);
  gradient.addColorStop(0, `rgba(15, 23, 42, ${opacity})`);
  gradient.addColorStop(0.55, `rgba(15, 23, 42, ${opacity * 0.45})`);
  gradient.addColorStop(1, "rgba(15, 23, 42, 0)");
  outCtx.fillStyle = gradient;
  outCtx.beginPath();
  outCtx.arc(0, 0, width, 0, Math.PI * 2);
  outCtx.fill();
  outCtx.restore();

  outCtx.drawImage(canvas, 0, 0);
  return out;
}

export async function blobFromUrl(url: string): Promise<Blob> {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error("Could not fetch that image.");
  return response.blob();
}
