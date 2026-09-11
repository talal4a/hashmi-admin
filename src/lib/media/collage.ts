"use client";

/**
 * Arranging several product cutouts into one category picture (PRD §6).
 *
 * A stock assortment photo is somebody else's produce. The category tiles in
 * the app want a pile of *this* shop's goods, and every product that has been
 * through the media studio already has a background-free cutout — so the tile
 * can simply be built from them.
 *
 * The layouts below are hand-placed rather than computed. A generated packing
 * looks packed; these are arranged the way a person would set fruit down on a
 * table: the largest piece sitting behind, the smaller ones overlapping it in
 * front, everything leaning a little off-square. Coordinates are normalised, so
 * the same arrangement holds at any canvas size, and the tables are plain data,
 * which makes them testable.
 */

export interface CollageSlot {
  /** Centre of the item, 0..1 across the canvas. */
  x: number;
  y: number;
  /** Longest edge of the item, as a fraction of the canvas. */
  size: number;
  /** Degrees. Small angles only — produce leans, it does not tumble. */
  rotation: number;
}

/**
 * Drawn in array order, so earlier entries sit behind later ones. Back items
 * are larger and higher; front items smaller and lower, which is what gives the
 * pile its depth.
 */
const LAYOUTS: Record<number, CollageSlot[]> = {
  1: [{ x: 0.5, y: 0.5, size: 0.86, rotation: 0 }],
  2: [
    { x: 0.37, y: 0.46, size: 0.62, rotation: -6 },
    { x: 0.65, y: 0.57, size: 0.56, rotation: 7 },
  ],
  3: [
    { x: 0.5, y: 0.38, size: 0.58, rotation: 0 },
    { x: 0.31, y: 0.63, size: 0.48, rotation: -9 },
    { x: 0.69, y: 0.63, size: 0.48, rotation: 9 },
  ],
  4: [
    { x: 0.36, y: 0.35, size: 0.5, rotation: -7 },
    { x: 0.66, y: 0.33, size: 0.46, rotation: 6 },
    { x: 0.28, y: 0.66, size: 0.44, rotation: -4 },
    { x: 0.62, y: 0.68, size: 0.48, rotation: 8 },
  ],
  5: [
    { x: 0.5, y: 0.34, size: 0.46, rotation: 0 },
    { x: 0.24, y: 0.45, size: 0.4, rotation: -10 },
    { x: 0.76, y: 0.45, size: 0.4, rotation: 10 },
    { x: 0.36, y: 0.71, size: 0.42, rotation: -5 },
    { x: 0.65, y: 0.72, size: 0.42, rotation: 6 },
  ],
  6: [
    { x: 0.27, y: 0.32, size: 0.4, rotation: -8 },
    { x: 0.52, y: 0.27, size: 0.42, rotation: 2 },
    { x: 0.76, y: 0.34, size: 0.4, rotation: 9 },
    { x: 0.22, y: 0.66, size: 0.38, rotation: -5 },
    { x: 0.5, y: 0.73, size: 0.42, rotation: 0 },
    { x: 0.77, y: 0.66, size: 0.38, rotation: 7 },
  ],
};

export const MAX_COLLAGE_ITEMS = 6;

/**
 * The arrangement for a given number of items. Counts above six fall back to
 * the six-item pile — beyond that nothing is recognisable at tile size anyway.
 */
export function collageLayout(count: number): CollageSlot[] {
  const clamped = Math.max(1, Math.min(MAX_COLLAGE_ITEMS, Math.floor(count)));
  return LAYOUTS[clamped] ?? LAYOUTS[MAX_COLLAGE_ITEMS];
}

/**
 * Draws the images into one square, transparent canvas.
 *
 * Each image keeps its aspect ratio and is fitted inside its slot, so a tall
 * bottle and a wide melon both sit correctly rather than being squashed to the
 * same box.
 */
export function composeCollage(images: HTMLImageElement[], size = 1000): HTMLCanvasElement {
  const usable = images.slice(0, MAX_COLLAGE_ITEMS);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  if (usable.length === 0) return canvas;

  ctx.imageSmoothingQuality = "high";
  const slots = collageLayout(usable.length);

  usable.forEach((image, index) => {
    const slot = slots[index];
    const naturalW = image.naturalWidth || image.width;
    const naturalH = image.naturalHeight || image.height;
    if (naturalW === 0 || naturalH === 0) return;

    const box = slot.size * size;
    const scale = Math.min(box / naturalW, box / naturalH);
    const drawW = naturalW * scale;
    const drawH = naturalH * scale;

    ctx.save();
    ctx.translate(slot.x * size, slot.y * size);
    ctx.rotate((slot.rotation * Math.PI) / 180);
    // A soft drop shadow is what stops a flat cutout looking pasted on.
    ctx.shadowColor = "rgba(15, 23, 42, 0.18)";
    ctx.shadowBlur = size * 0.018;
    ctx.shadowOffsetY = size * 0.008;
    ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  });

  return canvas;
}

/**
 * A product whose picture can go into a category tile.
 *
 * Deliberately not the whole `Product`: the editor only needs enough to show a
 * thumbnail and fetch the pixels, and sending thirty full product documents to
 * the browser to build one picture would be wasteful.
 */
export interface CategoryArtSource {
  id: string;
  name: string;
  categoryId: string;
  /** The cutout when there is one, otherwise the original photo. */
  imageUrl: string;
  /** False means the background is still in the picture and must be removed. */
  hasCutout: boolean;
}
