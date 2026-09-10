import { describe, expect, it } from "vitest";
import {
  HM_DEEP_NAVY,
  HM_DEFAULT_CARD_BG,
  HM_WHITE,
  buildPalette,
  contrastRatio,
  foregroundFor,
  generateCardBackgrounds,
  hexToRgb,
  isValidHex,
  mixToWhite,
  rgbToHex,
  softenForCard,
} from "@/lib/media/palette";

describe("hex conversion", () => {
  it("parses three- and six-digit hex", () => {
    expect(hexToRgb("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb("06B6D4")).toEqual({ r: 6, g: 182, b: 212 });
  });

  it("rejects invalid input", () => {
    expect(hexToRgb("not-a-colour")).toBeNull();
    expect(isValidHex("#12345")).toBe(false);
    expect(isValidHex("#06B6D4")).toBe(true);
  });

  it("round-trips through rgb", () => {
    expect(rgbToHex({ r: 6, g: 182, b: 212 })).toBe("#06B6D4");
  });
});

describe("contrast", () => {
  it("gives the known black-on-white ratio", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 1);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#06B6D4", "#0F172A")).toBeCloseTo(
      contrastRatio("#0F172A", "#06B6D4"),
      5,
    );
  });

  it("picks deep navy on a light background and white on a dark one", () => {
    expect(foregroundFor("#ECFEFF")).toBe(HM_DEEP_NAVY);
    expect(foregroundFor("#0B1327")).toBe(HM_WHITE);
  });
});

describe("softenForCard", () => {
  const rawColours = [
    "#FF0000", "#00FF00", "#0000FF", "#000000", "#7C3AED",
    "#F59E0B", "#0F172A", "#06B6D4", "#8B4513", "#FF1493",
  ];

  it("always clears the AA body-text bar against its own foreground", () => {
    for (const colour of rawColours) {
      const soft = softenForCard(colour);
      const ratio = contrastRatio(soft, foregroundFor(soft));
      expect(ratio, `${colour} -> ${soft}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("never returns the raw saturated colour", () => {
    expect(softenForCard("#FF0000")).not.toBe("#FF0000");
  });

  it("falls back to the HashmiMart default for invalid input", () => {
    expect(softenForCard("nonsense")).toBe(HM_DEFAULT_CARD_BG);
  });
});

describe("mixToWhite", () => {
  it("returns white at full strength and the original at zero", () => {
    expect(mixToWhite("#06B6D4", 1)).toBe("#FFFFFF");
    expect(mixToWhite("#06B6D4", 0)).toBe("#06B6D4");
  });

  it("clamps out-of-range amounts", () => {
    expect(mixToWhite("#06B6D4", 5)).toBe("#FFFFFF");
    expect(mixToWhite("#06B6D4", -3)).toBe("#06B6D4");
  });
});

describe("generateCardBackgrounds", () => {
  it("always offers three readable candidates", () => {
    const candidates = generateCardBackgrounds({ dominant: "#B91C1C", vibrant: "#EF4444" });
    expect(candidates).toHaveLength(3);
    for (const candidate of candidates) {
      expect(candidate.contrast).toBeGreaterThanOrEqual(4.5);
      expect(isValidHex(candidate.hex)).toBe(true);
    }
  });

  it("still returns the brand fallback when extraction produced nothing", () => {
    const candidates = generateCardBackgrounds({});
    expect(candidates.every((c) => c.hex === HM_DEFAULT_CARD_BG)).toBe(true);
  });
});

describe("buildPalette", () => {
  it("recomputes the text colour from the chosen background", () => {
    const palette = buildPalette({ dominant: "#06B6D4" }, "#0B1327");
    expect(palette.cardBg).toBe("#0B1327");
    expect(palette.textColor).toBe(HM_WHITE);
  });

  it("ignores an invalid override and uses the first candidate", () => {
    const palette = buildPalette({ dominant: "#06B6D4" }, "not-a-colour");
    expect(isValidHex(palette.cardBg)).toBe(true);
    expect(contrastRatio(palette.cardBg, palette.textColor)).toBeGreaterThanOrEqual(4.5);
  });
});
