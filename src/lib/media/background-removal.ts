"use client";

/**
 * Browser-side background removal (PRD §5.3).
 *
 * Uses @bunnio/rembg-web over onnxruntime-web with a U2Net-family model, so the
 * work happens in the admin's browser and costs nothing per image. WebGPU is
 * used when the browser exposes it, with the WASM/CPU path as the fallback.
 *
 * Nothing here is loaded until the admin actually asks for a cutout, keeping the
 * model out of the initial dashboard bundle (PRD §13.3). Failure is always
 * recoverable: the original image is untouched and the caller can retry with a
 * different model or skip removal entirely (PRD §16.1).
 */

export type RembgModel = "u2netp" | "u2net" | "silueta" | "isnet-general-use";

export interface RembgModelOption {
  id: RembgModel;
  label: string;
  note: string;
}

/**
 * Pin the exact model artifacts you serve, and review each model's licence
 * independently of the wrapper library before production (PRD §5.3, §20).
 */
export const REMBG_MODELS: RembgModelOption[] = [
  { id: "u2netp", label: "U2Net-P (fast)", note: "Smallest download, best first choice for packshots." },
  { id: "u2net", label: "U2Net (accurate)", note: "Slower, cleaner edges on complex products." },
  { id: "silueta", label: "Silueta", note: "Small U2Net variant; good on simple silhouettes." },
  { id: "isnet-general-use", label: "IS-Net general", note: "Highest quality, slowest and largest." },
];

export const DEFAULT_REMBG_MODEL: RembgModel = "u2netp";

/** Version pinned with the model artifacts, recorded in the product document. */
export const REMBG_MODEL_VERSION = "u2net-family@2024.1";

export interface RemovalProgress {
  step: "downloading" | "processing" | "postprocessing" | "complete";
  progress: number;
  message: string;
}

export class BackgroundRemovalUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackgroundRemovalUnavailableError";
  }
}

/**
 * Where the .onnx artifacts are served from. Defaults to `/models` on this
 * origin — drop the pinned artifacts into `public/models/` — and can be pointed
 * at a CDN with NEXT_PUBLIC_REMBG_MODEL_BASE_URL. The value is a public asset
 * location, never a secret.
 */
export function modelBaseUrl(): string {
  return process.env.NEXT_PUBLIC_REMBG_MODEL_BASE_URL || "/models";
}

let configured = false;

async function loadRembg() {
  const rembg = await import("@bunnio/rembg-web");
  if (!configured) {
    try {
      rembg.rembgConfig.setBaseUrl(modelBaseUrl());
      const config = rembg.rembgConfig as unknown as {
        enableWebGPU?: (on: boolean) => void;
        enableWebNN?: (on: boolean) => void;
      };
      if (typeof navigator !== "undefined" && "gpu" in navigator) {
        config.enableWebGPU?.(true);
      } else if (typeof navigator !== "undefined" && "ml" in navigator) {
        config.enableWebNN?.(true);
      }
    } catch {
      // Older builds may not expose every setter; defaults still work.
    }
    configured = true;
  }
  return rembg;
}

/** True when a pinned model artifact is actually reachable. */
export async function isModelAvailable(model: RembgModel): Promise<boolean> {
  try {
    const response = await fetch(`${modelBaseUrl()}/${model}.onnx`, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

export interface RemovalResult {
  blob: Blob;
  objectUrl: string;
  model: RembgModel;
  modelVersion: string;
  durationMs: number;
}

export async function removeBackground(
  input: Blob,
  options: {
    model?: RembgModel;
    onProgress?: (progress: RemovalProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<RemovalResult> {
  const model = options.model ?? DEFAULT_REMBG_MODEL;
  const started = performance.now();

  const available = await isModelAvailable(model);
  if (!available) {
    throw new BackgroundRemovalUnavailableError(
      `The ${model} model isn't being served from ${modelBaseUrl()}. Add the pinned .onnx artifact there (or set NEXT_PUBLIC_REMBG_MODEL_BASE_URL) to enable background removal. The original image is unchanged.`,
    );
  }

  const rembg = await loadRembg();
  options.onProgress?.({ step: "downloading", progress: 2, message: "Loading model…" });

  const session = await rembg.newSession(model);

  const blob = await rembg.remove(input, {
    session,
    postProcessMask: true,
    onProgress: (info) => {
      if (options.signal?.aborted) return;
      options.onProgress?.({
        step: info.step,
        progress: Math.max(0, Math.min(100, info.progress)),
        message: info.message,
      });
    },
  });

  if (options.signal?.aborted) throw new DOMException("Cancelled", "AbortError");

  options.onProgress?.({ step: "complete", progress: 100, message: "Cutout ready" });

  return {
    blob,
    objectUrl: URL.createObjectURL(blob),
    model,
    modelVersion: REMBG_MODEL_VERSION,
    durationMs: Math.round(performance.now() - started),
  };
}

/** Frees any cached model/session memory once the studio closes. */
export async function disposeRembg(): Promise<void> {
  try {
    const rembg = await import("@bunnio/rembg-web");
    await rembg.disposeAllSessions?.();
  } catch {
    // Nothing loaded — nothing to dispose.
  }
}
