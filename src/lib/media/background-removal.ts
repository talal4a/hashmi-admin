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

/**
 * Execution providers for inference, most preferred first. WASM only, and
 * deliberately so.
 *
 * Every model in the catalogue is U2Net-family, and every RSU block in that
 * family pools with `ceil_mode` enabled — `u2netp.onnx` alone carries 33 such
 * layers. onnxruntime-web's WebGPU MaxPool kernel computes the `ceil_mode`
 * output shape but does not implement the padding that shape implies, and says
 * so by throwing:
 *
 *   ceil_mode output-shape is computed, but ceil_mode kernel execution
 *   (padding) is not yet implemented in the WebGPU MaxPool kernel
 *
 * So enabling WebGPU does not trade quality for speed here — it removes
 * background removal entirely on every machine that has a GPU, which is most of
 * them, while leaving it working on machines that do not. That asymmetry is why
 * this went unnoticed: the earlier code enabled WebGPU whenever `navigator.gpu`
 * existed, and the browsers it was exercised in did not expose it.
 *
 * Revisit when onnxruntime-web implements `ceil_mode` padding on WebGPU; until
 * then WASM runs u2netp in a few seconds, which is the budget this step had.
 */
const EXECUTION_PROVIDERS = ["wasm"] as const;

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
      // Belt and braces: the providers are also passed per session below, but a
      // stale global would otherwise decide for any session created elsewhere.
      const config = rembg.rembgConfig as unknown as {
        enableWebGPU?: (on: boolean) => void;
        enableWebNN?: (on: boolean) => void;
      };
      config.enableWebGPU?.(false);
      config.enableWebNN?.(false);
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

/**
 * Turns an inference failure into something an admin can act on.
 *
 * The runtime's own messages describe kernels and tensors — "ceil_mode kernel
 * execution (padding) is not yet implemented" is accurate and completely
 * useless to a shopkeeper deciding what to do about a tomato. The original
 * text is kept on the console for whoever is debugging; what reaches the screen
 * says what happened and what to do instead.
 */
function describeInferenceFailure(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  console.error(`[hashmimart-admin] background removal failed: ${raw}`);

  if (/webgpu|webnn|not yet implemented/i.test(raw)) {
    return "This browser's graphics acceleration could not run the cutout model. Reload the page, or use a different browser — the photo itself is fine.";
  }
  if (/out of memory|allocation failed|memory access out of bounds/i.test(raw)) {
    return "The browser ran out of memory during the cutout. Close some tabs and try again, or use a smaller photo.";
  }
  if (/fetch|network|failed to load/i.test(raw)) {
    return "The cutout model could not finish downloading. Check the connection and try again.";
  }
  return "The background could not be removed from this photo.";
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
  // Named explicitly rather than left to the library's own detection, so the
  // provider cannot change with the machine the dashboard happens to run on.
  const session = await rembg.newSession(model, undefined, {
    executionProviders: [...EXECUTION_PROVIDERS],
  });
  if (options.signal?.aborted) throw new DOMException("Cancelled", "AbortError");

  let blob: Blob;
  try {
    blob = await rembg.remove(input, {
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
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error(describeInferenceFailure(error));
  }

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
