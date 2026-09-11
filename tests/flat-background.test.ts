import { describe, expect, it } from "vitest";
import {
  contentBounds,
  detectFlatBackground,
  judgeCutout,
  planRemoval,
  removeFlatBackground,
} from "@/lib/media/flat-background";

/**
 * Built rather than photographed, so each case isolates one decision. The real
 * photographs that motivated all of this are checked separately, in a browser.
 */

interface Canvas {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
}

function blank(width: number, height: number, rgba: [number, number, number, number]): Canvas {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = rgba[0];
    pixels[i * 4 + 1] = rgba[1];
    pixels[i * 4 + 2] = rgba[2];
    pixels[i * 4 + 3] = rgba[3];
  }
  return { pixels, width, height };
}

function rect(
  canvas: Canvas,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgba: [number, number, number, number],
) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * canvas.width + x) * 4;
      canvas.pixels[i] = rgba[0];
      canvas.pixels[i + 1] = rgba[1];
      canvas.pixels[i + 2] = rgba[2];
      canvas.pixels[i + 3] = rgba[3];
    }
  }
}

/** A red product on a white studio backdrop — the packshot case. */
function packshot(): Canvas {
  const canvas = blank(60, 60, [255, 255, 255, 255]);
  rect(canvas, 18, 18, 41, 41, [200, 40, 40, 255]);
  return canvas;
}

/** Noise to every edge — a scene that fills the frame. */
function fillsFrame(): Canvas {
  const canvas = blank(60, 60, [0, 0, 0, 255]);
  for (let y = 0; y < 60; y++) {
    for (let x = 0; x < 60; x++) {
      const i = (y * 60 + x) * 4;
      canvas.pixels[i] = (x * 37 + y * 11) % 256;
      canvas.pixels[i + 1] = (x * 17 + y * 53) % 256;
      canvas.pixels[i + 2] = (x * 71 + y * 29) % 256;
      canvas.pixels[i + 3] = 255;
    }
  }
  return canvas;
}

function alphaShare(canvas: Canvas, test: (a: number) => boolean): number {
  let n = 0;
  for (let i = 0; i < canvas.width * canvas.height; i++) if (test(canvas.pixels[i * 4 + 3])) n++;
  return n / (canvas.width * canvas.height);
}

describe("contentBounds", () => {
  it("finds the photograph inside its transparent letterbox", () => {
    // A wide photo fitted onto a square canvas leaves transparent bars.
    const canvas = blank(40, 40, [0, 0, 0, 0]);
    rect(canvas, 0, 10, 39, 29, [255, 255, 255, 255]);
    expect(contentBounds(canvas.pixels, 40, 40)).toEqual({ left: 0, top: 10, right: 39, bottom: 29 });
  });

  it("falls back to the whole canvas when everything is transparent", () => {
    const canvas = blank(8, 8, [0, 0, 0, 0]);
    expect(contentBounds(canvas.pixels, 8, 8)).toEqual({ left: 0, top: 0, right: 7, bottom: 7 });
  });
});

describe("detectFlatBackground", () => {
  it("recognises a studio backdrop and names its colour", () => {
    const report = detectFlatBackground(packshot().pixels, 60, 60);
    expect(report.flat).toBe(true);
    expect(report.hex).toBe("#FFFFFF");
    expect(report.agreement).toBe(1);
  });

  it("is not fooled by a product running off one edge", () => {
    const canvas = packshot();
    rect(canvas, 0, 25, 30, 34, [200, 40, 40, 255]); // bleeds off the left
    const report = detectFlatBackground(canvas.pixels, 60, 60);
    expect(report.flat).toBe(true);
    expect(report.hex).toBe("#FFFFFF");
  });

  it("reports no backdrop when the picture is busy to its edges", () => {
    const report = detectFlatBackground(fillsFrame().pixels, 60, 60);
    expect(report.flat).toBe(false);
    expect(report.agreement).toBeLessThan(0.25);
  });

  it("reads the photo's own edge, not the transparent bars around it", () => {
    // Sampling the canvas edge would report the bars — transparent black.
    const canvas = blank(60, 60, [0, 0, 0, 0]);
    rect(canvas, 0, 15, 59, 44, [255, 255, 255, 255]);
    rect(canvas, 20, 22, 39, 37, [30, 120, 60, 255]);
    const report = detectFlatBackground(canvas.pixels, 60, 60);
    expect(report.hex).toBe("#FFFFFF");
    expect(report.flat).toBe(true);
  });
});

