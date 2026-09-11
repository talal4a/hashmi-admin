import { describe, expect, it } from "vitest";
import {
  decontaminate,
  despeckle,
  estimateBackground,
  openEnclosedHoles,
  refineCutout,
  stretchAlpha,
} from "@/lib/media/refine";

/**
 * Each layer is checked on a picture built to isolate it. The point of these is
 * not that the numbers are pretty — it is that a layer which quietly makes
 * things worse gets caught, which is exactly what happened to decontamination
 * the first time it was written.
 */

const W = 64;
const H = 64;
const TOTAL = W * H;

interface Scene {
  /** The photograph, RGBA, fully opaque. */
  original: Uint8ClampedArray;
  /** The same picture with a mask applied. */
  cutout: Uint8ClampedArray;
}

/** A red square on a white backdrop, with the mask deliberately blurred. */
function packshot(options: { blur?: number; backdrop?: [number, number, number] } = {}): Scene {
  const blur = options.blur ?? 4;
  const backdrop = options.backdrop ?? [255, 255, 255];
  const original = new Uint8ClampedArray(TOTAL * 4);
  const cutout = new Uint8ClampedArray(TOTAL * 4);

  const inside = (x: number, y: number) => x >= 20 && x <= 43 && y >= 20 && y <= 43;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const product = inside(x, y);
      const rgb = product ? [200, 40, 40] : backdrop;
      for (let c = 0; c < 3; c++) {
        original[i + c] = rgb[c];
        cutout[i + c] = product ? rgb[c] : 0; // removal zeroes what it discards
      }
      original[i + 3] = 255;

      // A soft, low-resolution mask: alpha ramps across `blur` pixels.
      const dx = Math.max(20 - x, x - 43, 0);
      const dy = Math.max(20 - y, y - 43, 0);
      const distance = Math.max(dx, dy);
      cutout[i + 3] = Math.round(255 * Math.min(1, Math.max(0, 1 - distance / blur)));
    }
  }
  return { original, cutout };
}

