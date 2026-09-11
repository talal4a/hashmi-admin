import { rgbToHex, type RGB } from "./palette";

/**
 * Colour quantisation and swatch selection (PRD §5.4).
 *
 * This replaces node-vibrant, which needed an image *source* — a URL or an
 * <img> — and therefore had to re-decode the picture and read it back through a
 * canvas it did not control. On a provider image that canvas is tainted, the
 * read throws, and every product silently fell back to the pale-cyan default.
 * That is exactly what "the colour extractor isn't working" looked like.
 *
 * Working on raw RGBA instead removes the problem at the root: the pixels are
 * already in hand, nothing is re-fetched, and there is no origin to taint. It
 * also means alpha is finally respected, so a cutout's transparent surround is
 * ignored and the swatches come from the product itself.
 *
 * Everything here is pure, so the behaviour is verified in unit tests rather
 * than by looking at a card and deciding whether the colour seems about right.
 */

/** 5 bits per channel — 32 768 buckets, the usual accuracy/speed trade. */
const SIGBITS = 5;
const RSHIFT = 8 - SIGBITS;
const HIST_SIZE = 1 << (3 * SIGBITS);
const MAX_DIM = (1 << SIGBITS) - 1;

export interface Swatch {
  hex: string;
  rgb: RGB;
  /** How many sampled pixels fell into this swatch. */
  population: number;
  hsl: HSL;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface ExtractedSwatches {
  dominant: string | null;
  vibrant: string | null;
  muted: string | null;
  light: string | null;
  dark: string | null;
}

export const EMPTY_SWATCHES: ExtractedSwatches = {
  dominant: null,
  vibrant: null,
  muted: null,
  light: null,
  dark: null,
};

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h, s, l };
}

/* ------------------------------------------------------------------ */
/* Median cut                                                          */
/* ------------------------------------------------------------------ */

interface VBox {
  r1: number;
  r2: number;
  g1: number;
  g2: number;
  b1: number;
  b2: number;
  count: number;
}

function histIndex(r: number, g: number, b: number): number {
  return (r << (2 * SIGBITS)) + (g << SIGBITS) + b;
}

function countBox(hist: Int32Array, box: VBox): number {
  let total = 0;
  for (let r = box.r1; r <= box.r2; r++) {
    for (let g = box.g1; g <= box.g2; g++) {
      for (let b = box.b1; b <= box.b2; b++) {
        total += hist[histIndex(r, g, b)];
      }
    }
  }
  return total;
}

/** Population-weighted mean of a box, back in full 8-bit space. */
function averageOf(hist: Int32Array, box: VBox): { rgb: RGB; population: number } | null {
  let total = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  const mid = 1 << (RSHIFT - 1);

  for (let r = box.r1; r <= box.r2; r++) {
    for (let g = box.g1; g <= box.g2; g++) {
      for (let b = box.b1; b <= box.b2; b++) {
        const n = hist[histIndex(r, g, b)];
        if (n === 0) continue;
        total += n;
        rSum += n * ((r << RSHIFT) + mid);
        gSum += n * ((g << RSHIFT) + mid);
        bSum += n * ((b << RSHIFT) + mid);
      }
    }
  }
  if (total === 0) return null;
  return {
    rgb: {
      r: Math.min(255, Math.round(rSum / total)),
      g: Math.min(255, Math.round(gSum / total)),
      b: Math.min(255, Math.round(bSum / total)),
    },
    population: total,
  };
}

