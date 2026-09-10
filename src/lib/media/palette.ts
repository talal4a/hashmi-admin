import type { MediaPalette } from "@/types";

/**
 * Colour maths for the media studio (PRD §5.4 / §24).
 *
 * The rule the PRD sets: never place a harsh raw dominant colour behind the
 * product. Every candidate background is mixed toward white until it is light
 * enough to stay readable, and the foreground colour is then chosen by contrast
 * rather than assumed.
 */

export const HM_DEEP_NAVY = "#0F172A";
export const HM_WHITE = "#FFFFFF";
/** Fallback when extraction fails — PRD §16.1 requires a pale-cyan default. */
export const HM_DEFAULT_CARD_BG = "#ECFEFF";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): RGB | null {
  const m = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const to = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

export function isValidHex(hex: string): boolean {
  return hexToRgb(hex) !== null;
}

/** Relative luminance, WCAG 2.1 definition. */
export function relativeLuminance(rgb: RGB): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function contrastRatio(a: string, b: string): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return 1;
  const la = relativeLuminance(ra);
  const lb = relativeLuminance(rb);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Mix `hex` toward white. amount 0 = unchanged, 1 = pure white. */
export function mixToWhite(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return HM_DEFAULT_CARD_BG;
  const t = Math.min(1, Math.max(0, amount));
  return rgbToHex({
    r: rgb.r + (255 - rgb.r) * t,
    g: rgb.g + (255 - rgb.g) * t,
    b: rgb.b + (255 - rgb.b) * t,
  });
}

export function mixToBlack(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return HM_DEEP_NAVY;
  const t = Math.min(1, Math.max(0, amount));
  return rgbToHex({ r: rgb.r * (1 - t), g: rgb.g * (1 - t), b: rgb.b * (1 - t) });
}

/**
 * Pick deep navy or white for text on the given background, whichever has the
 * stronger contrast. PRD §5.4 requires this to be computed, not assumed.
 */
export function foregroundFor(background: string): string {
  return contrastRatio(background, HM_DEEP_NAVY) >= contrastRatio(background, HM_WHITE)
    ? HM_DEEP_NAVY
    : HM_WHITE;
}

/**
 * Soften a raw swatch into a card background that always clears the AA body-text
 * bar (4.5:1) against its own chosen foreground.
 */
export function softenForCard(hex: string, strength = 0.82): string {
  if (!isValidHex(hex)) return HM_DEFAULT_CARD_BG;
  let amount = strength;
  for (let i = 0; i < 12; i++) {
    const candidate = mixToWhite(hex, amount);
    if (contrastRatio(candidate, foregroundFor(candidate)) >= 4.5) return candidate;
    amount = Math.min(0.97, amount + 0.03);
  }
  return HM_DEFAULT_CARD_BG;
}

export interface CardBackgroundCandidate {
  id: string;
  label: string;
  hex: string;
  textColor: string;
  contrast: number;
  sourceSwatch: string;
}

/**
 * Three candidates as PRD §5.4 requires: a soft tint of the dominant colour, a
 * brighter tint of the vibrant colour, and a neutral HashmiMart pale cyan that
 * is always safe.
 */
export function generateCardBackgrounds(swatches: Partial<MediaPalette>): CardBackgroundCandidate[] {
  const dominant = swatches.dominant && isValidHex(swatches.dominant) ? swatches.dominant : null;
  const vibrant = swatches.vibrant && isValidHex(swatches.vibrant) ? swatches.vibrant : dominant;
  const light = swatches.light && isValidHex(swatches.light) ? swatches.light : vibrant;

  const build = (id: string, label: string, source: string | null, strength: number): CardBackgroundCandidate => {
    const src = source ?? HM_DEFAULT_CARD_BG;
    const hex = source ? softenForCard(src, strength) : HM_DEFAULT_CARD_BG;
    const textColor = foregroundFor(hex);
    return { id, label, hex, textColor, contrast: Number(contrastRatio(hex, textColor).toFixed(2)), sourceSwatch: src };
  };

  return [
    build("soft", "Soft tint", dominant, 0.86),
    build("bright", "Bright tint", vibrant, 0.74),
    build("brand", "HashmiMart pale cyan", null, 0),
  ];
}

/** Assemble the palette persisted to Firestore so the app never recomputes it. */
export function buildPalette(
  swatches: Partial<MediaPalette>,
  chosenBackground?: string | null,
): MediaPalette {
  const cardBg =
    chosenBackground && isValidHex(chosenBackground)
      ? chosenBackground.toUpperCase()
      : generateCardBackgrounds(swatches)[0].hex;
  return {
    dominant: swatches.dominant ?? null,
    vibrant: swatches.vibrant ?? null,
    muted: swatches.muted ?? null,
    light: swatches.light ?? null,
    dark: swatches.dark ?? null,
    cardBg,
    textColor: foregroundFor(cardBg),
  };
}

export const FALLBACK_PALETTE: MediaPalette = {
  dominant: null,
  vibrant: null,
  muted: null,
  light: null,
  dark: null,
  cardBg: HM_DEFAULT_CARD_BG,
  textColor: HM_DEEP_NAVY,
};
