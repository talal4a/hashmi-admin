"use client";

import {
  DEFAULT_REMBG_MODEL,
  MODEL_LIST,
  MODEL_SPECS,
  REMBG_MODEL_VERSION,
  type ModelSpec,
  type RembgModel,
} from "./model-catalog";

export { DEFAULT_REMBG_MODEL, MODEL_LIST, MODEL_SPECS, REMBG_MODEL_VERSION };
export type { ModelSpec, RembgModel };

/**
 * Browser-side background removal (PRD §5.3).
 *
 * `@bunnio/rembg-web` runs a U2Net-family model over onnxruntime-web, so the
 * work happens in the admin's browser and costs nothing per image. WebGPU is
 * used where the browser exposes it, WASM otherwise.
 *
 * Both the weights and the WASM runtime are served from this origin — see
 * `/api/media/model/[file]` — rather than from a public CDN. The earlier build
 * pointed at `/models`, which nothing ever populated, so every single call fell
 * straight through to the "model isn't being served" error and no product ever
 * got a cutout. Serving them ourselves also keeps the feature working on
 * networks that block third-party CDNs.
 *
 * Nothing here is loaded until a cutout is actually requested, keeping the model
 * runtime out of the dashboard bundle (PRD §13.3). Failure stays recoverable:
 * the original image is untouched and the caller can retry or skip (PRD §16.1).
 */

export interface RemovalProgress {
  step: "downloading" | "processing" | "postprocessing" | "complete";
  /** 0-100. Comes from the inference callback, never from a timer. */
  progress: number;
  message: string;
}

export class BackgroundRemovalUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackgroundRemovalUnavailableError";
  }
}

/** Where the pinned `.onnx` artifacts are served from. */
export function modelBaseUrl(): string {
  return process.env.NEXT_PUBLIC_REMBG_MODEL_BASE_URL || "/api/media/model";
}

/** Where onnxruntime-web's `.wasm`/`.mjs` files are served from. */
function ortBaseUrl(): string {
  return process.env.NEXT_PUBLIC_ORT_BASE_URL || "/ort/";
}

let configured = false;

async function loadRembg() {
  const rembg = await import("@bunnio/rembg-web");

  if (!configured) {
    // Pin the runtime to this origin before any session is created; ORT reads
    // this once and then caches its own loader.
    try {
      const ort = await import("onnxruntime-web");
      ort.env.wasm.wasmPaths = ortBaseUrl();
      // Multi-threaded WASM needs SharedArrayBuffer, which needs the page to be
      // cross-origin isolated. It is not, so asking for threads here would only
      // make the runtime probe and fall back. More threads than cores would
      // also just add contention on a laptop.
      const isolated = typeof window !== "undefined" && window.crossOriginIsolated === true;
      const cores = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency ?? 4) : 4;
      ort.env.wasm.numThreads = isolated ? Math.max(1, Math.min(4, cores - 1)) : 1;
    } catch {
      // If ORT cannot be configured it still falls back to its own defaults.
    }

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
      // Older builds may not expose every setter; the defaults still work.
    }
    configured = true;
  }

  return rembg;
}

export interface ModelAvailability {
  /** The route answered, so a cutout can be attempted. */
  reachable: boolean;
  /** The weights are already on the server's disk — no download wait. */
  ready: boolean;
  reason: string | null;
}

/**
 * Asks the server whether a model can be served, without moving the bytes.
 * A HEAD here is cheap; it is what tells the admin "first run will download
 * 4.4 MB" instead of leaving them watching a silent spinner.
 */
export async function checkModel(model: RembgModel): Promise<ModelAvailability> {
  const spec = MODEL_SPECS[model];
  try {
    const response = await fetch(`${modelBaseUrl()}/${spec.file}`, { method: "HEAD" });
    if (response.status === 401) {
      return { reachable: false, ready: false, reason: "Your session expired — sign in again." };
    }
    if (response.status === 403) {
      return { reachable: false, ready: false, reason: "Your role cannot process media." };
    }
    if (!response.ok) {
      return {
        reachable: false,
        ready: false,
        reason: `The server could not offer ${spec.file} (HTTP ${response.status}).`,
      };
    }
    return { reachable: true, ready: response.headers.get("X-Model-Ready") === "1", reason: null };
  } catch {
    return { reachable: false, ready: false, reason: "The server could not be reached." };
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
  const spec = MODEL_SPECS[model];
  const started = performance.now();

  const availability = await checkModel(model);
  if (!availability.reachable) {
    throw new BackgroundRemovalUnavailableError(
      `${availability.reason ?? "The model could not be reached."} Your image is unchanged — you can save it without a cutout.`,
    );
  }

  options.onProgress?.({
    step: "downloading",
    progress: 2,
    message: availability.ready
      ? "Loading the cutout model…"
      : `Fetching the cutout model once (${Math.round(spec.bytes / 1024 / 1024)} MB)…`,
  });

  const rembg = await loadRembg();
  const session = await rembg.newSession(model);
  if (options.signal?.aborted) throw new DOMException("Cancelled", "AbortError");

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

/** Frees cached model/session memory once the studio closes. */
export async function disposeRembg(): Promise<void> {
  try {
    const rembg = await import("@bunnio/rembg-web");
    await rembg.disposeAllSessions?.();
  } catch {
    // Nothing loaded — nothing to dispose.
  }
}
