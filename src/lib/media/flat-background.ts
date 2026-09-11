import { rgbToHex, type RGB } from "./palette";

/**
 * Removing a plain studio background without a model (PRD §5.3).
 *
 * The cutout model is a *salient object* detector: it finds the one thing a
 * photo is about. An assortment photo is about a dozen things, so it picks a
 * favourite and ghosts the rest — measured on three real fruit-basket photos it
 * kept 22-32% of the picture, sliced a flat line where the pile met the table,
 * and left haze behind. The larger IS-Net model is worse, not better: it kept
 * 4% of a bowl of berries, reduced to one blueberry and one blackberry.
 *
 * But those photos have something the model ignores — a plain white backdrop.
 * Filling inwards from the edges removes exactly that and nothing else: no
 * favourite, no ghosting, no straight cut through a pear, and no 170 MB
 * download. It is the right tool whenever the background is actually flat, and
 * `detectFlatBackground` is what decides whether it is.
 *
 * Pure functions over pixel data, so this is tested in Node against real
 * photographs rather than judged by eye.
 */

export interface FlatBackgroundReport {
  /** True when the border is one consistent colour, within tolerance. */
  flat: boolean;
  /** The border colour, whether or not it was judged flat. */
  color: RGB;
  hex: string;
  /** Share of border pixels matching that colour, 0..1. */
  agreement: number;
}

/** Chebyshev distance — cheap, and closer to how an eye reads "same colour". */
function distance(a: RGB, b: RGB): number {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}

function pixelAt(pixels: Uint8ClampedArray, index: number): RGB {
  return { r: pixels[index * 4], g: pixels[index * 4 + 1], b: pixels[index * 4 + 2] };
}

export interface ContentBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The part of the canvas the photograph actually occupies.
 *
 * A photo is fitted onto a square canvas, so a wide one arrives with
 * transparent bars above and below it. Sampling the canvas edge would read
 * those bars — transparent black — and conclude the backdrop is black. The
 * backdrop to look for is at the edge of the picture, not the edge of the
 * canvas.
 */
export function contentBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): ContentBounds {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] <= 8) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < 0) return { left: 0, top: 0, right: width - 1, bottom: height - 1 };
  return { left, top, right, bottom };
}

/** Every pixel on the outer ring of the photograph. */
function borderIndices(width: number, bounds: ContentBounds): number[] {
  const indices: number[] = [];
  const { left, top, right, bottom } = bounds;
  for (let x = left; x <= right; x++) {
    indices.push(top * width + x);
    indices.push(bottom * width + x);
  }
  for (let y = top + 1; y < bottom; y++) {
    indices.push(y * width + left);
    indices.push(y * width + right);
  }
  return indices;
}

/**
 * Is this photo shot on a plain backdrop?
 *
 * The median border colour is the candidate, and the answer is how much of the
 * border agrees with it. A product bleeding off one edge still leaves most of
 * the border agreeing, which is why this is a proportion and not an all-or-
 * nothing check.
 */