describe("removeFlatBackground", () => {
  it("clears the backdrop and keeps the product", () => {
    const canvas = packshot();
    const { pixels, removed } = removeFlatBackground(canvas.pixels, 60, 60, { r: 255, g: 255, b: 255 });
    const result = { pixels, width: 60, height: 60 };

    expect(removed).toBeGreaterThan(0.6);
    expect(pixels[(5 * 60 + 5) * 4 + 3]).toBe(0); // corner: gone
    expect(pixels[(30 * 60 + 30) * 4 + 3]).toBe(255); // middle: kept
    expect(alphaShare(result, (a) => a > 200)).toBeCloseTo((24 * 24) / (60 * 60), 1);
  });

  it("does not modify the pixels it was given", () => {
    const canvas = packshot();
    const before = Uint8ClampedArray.from(canvas.pixels);
    removeFlatBackground(canvas.pixels, 60, 60, { r: 255, g: 255, b: 255 });
    expect(canvas.pixels).toEqual(before);
  });

  it("keeps white that is enclosed by the product", () => {
    // The shine on an apple, or the flesh of a garlic bulb: the same colour as
    // the backdrop, but unreachable from the edge, so a flood must not take it.
    const canvas = packshot();
    rect(canvas, 27, 27, 32, 32, [255, 255, 255, 255]);
    const { pixels } = removeFlatBackground(canvas.pixels, 60, 60, { r: 255, g: 255, b: 255 });
    expect(pixels[(30 * 60 + 30) * 4 + 3]).toBe(255);
  });

  it("leaves a busy picture almost entirely alone", () => {
    const canvas = fillsFrame();
    const { removed } = removeFlatBackground(canvas.pixels, 60, 60, { r: 255, g: 255, b: 255 });
    expect(removed).toBeLessThan(0.05);
  });
});

describe("planRemoval", () => {
  it("floods a plain backdrop rather than running the model at it", () => {
    const plan = planRemoval(packshot().pixels, 60, 60);
    expect(plan.method).toBe("flat");
    expect(plan.background).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("removes nothing from a group photo that fills the frame", () => {
    // The case that started this: there is no background, so a remover asked to
    // find one invents a subject and throws most of the picture away.
    const plan = planRemoval(fillsFrame().pixels, 60, 60, { subject: "group" });
    expect(plan.method).toBe("none");
    expect(plan.reason).toMatch(/edge to edge/);
  });

  it("still trusts the model for a single item on a busy surface", () => {
    // One product on a wooden table has a busy border too, but it genuinely has
    // a background, and the model is good at exactly this.
    const plan = planRemoval(fillsFrame().pixels, 60, 60, { subject: "single" });
    expect(plan.method).toBe("model");
  });
});

describe("judgeCutout", () => {
  it("accepts a clean cutout", () => {
    const canvas = packshot();
    const { pixels } = removeFlatBackground(canvas.pixels, 60, 60, { r: 255, g: 255, b: 255 });
    expect(judgeCutout(pixels, 60, 60).usable).toBe(true);
  });

  it("rejects one that erased nearly everything", () => {
    const canvas = blank(60, 60, [0, 0, 0, 0]);
    rect(canvas, 29, 29, 31, 31, [10, 10, 10, 255]);
    const verdict = judgeCutout(canvas.pixels, 60, 60);
    expect(verdict.usable).toBe(false);
    expect(verdict.reason).toMatch(/nearly the whole picture/);
  });

  it("rejects one that removed nothing at all", () => {
    const verdict = judgeCutout(blank(60, 60, [90, 90, 90, 255]).pixels, 60, 60);
    expect(verdict.usable).toBe(false);
    expect(verdict.reason).toMatch(/did not remove anything/);
  });

  it("rejects a blurred smear rather than a cut", () => {
    // Half the frame cleared, the rest kept but never fully opaque: the mask
    // could not decide anywhere, which is what a failed run actually looks like.
    const canvas = blank(60, 60, [0, 0, 0, 0]);
    rect(canvas, 0, 0, 59, 29, [120, 60, 60, 180]);
    const verdict = judgeCutout(canvas.pixels, 60, 60);
    expect(verdict.kept).toBeCloseTo(0.5, 1);
    expect(verdict.usable).toBe(false);
    expect(verdict.reason).toMatch(/blurred/);
  });

  it("survives an empty image", () => {
    expect(judgeCutout(new Uint8ClampedArray(0), 0, 0).usable).toBe(false);
  });
});