function alphaOf(pixels: Uint8ClampedArray): Float32Array {
  const alpha = new Float32Array(TOTAL);
  for (let i = 0; i < TOTAL; i++) alpha[i] = pixels[i * 4 + 3] / 255;
  return alpha;
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

describe("stretchAlpha", () => {
  it("pushes the nearly-out to out and the nearly-in to in", () => {
    const alpha = Float32Array.from([0.02, 0.1, 0.5, 0.9, 0.99]);
    const out = stretchAlpha(alpha);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
    expect(out[2]).toBeCloseTo(0.5, 5);
    expect(out[4]).toBe(1);
  });

  it("takes the haze out of an upscaled mask", () => {
    const scene = packshot({ blur: 6 });
    const alpha = alphaOf(scene.cutout);
    expect(raggedShare(stretchAlpha(alpha))).toBeLessThan(raggedShare(alpha));
  });

  it("keeps a genuine soft edge soft", () => {
    // Not a hard threshold: a pixel truly half in and half out must stay that
    // way, or every diagonal turns into a staircase.
    const out = stretchAlpha(Float32Array.from([0.45, 0.5, 0.55]));
    for (const value of out) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("despeckle", () => {
  it("drops a stray fragment and keeps the product", () => {
    const alpha = new Float32Array(TOTAL);
    for (let y = 20; y <= 43; y++) for (let x = 20; x <= 43; x++) alpha[y * W + x] = 1;
    alpha[2 * W + 2] = 1; // one stray pixel in a corner
    alpha[2 * W + 3] = 1;

    const { alpha: cleaned, removed } = despeckle(alpha, W, H);
    expect(removed).toBe(1);
    expect(cleaned[2 * W + 2]).toBe(0);
    expect(cleaned[32 * W + 32]).toBe(1);
  });

  it("keeps everything when there is nothing small", () => {
    const alpha = new Float32Array(TOTAL).fill(1);
    expect(despeckle(alpha, W, H).removed).toBe(0);
  });
});

describe("estimateBackground", () => {
  it("reads the backdrop from the original, not the cutout", () => {
    const scene = packshot();
    const alpha = alphaOf(scene.cutout);

    const fromOriginal = estimateBackground(scene.original, alpha);
    expect(fromOriginal.color).toEqual({ r: 255, g: 255, b: 255 });
    expect(fromOriginal.confident).toBe(true);

    // The mistake worth guarding: a cutout has its removed colours zeroed, so
    // estimating from it returns black and "remove black" brightens every edge.
    const fromCutout = estimateBackground(scene.cutout, alpha);
    expect(fromCutout.color.r).toBeLessThan(40);
  });

  it("refuses to be confident about a photographed scene", () => {
    const scene = packshot();
    const alpha = alphaOf(scene.cutout);
    // Scatter the backdrop, as a real scene would be.
    for (let i = 0; i < TOTAL; i++) {
      if (alpha[i] > 0.02) continue;
      scene.original[i * 4] = (i * 37) % 256;
      scene.original[i * 4 + 1] = (i * 91) % 256;
      scene.original[i * 4 + 2] = (i * 53) % 256;
    }
    expect(estimateBackground(scene.original, alpha).confident).toBe(false);
  });
});

describe("decontaminate", () => {
  it("recovers the product's colour from a half-transparent edge pixel", () => {
    // A pixel that is half product (200,40,40) and half white backdrop.
    const pixels = new Uint8ClampedArray(4);
    const original = Uint8ClampedArray.from([228, 148, 148, 255]);
    const alpha = Float32Array.from([0.5]);

    decontaminate(pixels, original, alpha, { r: 255, g: 255, b: 255 });
    expect(pixels[0]).toBeGreaterThan(190);
    expect(pixels[1]).toBeLessThan(60);
  });

  it("leaves solid and empty pixels alone", () => {
    const pixels = new Uint8ClampedArray(8);
    const original = Uint8ClampedArray.from([10, 20, 30, 255, 40, 50, 60, 255]);
    const alpha = Float32Array.from([1, 0]);
    expect(decontaminate(pixels, original, alpha, { r: 255, g: 255, b: 255 })).toBe(0);
    expect(Array.from(pixels)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("does not touch barely-there pixels, where the maths amplifies noise", () => {
    const pixels = new Uint8ClampedArray(4);
    const original = Uint8ClampedArray.from([250, 250, 250, 255]);
    expect(decontaminate(pixels, original, Float32Array.from([0.08]), { r: 255, g: 255, b: 255 })).toBe(0);
  });
});

describe("openEnclosedHoles", () => {
  it("reopens a backdrop-coloured gap sealed inside the product", () => {
    // A ring: product all round, backdrop showing through the middle.
    const pixels = new Uint8ClampedArray(TOTAL * 4);
    const alpha = new Float32Array(TOTAL);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const inRing = x >= 16 && x <= 47 && y >= 16 && y <= 47;
        const inHole = x >= 26 && x <= 37 && y >= 26 && y <= 37;
        const rgb = inRing && !inHole ? [200, 40, 40] : [255, 255, 255];
        for (let c = 0; c < 3; c++) pixels[i * 4 + c] = rgb[c];
        alpha[i] = inRing ? 1 : 0; // the mask filled the hole in
      }
    }

    const { alpha: opened, opened: count } = openEnclosedHoles(pixels, alpha, W, H, {
      r: 255, g: 255, b: 255,
    });
    expect(count).toBe(1);
    expect(opened[32 * W + 32]).toBe(0); // the gap is now see-through
    expect(opened[18 * W + 18]).toBe(1); // the product is untouched
  });

  it("leaves a light label alone, because it reaches no edge but is too small", () => {
    const pixels = new Uint8ClampedArray(TOTAL * 4);
    const alpha = new Float32Array(TOTAL);
    for (let y = 20; y <= 43; y++) {
      for (let x = 20; x <= 43; x++) {
        const i = y * W + x;
        const label = x >= 30 && x <= 32 && y >= 30 && y <= 32;
        const rgb = label ? [255, 255, 255] : [200, 40, 40];
        for (let c = 0; c < 3; c++) pixels[i * 4 + c] = rgb[c];
        alpha[i] = 1;
      }
    }
    expect(openEnclosedHoles(pixels, alpha, W, H, { r: 255, g: 255, b: 255 }).opened).toBe(0);
  });
});

describe("refineCutout", () => {
  it("tightens a blurred mask and reports what it did", () => {
    const scene = packshot({ blur: 6 });
    const { pixels, report } = refineCutout(scene.cutout, scene.original, W, H);

    expect(report.raggedAfter).toBeLessThan(report.raggedBefore);
    expect(report.background.color).toEqual({ r: 255, g: 255, b: 255 });
    expect(report.background.confident).toBe(true);
    expect(pixels[(32 * W + 32) * 4 + 3]).toBeGreaterThan(230);
    expect(pixels[(2 * W + 2) * 4 + 3]).toBeLessThan(25);
  });

  it("does not decontaminate when the backdrop was never one colour", () => {
    // Getting this wrong draws a coloured rim instead of removing one.
    const scene = packshot();
    const alpha = alphaOf(scene.cutout);
    for (let i = 0; i < TOTAL; i++) {
      if (alpha[i] > 0.02) continue;
      scene.original[i * 4] = (i * 37) % 256;
      scene.original[i * 4 + 1] = (i * 91) % 256;
      scene.original[i * 4 + 2] = (i * 53) % 256;
    }
    expect(refineCutout(scene.cutout, scene.original, W, H).report.decontaminated).toBe(0);
  });

  it("does not modify the arrays it was given", () => {
    const scene = packshot();
    const cutBefore = Uint8ClampedArray.from(scene.cutout);
    const origBefore = Uint8ClampedArray.from(scene.original);
    refineCutout(scene.cutout, scene.original, W, H);
    expect(scene.cutout).toEqual(cutBefore);
    expect(scene.original).toEqual(origBefore);
  });
});