export function detectFlatBackground(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance = 26,
): FlatBackgroundReport {
  const indices = borderIndices(width, contentBounds(pixels, width, height));
  if (indices.length === 0) {
    const black = { r: 0, g: 0, b: 0 };
    return { flat: false, color: black, hex: rgbToHex(black), agreement: 0 };
  }

  // Median per channel: robust to a product touching one edge, unlike a mean.
  const channel = (offset: number) => {
    const values = indices.map((i) => pixels[i * 4 + offset]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };
  const color: RGB = { r: channel(0), g: channel(1), b: channel(2) };

  let agreeing = 0;
  for (const index of indices) {
    if (distance(pixelAt(pixels, index), color) <= tolerance) agreeing += 1;
  }
  const agreement = agreeing / indices.length;

  return { flat: agreement >= 0.82, color, hex: rgbToHex(color), agreement: Number(agreement.toFixed(3)) };
}

export interface FlatRemovalResult {
  /** RGBA with the background cleared. The input is not modified. */
  pixels: Uint8ClampedArray;
  /** Share of the image that was cleared, 0..1. */
  removed: number;
}

/**
 * Clears the background by flooding inwards from the edges.
 *
 * Flooding rather than "erase every pixel of this colour" is what protects the
 * white of a garlic bulb or the shine on an apple: those are enclosed by the
 * product, so the flood never reaches them.
 *
 * Edge pixels are half-matches — the photo's own anti-aliasing — so they are
 * faded by how close they are to the backdrop instead of being cut hard. That
 * is what keeps the outline from looking sawn.
 */
export function removeFlatBackground(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  background: RGB,
  options: { tolerance?: number; softness?: number } = {},
): FlatRemovalResult {
  const tolerance = options.tolerance ?? 26;
  const softness = options.softness ?? 18;
  const out = new Uint8ClampedArray(pixels);

  const total = width * height;
  const visited = new Uint8Array(total);
  // A plain array used as a stack: the flood is breadth-agnostic, so order
  // does not matter and this avoids the cost of a queue.
  const stack: number[] = [];

  // Anything already transparent — the bars beside a fitted photo — is
  // background by definition and must not be flooded through as if it were.
  for (let i = 0; i < total; i++) {
    if (pixels[i * 4 + 3] <= 8) visited[i] = 1;
  }

  for (const index of borderIndices(width, contentBounds(pixels, width, height))) {
    if (visited[index]) continue;
    if (distance(pixelAt(pixels, index), background) > tolerance + softness) continue;
    visited[index] = 1;
    stack.push(index);
  }

  let cleared = 0;
  while (stack.length > 0) {
    const index = stack.pop()!;
    const delta = distance(pixelAt(pixels, index), background);

    // Inside tolerance is background; the band above it is the photo's own
    // anti-aliased edge, faded rather than cut.
    const alpha =
      delta <= tolerance ? 0 : Math.min(255, Math.round(((delta - tolerance) / softness) * 255));
    out[index * 4 + 3] = alpha;
    if (alpha < 128) cleared += 1;

    // A partially opaque pixel is the edge of the product: stop there.
    if (alpha > 200) continue;

    const x = index % width;
    const y = (index / width) | 0;
    if (x > 0 && !visited[index - 1]) { visited[index - 1] = 1; stack.push(index - 1); }
    if (x < width - 1 && !visited[index + 1]) { visited[index + 1] = 1; stack.push(index + 1); }
    if (y > 0 && !visited[index - width]) { visited[index - width] = 1; stack.push(index - width); }
    if (y < height - 1 && !visited[index + width]) { visited[index + width] = 1; stack.push(index + width); }
  }

  return { pixels: out, removed: total === 0 ? 0 : cleared / total };
}

export type RemovalMethod = "flat" | "model" | "none";

export interface RemovalPlan {
  method: RemovalMethod;
  /** The backdrop to flood away. Only set for the "flat" method. */
  background: RGB | null;
  /** Plain-language explanation, shown when nothing is removed. */
  reason: string;
  backdrop: FlatBackgroundReport;
}

/**
 * Decides how — or whether — to take the background out of a picture.
 *
 * The mistake worth avoiding is assuming there is always a background. A
 * basket of fruit shot close, a bowl of berries filling the frame, a spice
 * market from above: these are subject from edge to edge. There is nothing to
 * remove, so a remover asked to try will invent a subject, keep a quarter of
 * the picture and slice a flat line through a pear. That is not a model to be
 * fixed by a bigger model — IS-Net does it worse — it is a question that should
 * not have been asked.
 *
 * The border ring answers it. A packshot on a studio backdrop has a border that
 * agrees with itself almost perfectly; a scene that fills the frame has a border
 * as busy as its middle. Measured: 99% agreement on a white packshot, 1-18% on
 * the three assortment photos above.
 */
export function planRemoval(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  options: { subject?: "single" | "group" } = {},
): RemovalPlan {
  const backdrop = detectFlatBackground(pixels, width, height);

  if (backdrop.flat) {
    return {
      method: "flat",
      background: backdrop.color,
      reason: `Shot on a plain ${backdrop.hex} backdrop, so it was cleared exactly.`,
      backdrop,
    };
  }

  /*
   * Busy right to the edge. For a group photo that settles it — the picture is
   * all subject. For a single item it is more likely a product on a patterned
   * surface, which the model does handle, so that still goes to the model.
   */
  if (backdrop.agreement < 0.25 && options.subject === "group") {
    return {
      method: "none",
      background: null,
      reason: "The picture is filled edge to edge, so there is no background to remove.",
      backdrop,
    };
  }

  return { method: "model", background: null, reason: "", backdrop };
}

export interface CutoutQuality {
  /** Share of the image still opaque, 0..1. */
  kept: number;
  /** Share of the kept pixels that are half-transparent mush, 0..1. */
  ragged: number;
  /** False when the result is worse than simply keeping the photo. */
  usable: boolean;
  reason: string | null;
}

/**
 * Judges a cutout instead of trusting it.
 *
 * The model never reports failure — it always returns *a* mask, and on a photo
 * it cannot read that mask is a smear or a fragment. Measured on real
 * assortment photos, a good cutout keeps roughly a fifth to a half of the frame
 * with clean edges; the failures kept 4-11% and were mostly half-transparent.
 * Rather than let those reach a product card, they are rejected and the
 * original photo is used, which always looks deliberate.
 */
export function judgeCutout(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): CutoutQuality {
  const total = width * height;
  if (total === 0) return { kept: 0, ragged: 0, usable: false, reason: "The image is empty." };

  let opaque = 0;
  let partial = 0;
  for (let i = 0; i < total; i++) {
    const alpha = pixels[i * 4 + 3];
    if (alpha > 128) opaque += 1;
    if (alpha > 20 && alpha < 235) partial += 1;
  }

  const kept = opaque / total;
  const ragged = opaque === 0 ? 1 : partial / opaque;

  if (kept < 0.06) {
    return { kept, ragged, usable: false, reason: "it removed nearly the whole picture" };
  }
  if (kept > 0.97) {
    return { kept, ragged, usable: false, reason: "it did not remove anything" };
  }
  if (ragged > 0.6) {
    return { kept, ragged, usable: false, reason: "the edges came out blurred rather than cut" };
  }
  return { kept, ragged, usable: true, reason: null };
}
