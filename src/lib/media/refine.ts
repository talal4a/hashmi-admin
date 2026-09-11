import type { RGB } from "./palette";

/**
 * Turning a coarse mask into a clean cutout (PRD §5.3).
 *
 * The segmentation model is not the weak link people assume. u2netp runs at
 * 320x320 internally, whatever size the picture is, and that small mask is then
 * stretched over a 1000px image — so every edge arrives soft, every edge keeps a
 * rim of the old background, and half the "kept" pixels come back
 * half-transparent. Measured on real photographs, 22-50% of a cutout's pixels
 * were neither in nor out.
 *
 * A larger model does not fix that: IS-Net is the same 320-to-1000 stretch with
 * a heavier backbone, took 18-20s instead of 4s here, and cut worse. BiRefNet,
 * the usual next suggestion, is a 224 MB download at the same input size, so
 * slower still. What fixes it is cheap post-processing: take the haze out of the
 * matte, drop the confetti, and take the old backdrop out of the edge colours.
 *
 * Everything here is a pure function over pixel arrays: no canvas, no DOM, and
 * so tested in Node rather than judged by eye.
 */

export interface RefineReport {
  /** Alpha values that were neither in nor out, before and after, 0..1. */
  raggedBefore: number;
  raggedAfter: number;
  /** Specks discarded, and their combined size in pixels. */
  specksRemoved: number;
  /** Enclosed background regions reopened — the gap in a handle, say. */
  holesOpened: number;
  /** Edge pixels whose colour was corrected away from the old background. */
  decontaminated: number;
  /** What the backdrop was judged to be, and whether that judgement was firm. */
  background: BackgroundEstimate;
}

/* ------------------------------------------------------------------ */
/* Layer 2 — alpha matte refinement                                    */
/* ------------------------------------------------------------------ */

/**
 * Pushes the nearly-in and nearly-out the rest of the way.
 *
 * An upscaled mask carries a wash of 0.05s and 0.95s right across the picture —
 * the haze that makes a cutout look like a smear rather than a cut. Only the
 * genuine transition band, between the two thresholds, keeps a soft value.
 *
 * The defaults were chosen by looking, because the obvious measure is a trap: a
 * symmetric stretch never moves a pixel across 0.5, so "fewer half-transparent
 * pixels" falls to zero at a hard threshold and rewards exactly the aliased,
 * stair-stepped edge it should avoid. At 0.3/0.7 the white fringe is gone and
 * the edge is still smooth; tighter than that and diagonals start to step.
 *
 * A guided filter was written for this step first — fitting alpha against the
 * full-resolution image, which should in principle put a soft edge back where
 * the photograph says it belongs. Measured against this stretch alone on four
 * real cutouts it was worse every time, at every radius and epsilon tried
 * (+5% at radius 1 rising to +80% at radius 8), so it is not here.
 */
