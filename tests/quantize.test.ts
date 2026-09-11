import { describe, expect, it } from "vitest";
import {
  EMPTY_SWATCHES,
  quantize,
  rgbToHsl,
  selectSwatches,
  swatchesFromPixels,
} from "@/lib/media/quantize";
import { hexToRgb } from "@/lib/media/palette";

/**
 * The colour extractor used to be unverifiable: it needed a browser, a network
 * and an untainted canvas, so "is it working?" could only be answered by
 * looking at a card. Working on raw pixels makes it a pure function, and these
 * tests pin the behaviour that actually matters — that the colour a product is
 * mostly made of is the colour that comes back.
 */

/** Builds RGBA pixel data from a list of [count, r, g, b, a?] runs. */
function pixels(runs: [number, number, number, number, number?][]): Uint8ClampedArray {
  const total = runs.reduce((sum, [count]) => sum + count, 0);
  const data = new Uint8ClampedArray(total * 4);
  let i = 0;
  for (const [count, r, g, b, a = 255] of runs) {
    for (let n = 0; n < count; n++) {
      data[i++] = r;
      data[i++] = g;
      data[i++] = b;
      data[i++] = a;
    }
  }
  return data;
}

/** Channel-wise distance, so "close enough" is stated rather than eyeballed. */
function distance(hex: string, rgb: [number, number, number]): number {
  const parsed = hexToRgb(hex);
  if (!parsed) return Number.POSITIVE_INFINITY;
  return Math.max(
    Math.abs(parsed.r - rgb[0]),
    Math.abs(parsed.g - rgb[1]),
    Math.abs(parsed.b - rgb[2]),
  );
}

describe("rgbToHsl", () => {
  it("reports greys as having no saturation", () => {
    expect(rgbToHsl({ r: 128, g: 128, b: 128 })).toEqual({ h: 0, s: 0, l: 128 / 255 });
  });

  it("places the primaries on the right hue thirds", () => {
    expect(rgbToHsl({ r: 255, g: 0, b: 0 }).h).toBeCloseTo(0, 5);
    expect(rgbToHsl({ r: 0, g: 255, b: 0 }).h).toBeCloseTo(1 / 3, 5);
    expect(rgbToHsl({ r: 0, g: 0, b: 255 }).h).toBeCloseTo(2 / 3, 5);
  });

  it("gives full saturation and mid lightness to a pure hue", () => {
    const hsl = rgbToHsl({ r: 255, g: 0, b: 0 });
    expect(hsl.s).toBe(1);
    expect(hsl.l).toBe(0.5);
  });
});

describe("quantize", () => {
  it("returns nothing for an entirely transparent image", () => {
    expect(quantize(pixels([[500, 200, 30, 40, 0]]))).toEqual([]);
  });

  it("finds a single colour and counts every pixel of it", () => {
    const swatches = quantize(pixels([[400, 200, 40, 40]]), { colors: 8 });
    expect(swatches).toHaveLength(1);
    expect(distance(swatches[0].hex, [200, 40, 40])).toBeLessThanOrEqual(4);
    expect(swatches[0].population).toBe(400);
  });

  it("orders swatches by how much of the image they cover", () => {
    const swatches = quantize(
      pixels([
        [600, 30, 120, 220], // blue, most common
        [200, 220, 60, 60], // red
        [80, 40, 190, 90], // green
      ]),
      { colors: 8 },
    );

    expect(swatches.length).toBeGreaterThanOrEqual(3);
    expect(distance(swatches[0].hex, [30, 120, 220])).toBeLessThanOrEqual(6);
    expect(swatches[0].population).toBeGreaterThan(swatches[1].population);
    expect(swatches[1].population).toBeGreaterThan(swatches[2].population);
  });

  it("ignores transparent pixels, so a cutout describes the product only", () => {
    // A red product on what used to be a large green background, now cut away.
    const swatches = quantize(
      pixels([
        [900, 20, 200, 20, 0], // removed background
        [100, 210, 50, 50], // the product
      ]),
      { colors: 8 },
    );

    expect(swatches).toHaveLength(1);
    expect(distance(swatches[0].hex, [210, 50, 50])).toBeLessThanOrEqual(6);
  });

  it("skips a white surround but not a white product", () => {
    const onWhite = quantize(
      pixels([
        [800, 255, 255, 255], // white studio backdrop
        [200, 40, 90, 200], // blue product
      ]),
      { colors: 8 },
    );
    expect(distance(onWhite[0].hex, [40, 90, 200])).toBeLessThanOrEqual(6);

    // A bag of flour is almost entirely white; discarding it would leave nothing.
    const allWhite = quantize(pixels([[900, 252, 252, 250]]), { colors: 8 });
    expect(allWhite.length).toBeGreaterThan(0);
    expect(distance(allWhite[0].hex, [252, 252, 250])).toBeLessThanOrEqual(6);
  });

  it("honours the sampling stride without changing the answer", () => {
    const data = pixels([
      [1000, 30, 120, 220],
      [200, 220, 60, 60],
    ]);
    const full = quantize(data, { colors: 6 });
    const sampled = quantize(data, { colors: 6, stride: 4 });
    expect(distance(sampled[0].hex, [30, 120, 220])).toBeLessThanOrEqual(6);
    expect(sampled[0].hex).toBe(full[0].hex);
  });

  it("terminates on an image with fewer colours than requested", () => {
    const swatches = quantize(pixels([[50, 10, 10, 10]]), { colors: 32 });
    expect(swatches.length).toBeGreaterThan(0);
    expect(swatches.length).toBeLessThanOrEqual(32);
  });
});

describe("selectSwatches", () => {
  it("returns empty swatches when there is nothing to choose from", () => {
    expect(selectSwatches([])).toEqual(EMPTY_SWATCHES);
  });

  it("names the most common colour as dominant", () => {
    const result = swatchesFromPixels(
      pixels([
        [700, 230, 80, 40], // orange, most of the image
        [120, 40, 60, 160], // a blue label
      ]),
    );
    expect(distance(result.dominant!, [230, 80, 40])).toBeLessThanOrEqual(8);
  });

  it("prefers a saturated mid-tone for vibrant over a washed-out one", () => {
    const result = swatchesFromPixels(
      pixels([
        [600, 190, 185, 180], // large dull grey area
        [150, 220, 30, 30], // small saturated red
      ]),
    );
    expect(distance(result.vibrant!, [220, 30, 30])).toBeLessThanOrEqual(10);
  });

  it("separates light and dark tones of the same product", () => {
    const result = swatchesFromPixels(
      pixels([
        [300, 250, 190, 190], // light pink
        [300, 90, 20, 20], // dark red
        [300, 220, 60, 60], // mid red
      ]),
    );
    expect(result.light).not.toBeNull();
    expect(result.dark).not.toBeNull();
    expect(rgbToHsl(hexToRgb(result.light!)!).l).toBeGreaterThan(
      rgbToHsl(hexToRgb(result.dark!)!).l,
    );
  });

  it("still yields a usable vibrant colour on a fully muted image", () => {
    // Nothing here clears the vibrant saturation floor; a null would force the
    // caller to invent a colour, so the dominant one carries the card instead.
    const result = swatchesFromPixels(pixels([[500, 150, 148, 145]]));
    expect(result.vibrant).not.toBeNull();
    expect(result.muted).not.toBeNull();
  });
});
