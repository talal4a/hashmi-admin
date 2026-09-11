/**
 * The segmentation models the media studio is allowed to run (PRD §5.3, §20).
 *
 * Every entry is pinned by exact byte length and SHA-256 so a model can only
 * ever be the artifact reviewed here — a mirror that swaps a file is rejected
 * rather than silently executed. The hashes were taken from the official rembg
 * release assets; silueta's matches the hash `@bunnio/rembg-web` ships
 * independently, which is a useful cross-check on the source.
 *
 * Imported by both the browser (to name a model) and the server route that
 * serves it, so it holds no runtime of its own.
 */

export type RembgModel = "u2netp" | "silueta" | "isnet-general-use";

export interface ModelSpec {
  id: RembgModel;
  /** File name the inference library requests. */
  file: string;
  label: string;
  note: string;
  bytes: number;
  sha256: string;
  /** Pinned upstream, used only when the file is not already on disk. */
  upstreamUrl: string;
  /** Licence of the weights themselves, which is not the wrapper's licence. */
  license: string;
}

export const MODEL_SPECS: Record<RembgModel, ModelSpec> = {
  u2netp: {
    id: "u2netp",
    file: "u2netp.onnx",
    label: "Fast (U2Net-P)",
    note: "4.4 MB. Clean cutouts on grocery packshots in a couple of seconds.",
    bytes: 4_574_861,
    sha256: "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8",
    upstreamUrl: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx",
    license: "Apache-2.0 (U^2-Net)",
  },
  silueta: {
    id: "silueta",
    file: "silueta.onnx",
    label: "Sharper (Silueta)",
    note: "42 MB. Better edges on jars, bottles and bagged goods.",
    bytes: 44_173_029,
    sha256: "75da6c8d2f8096ec743d071951be73b4a8bc7b3e51d9a6625d63644f90ffeedb",
    upstreamUrl: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/silueta.onnx",
    license: "Apache-2.0 (Silueta)",
  },
  "isnet-general-use": {
    id: "isnet-general-use",
    file: "isnet-general-use.onnx",
    label: "Best quality (IS-Net)",
    note: "170 MB. Finest detail — only worth the download on a fast connection.",
    bytes: 178_648_008,
    sha256: "60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a",
    upstreamUrl:
      "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx",
    license: "Apache-2.0 (IS-Net / DIS)",
  },
};

export const MODEL_LIST: ModelSpec[] = Object.values(MODEL_SPECS);

/**
 * The default is deliberately the smallest one. Nobody is asked to choose, and
 * a grocery packshot on a plain background does not need a 170 MB network.
 */
export const DEFAULT_REMBG_MODEL: RembgModel = "u2netp";

/** Recorded on every processed product so a result can be traced to its model. */
export const REMBG_MODEL_VERSION = "rembg-release@v0.0.0";

/** Resolves a file name back to its spec, rejecting anything not pinned above. */
export function specForFile(file: string): ModelSpec | null {
  return MODEL_LIST.find((spec) => spec.file === file) ?? null;
}

export function isRembgModel(value: string): value is RembgModel {
  return value in MODEL_SPECS;
}
