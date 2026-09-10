"use client";

import type { MediaPalette } from "@/types";
import { FALLBACK_PALETTE, buildPalette } from "./palette";

/**
 * Palette extraction with node-vibrant (PRD §5.4).
 *
 * Runs against the cutout where one exists — so the swatches come from the
 * product itself and not from whatever background the source photo had. The
 * worker pipeline is preferred so a large image does not block the editor; the
 * main-thread pipeline is the fallback.
 *
 * Extraction failure is never fatal: the caller receives the HashmiMart pale
 * cyan default, as PRD §16.1 requires.
 */

export interface ExtractedSwatches {
  dominant: string | null;
  vibrant: string | null;
  muted: string | null;
  light: string | null;
  dark: string | null;
}

let workerPipelineReady: boolean | null = null;

async function configureWorkerPipeline(Vibrant: typeof import("node-vibrant/browser").Vibrant): Promise<void> {
  if (workerPipelineReady !== null) return;
  try {
    const core = await import("@vibrant/core");
    const worker = await import("node-vibrant/worker");
    // The worker export shape differs between builds; only wire it if present.
    const pipeline = (worker as unknown as { WorkerPipeline?: unknown }).WorkerPipeline;
    if (pipeline && typeof core.Vibrant?.use === "function") {
      // `Vibrant.use` is a static registration method, not a React hook.
      const register = Vibrant.use.bind(Vibrant) as (p: unknown) => void;
      register(pipeline);
      workerPipelineReady = true;
      return;
    }
  } catch {
    // Fall through to the main-thread pipeline.
  }
  workerPipelineReady = false;
}

export async function extractSwatches(source: string | HTMLImageElement): Promise<ExtractedSwatches> {
  try {
    const { Vibrant } = await import("node-vibrant/browser");
    await configureWorkerPipeline(Vibrant);

    const palette = await Vibrant.from(source as never)
      .quality(3)
      .maxColorCount(96)
      .getPalette();

    const hex = (name: string): string | null => {
      const swatch = palette[name];
      return swatch ? swatch.hex.toUpperCase() : null;
    };

    return {
      // "Dominant" is the most populated swatch across the returned set.
      dominant: mostPopulated(palette),
      vibrant: hex("Vibrant") ?? hex("LightVibrant"),
      muted: hex("Muted") ?? hex("LightMuted"),
      light: hex("LightVibrant") ?? hex("LightMuted"),
      dark: hex("DarkVibrant") ?? hex("DarkMuted"),
    };
  } catch (error) {
    console.warn(
      "[hashmimart-admin] palette extraction failed:",
      error instanceof Error ? error.message : error,
    );
    return { dominant: null, vibrant: null, muted: null, light: null, dark: null };
  }
}

function mostPopulated(palette: Record<string, { hex: string; population: number } | null>): string | null {
  let best: { hex: string; population: number } | null = null;
  for (const swatch of Object.values(palette)) {
    if (!swatch) continue;
    if (!best || swatch.population > best.population) best = swatch;
  }
  return best ? best.hex.toUpperCase() : null;
}

/** Convenience wrapper returning a persistable palette, never throwing. */
export async function extractPalette(
  source: string | HTMLImageElement,
  chosenBackground?: string | null,
): Promise<MediaPalette> {
  const swatches = await extractSwatches(source);
  if (!swatches.dominant && !swatches.vibrant) {
    return chosenBackground ? buildPalette({}, chosenBackground) : FALLBACK_PALETTE;
  }
  return buildPalette(swatches, chosenBackground);
}