/** Splits a box across its longest axis at the population median. */
function splitBox(hist: Int32Array, box: VBox): [VBox, VBox] | null {
  const rw = box.r2 - box.r1;
  const gw = box.g2 - box.g1;
  const bw = box.b2 - box.b1;
  const axis = rw >= gw && rw >= bw ? "r" : gw >= bw ? "g" : "b";

  const from = axis === "r" ? box.r1 : axis === "g" ? box.g1 : box.b1;
  const to = axis === "r" ? box.r2 : axis === "g" ? box.g2 : box.b2;
  if (to <= from) return null;

  // Running total along the chosen axis, so the median is a single scan.
  const partial: number[] = [];
  let running = 0;
  for (let v = from; v <= to; v++) {
    let slice = 0;
    for (let i = axis === "r" ? box.g1 : box.r1; i <= (axis === "r" ? box.g2 : box.r2); i++) {
      for (let j = axis === "b" ? box.g1 : box.b1; j <= (axis === "b" ? box.g2 : box.b2); j++) {
        const index =
          axis === "r" ? histIndex(v, i, j) : axis === "g" ? histIndex(i, v, j) : histIndex(i, j, v);
        slice += hist[index];
      }
    }
    running += slice;
    partial.push(running);
  }
  if (running === 0) return null;

  /*
   * Cut where the two halves come closest to equal, and never where one half
   * would be empty. Taking the first position that reaches the halfway mark
   * instead — the obvious reading of "median" — puts the heaviest bucket on
   * the left, so a two-colour image splits into everything and nothing and the
   * box is never actually divided.
   */
  const half = running / 2;
  let cut = -1;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let i = 0; i < partial.length - 1; i++) {
    const leftCount = partial[i];
    const rightCount = running - leftCount;
    if (leftCount === 0 || rightCount === 0) continue;
    const delta = Math.abs(leftCount - half);
    if (delta < bestDelta) {
      bestDelta = delta;
      cut = from + i;
    }
  }
  if (cut < 0) return null;

  const left: VBox = { ...box, count: 0 };
  const right: VBox = { ...box, count: 0 };
  if (axis === "r") {
    left.r2 = cut;
    right.r1 = cut + 1;
  } else if (axis === "g") {
    left.g2 = cut;
    right.g1 = cut + 1;
  } else {
    left.b2 = cut;
    right.b1 = cut + 1;
  }
  left.count = countBox(hist, left);
  right.count = countBox(hist, right);
  if (left.count === 0 || right.count === 0) return null;
  return [left, right];
}

export interface QuantizeOptions {
  /** How many swatches to aim for. More costs time and rarely helps. */
  colors?: number;
  /** Look at every Nth pixel. 1 reads them all. */
  stride?: number;
  /** Pixels below this alpha are background, not product. */
  alphaThreshold?: number;
}

/**
 * Reduces RGBA pixels to a small set of representative swatches, most populous
 * first. Fully transparent and near-white/near-black pixels are skipped — but
 * only while enough of the image survives, so a white flour bag or a dark
 * chocolate bar still yields its real colour instead of nothing.
 */
export function quantize(pixels: Uint8ClampedArray, options: QuantizeOptions = {}): Swatch[] {
  const colors = Math.max(2, Math.min(32, options.colors ?? 12));
  const stride = Math.max(1, options.stride ?? 1);
  const alphaThreshold = options.alphaThreshold ?? 128;

  const build = (ignoreExtremes: boolean) => {
    const hist = new Int32Array(HIST_SIZE);
    let kept = 0;
    for (let i = 0; i < pixels.length; i += 4 * stride) {
      if (pixels[i + 3] < alphaThreshold) continue;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      if (ignoreExtremes) {
        if (r > 250 && g > 250 && b > 250) continue;
        if (r < 8 && g < 8 && b < 8) continue;
      }
      hist[histIndex(r >> RSHIFT, g >> RSHIFT, b >> RSHIFT)] += 1;
      kept += 1;
    }
    return { hist, kept };
  };

  let { hist, kept } = build(true);
  const opaque = countOpaque(pixels, stride, alphaThreshold);
  // A near-white or near-black product would otherwise vanish entirely.
  if (kept < opaque * 0.05) ({ hist, kept } = build(false));
  if (kept === 0) return [];

  let boxes: VBox[] = [
    { r1: 0, r2: MAX_DIM, g1: 0, g2: MAX_DIM, b1: 0, b2: MAX_DIM, count: kept },
  ];

  // Always split the most populous box; that is what keeps the common colours
  // separated rather than lumping them together.
  while (boxes.length < colors) {
    boxes.sort((a, b) => b.count - a.count);
    const index = boxes.findIndex((box) => box.count > 1);
    if (index === -1) break;
    const parts = splitBox(hist, boxes[index]);
    if (!parts) {
      // Unsplittable: retire it so the loop cannot spin on the same box.
      boxes[index] = { ...boxes[index], count: 1 };
      if (boxes.every((box) => box.count <= 1)) break;
      continue;
    }
    boxes = [...boxes.slice(0, index), ...boxes.slice(index + 1), ...parts];
  }

  const swatches: Swatch[] = [];
  for (const box of boxes) {
    const average = averageOf(hist, box);
    if (!average) continue;
    swatches.push({
      hex: rgbToHex(average.rgb),
      rgb: average.rgb,
      population: average.population,
      hsl: rgbToHsl(average.rgb),
    });
  }
  return swatches.sort((a, b) => b.population - a.population);
}