export function stretchAlpha(alpha: Float32Array, low = 0.3, high = 0.7): Float32Array {
  const out = new Float32Array(alpha.length);
  const span = Math.max(1e-6, high - low);
  for (let i = 0; i < alpha.length; i++) {
    out[i] = Math.min(1, Math.max(0, (alpha[i] - low) / span));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Layer 3 — edge cleanup                                              */
/* ------------------------------------------------------------------ */

export interface SpeckleResult {
  alpha: Float32Array;
  removed: number;
}

/**
 * Discards fragments too small to be part of the product.
 *
 * A mask usually comes with confetti: a few dozen stray pixels where the model
 * half-saw something. They are invisible at full size and obvious once the
 * cutout is trimmed to its contents, because a single stray pixel in a corner
 * drags the crop out to meet it.
 */
export function despeckle(
  alpha: Float32Array,
  width: number,
  height: number,
  minShare = 0.0015,
): SpeckleResult {
  const total = width * height;
  const minSize = Math.max(8, Math.floor(total * minShare));
  const out = new Float32Array(alpha.length);
  out.set(alpha);
  const seen = new Uint8Array(total);
  const stack: number[] = [];
  let removed = 0;

  for (let start = 0; start < total; start++) {
    if (seen[start] || alpha[start] <= 0.5) continue;

    const blob: number[] = [];
    seen[start] = 1;
    stack.push(start);
    while (stack.length > 0) {
      const index = stack.pop()!;
      blob.push(index);
      const x = index % width;
      const y = (index / width) | 0;
      if (x > 0 && !seen[index - 1] && alpha[index - 1] > 0.5) { seen[index - 1] = 1; stack.push(index - 1); }
      if (x < width - 1 && !seen[index + 1] && alpha[index + 1] > 0.5) { seen[index + 1] = 1; stack.push(index + 1); }
      if (y > 0 && !seen[index - width] && alpha[index - width] > 0.5) { seen[index - width] = 1; stack.push(index - width); }
      if (y < height - 1 && !seen[index + width] && alpha[index + width] > 0.5) { seen[index + width] = 1; stack.push(index + width); }
    }

    if (blob.length < minSize) {
      for (const index of blob) out[index] = 0;
      removed += 1;
    }
  }

  return { alpha: out, removed };
}

/* ------------------------------------------------------------------ */
/* Layer 4 — background colour decontamination                         */
/* ------------------------------------------------------------------ */

/**
 * Takes the old background back out of the edge pixels.
 *
 * A half-transparent pixel is a mixture: what the camera recorded there is part
 * product and part backdrop. Composited onto a new card it carries that backdrop
 * with it, which is the pale rim you see around a cutout lifted off white.
 * Since the mixture is known — C = aF + (1-a)B — the product's own colour can
 * simply be solved for.
 */
export function decontaminate(
  pixels: Uint8ClampedArray,
  original: Uint8ClampedArray,
  alpha: Float32Array,
  background: RGB,
  options: { low?: number; high?: number } = {},
): number {
  // Below the floor there is too little product in the mixture to recover: the
  // division amplifies whatever noise is there into a bright speck.
  const low = options.low ?? 0.25;
  const high = options.high ?? 0.96;
  const channels: [number, number, number] = [background.r, background.g, background.b];
  let corrected = 0;

  for (let i = 0; i < alpha.length; i++) {
    const a = alpha[i];
    if (a <= low || a >= high) continue;
    for (let c = 0; c < 3; c++) {
      // Read from the original: the cutout's own colours may already have been
      // zeroed or premultiplied by whatever produced the mask.
      const mixed = original[i * 4 + c];
      const solved = (mixed - (1 - a) * channels[c]) / a;
      pixels[i * 4 + c] = Math.min(255, Math.max(0, Math.round(solved)));
    }
    corrected += 1;
  }
  return corrected;
}

export interface BackgroundEstimate {
  color: RGB;
  /** Mean absolute spread of the discarded pixels around that colour. */
  spread: number;
  /**
   * True when the discarded region really was one colour. Decontamination
   * divides by alpha, so a wrong background does not fade an edge — it blows it
   * out into a coloured rim. It is only worth doing when this is true.
   */
  confident: boolean;
}

/**
 * The colour the product was shot against, taken from the ORIGINAL photograph
 * at the pixels the mask discarded.
 *
 * It has to be the original. A cutout has had the colour of its removed pixels
 * zeroed, so estimating from it returns near-black — and "remove black from the
 * edges" brightens every one of them into a halo. That is not hypothetical:
 * measured on a finished cutout, the discarded pixels averaged RGB(8, 9, 1),
 * and the correction drew a yellow-green rim around a tomato.
 */
export function estimateBackground(
  original: Uint8ClampedArray,
  alpha: Float32Array,
  fallback: RGB = { r: 255, g: 255, b: 255 },
): BackgroundEstimate {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < alpha.length; i++) {
    if (alpha[i] > 0.02) continue;
    r += original[i * 4];
    g += original[i * 4 + 1];
    b += original[i * 4 + 2];
    n += 1;
  }
  if (n < 64) return { color: fallback, spread: 255, confident: false };

  const color: RGB = { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };

  let spread = 0;
  for (let i = 0; i < alpha.length; i++) {
    if (alpha[i] > 0.02) continue;
    spread +=
      Math.abs(original[i * 4] - color.r) +
      Math.abs(original[i * 4 + 1] - color.g) +
      Math.abs(original[i * 4 + 2] - color.b);
  }
  spread = spread / (n * 3);

  // A seamless backdrop sits well under 20; a photographed scene is far above.
  return { color, spread: Number(spread.toFixed(1)), confident: spread < 22 };
}

/* ------------------------------------------------------------------ */
/* Layer 5 — enclosed holes                                            */
/* ------------------------------------------------------------------ */

export interface HoleResult {
  alpha: Float32Array;
  opened: number;
}

/**
 * Reopens background the mask sealed in.
 *
 * The gap inside a jug handle, the space between two bottles, the window in a
 * carton: the model routinely fills these, because from its point of view they
 * are inside the object. They are found by colour — a region still opaque, all
 * of one colour, and that colour the backdrop's — and only regions large enough
 * and uniform enough to be certain are opened, so a white label on a white jar
 * is left alone.
 */
export function openEnclosedHoles(
  pixels: Uint8ClampedArray,
  alpha: Float32Array,
  width: number,
  height: number,
  background: RGB,
  options: { tolerance?: number; minShare?: number } = {},
): HoleResult {
  const tolerance = options.tolerance ?? 30;
  const total = width * height;
  const minSize = Math.max(24, Math.floor(total * (options.minShare ?? 0.0008)));
  const out = new Float32Array(alpha.length);
  out.set(alpha);
  const seen = new Uint8Array(total);
  const stack: number[] = [];
  let opened = 0;

  const matches = (index: number) =>
    Math.max(
      Math.abs(pixels[index * 4] - background.r),
      Math.abs(pixels[index * 4 + 1] - background.g),
      Math.abs(pixels[index * 4 + 2] - background.b),
    ) <= tolerance;

  for (let start = 0; start < total; start++) {
    if (seen[start] || alpha[start] <= 0.5 || !matches(start)) continue;

    const blob: number[] = [];
    let touchesEdge = false;
    seen[start] = 1;
    stack.push(start);

    while (stack.length > 0) {
      const index = stack.pop()!;
      blob.push(index);
      const x = index % width;
      const y = (index / width) | 0;
      // Reaching the frame means it is not enclosed, so it is not a hole.
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;

      const push = (next: number) => {
        if (seen[next] || alpha[next] <= 0.5 || !matches(next)) return;
        seen[next] = 1;
        stack.push(next);
      };
      if (x > 0) push(index - 1);
      if (x < width - 1) push(index + 1);
      if (y > 0) push(index - width);
      if (y < height - 1) push(index + width);
    }

    if (!touchesEdge && blob.length >= minSize) {
      for (const index of blob) out[index] = 0;
      opened += 1;
    }
  }

  return { alpha: out, opened };
}

/* ------------------------------------------------------------------ */
/* The whole refinement                                                */
/* ------------------------------------------------------------------ */

export interface RefineOptions {
  /** Known backdrop colour. Estimated from the discarded pixels when absent. */
  background?: RGB;
  /** Skip hole detection where a light label on a light product could be eaten. */
  openHoles?: boolean;
}

export interface RefineResult {
  /** RGBA, refined in place on a copy of the input. */
  pixels: Uint8ClampedArray;
  report: RefineReport;
}

function raggedShare(alpha: Float32Array): number {
  let opaque = 0;
  let partial = 0;
  for (let i = 0; i < alpha.length; i++) {
    if (alpha[i] > 0.5) opaque += 1;
    if (alpha[i] > 0.08 && alpha[i] < 0.92) partial += 1;
  }
  return opaque === 0 ? 0 : partial / opaque;
}

/**
 * Layers 2 to 5, in the only order that works.
 *
 * Refine before stretching, or the stretch hardens an edge that is still in the
 * wrong place. Stretch before decontaminating, or the correction is applied to
 * pixels that were about to become fully opaque anyway. Decontaminate before
 * the holes, because hole detection matches colours and wants the corrected
 * ones. Each step is cheap; the order is what makes them add up.
 */
export function refineCutout(
  input: Uint8ClampedArray,
  /**
   * The untouched photograph, same dimensions. Required: the cutout has had the
   * colour of its removed pixels zeroed, so it cannot say what the backdrop was
   * and it cannot say what an edge pixel is a mixture of.
   */
  original: Uint8ClampedArray,
  width: number,
  height: number,
  options: RefineOptions = {},
): RefineResult {
  const total = width * height;
  const pixels = new Uint8ClampedArray(input);

  // Annotated rather than inferred: each layer hands back a fresh array, and
  // the inferred type from the initialiser is narrower than what they return.
  let alpha: Float32Array = new Float32Array(total);
  for (let i = 0; i < total; i++) alpha[i] = pixels[i * 4 + 3] / 255;
  const raggedBefore = raggedShare(alpha);

  const estimate = estimateBackground(original, alpha);
  const background = options.background ?? estimate.color;
  // A known backdrop is trusted; an estimated one only when it was really one
  // colour. Guessing wrong here draws a rim rather than removing one.
  const mayDecontaminate = options.background !== undefined || estimate.confident;

  /* Layer 2 — take the haze out of the matte. */
  alpha = stretchAlpha(alpha);

  /* Layer 3 — drop the confetti. */
  const despeckled = despeckle(alpha, width, height);
  alpha = despeckled.alpha;

  /* Layer 4 — take the old backdrop out of the edge colours. */
  const decontaminated = mayDecontaminate
    ? decontaminate(pixels, original, alpha, background)
    : 0;

  /* Layer 5 — reopen anything the mask sealed in. */
  let holesOpened = 0;
  if (options.openHoles !== false && mayDecontaminate) {
    const holes = openEnclosedHoles(original, alpha, width, height, background);
    alpha = holes.alpha;
    holesOpened = holes.opened;
  }

  for (let i = 0; i < total; i++) pixels[i * 4 + 3] = Math.round(alpha[i] * 255);

  return {
    pixels,
    report: {
      raggedBefore: Number(raggedBefore.toFixed(4)),
      raggedAfter: Number(raggedShare(alpha).toFixed(4)),
      specksRemoved: despeckled.removed,
      holesOpened,
      decontaminated,
      background: estimate,
    },
  };
}