function countOpaque(pixels: Uint8ClampedArray, stride: number, alphaThreshold: number): number {
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4 * stride) {
    if (pixels[i + 3] >= alphaThreshold) count += 1;
  }
  return count;
}

/* ------------------------------------------------------------------ */
/* Swatch selection                                                    */
/* ------------------------------------------------------------------ */

interface Target {
  saturation: number;
  lightness: number;
  minLightness: number;
  maxLightness: number;
  minSaturation: number;
}

/**
 * The targets are the ones the Android Palette library settled on, and they
 * hold up: a "vibrant" colour is a mid-lightness saturated one, a "muted" one
 * is the same lightness with the saturation taken out.
 */
const TARGETS = {
  vibrant: { saturation: 1, lightness: 0.5, minLightness: 0.3, maxLightness: 0.7, minSaturation: 0.35 },
  light: { saturation: 1, lightness: 0.74, minLightness: 0.55, maxLightness: 1, minSaturation: 0.2 },
  dark: { saturation: 1, lightness: 0.26, minLightness: 0, maxLightness: 0.45, minSaturation: 0.2 },
  muted: { saturation: 0.3, lightness: 0.5, minLightness: 0.3, maxLightness: 0.7, minSaturation: 0 },
} satisfies Record<string, Target>;

/** Weights: hitting the lightness target matters most, popularity least. */
const WEIGHT_SATURATION = 3;
const WEIGHT_LIGHTNESS = 6.5;
const WEIGHT_POPULATION = 0.5;

function invertDiff(value: number, target: number): number {
  return 1 - Math.abs(value - target);
}

function scoreSwatch(swatch: Swatch, target: Target, maxPopulation: number): number {
  const { s, l } = swatch.hsl;
  if (s < target.minSaturation) return -1;
  if (l < target.minLightness || l > target.maxLightness) return -1;
  const population = maxPopulation > 0 ? swatch.population / maxPopulation : 0;
  return (
    invertDiff(s, target.saturation) * WEIGHT_SATURATION +
    invertDiff(l, target.lightness) * WEIGHT_LIGHTNESS +
    population * WEIGHT_POPULATION
  );
}

function pick(swatches: Swatch[], target: Target, used: Set<string>): Swatch | null {
  const maxPopulation = swatches.reduce((max, s) => Math.max(max, s.population), 0);
  let best: Swatch | null = null;
  let bestScore = 0;
  for (const swatch of swatches) {
    if (used.has(swatch.hex)) continue;
    const score = scoreSwatch(swatch, target, maxPopulation);
    if (score > bestScore) {
      best = swatch;
      bestScore = score;
    }
  }
  if (best) used.add(best.hex);
  return best;
}

/** Turns a swatch list into the five named colours the product card uses. */
export function selectSwatches(swatches: Swatch[]): ExtractedSwatches {
  if (swatches.length === 0) return EMPTY_SWATCHES;

  const used = new Set<string>();
  const vibrant = pick(swatches, TARGETS.vibrant, used);
  const light = pick(swatches, TARGETS.light, used);
  const dark = pick(swatches, TARGETS.dark, used);
  const muted = pick(swatches, TARGETS.muted, used);

  // Dominant is simply the colour most of the product actually is.
  const dominant = swatches.reduce((best, s) => (s.population > best.population ? s : best));

  return {
    dominant: dominant.hex,
    // A photo can be entirely muted; falling back keeps a usable card colour
    // rather than handing the caller a null it has to paper over.
    vibrant: vibrant?.hex ?? light?.hex ?? dominant.hex,
    muted: muted?.hex ?? dominant.hex,
    light: light?.hex ?? null,
    dark: dark?.hex ?? null,
  };
}

/** Quantise and select in one call — what the pipeline actually uses. */
export function swatchesFromPixels(
  pixels: Uint8ClampedArray,
  options: QuantizeOptions = {},
): ExtractedSwatches {
  return selectSwatches(quantize(pixels, options));
}
