import "server-only";

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { MODEL_LIST, type ModelSpec } from "@/lib/media/model-catalog";

/**
 * On-disk store for the segmentation models (PRD §5.3).
 *
 * The first cutout an admin runs fetches the pinned artifact once, verifies it
 * against the catalogue's byte length and SHA-256, and keeps it. Every later
 * request is served from disk. Nothing has to be committed to the repository,
 * no build step has to run, and a fresh clone works on its own — which is the
 * whole reason background removal was dead before: the models were simply never
 * there.
 *
 * A file placed in `public/models/` takes priority, so an air-gapped or
 * bandwidth-limited deployment can ship the weights itself and never reach out.
 */

export interface ResolvedModel {
  spec: ModelSpec;
  filePath: string;
  bytes: number;
}

export class ModelIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelIntegrityError";
  }
}

/** Where a self-fetched model is kept. Overridable for read-only deployments. */
export function cacheDir(): string {
  const configured = process.env.HM_MODEL_CACHE_DIR;
  if (configured) return configured;
  return path.join(os.tmpdir(), "hashmimart-models");
}

/** A model the operator supplied themselves, which always wins. */
function bundledPath(spec: ModelSpec): string {
  return path.join(process.cwd(), "public", "models", spec.file);
}

async function sizeOf(filePath: string): Promise<number | null> {
  try {
    const info = await stat(filePath);
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
}

/** Where the model already is, if it is anywhere. */
export async function findOnDisk(spec: ModelSpec): Promise<ResolvedModel | null> {
  for (const filePath of [bundledPath(spec), path.join(cacheDir(), spec.file)]) {
    const bytes = await sizeOf(filePath);
    // A truncated file from an interrupted download must not be served.
    if (bytes === spec.bytes) return { spec, filePath, bytes };
    if (bytes !== null && filePath.startsWith(cacheDir())) await rm(filePath, { force: true });
  }
  return null;
}

/** One download per model per process, however many tabs ask at once. */
const inFlight = new Map<string, Promise<ResolvedModel>>();

async function download(spec: ModelSpec): Promise<ResolvedModel> {
  const dir = cacheDir();
  await mkdir(dir, { recursive: true });

  const finalPath = path.join(dir, spec.file);
  // A unique temp name means two processes never write the same partial file.
  const tempPath = `${finalPath}.${process.pid}.${Date.now()}.part`;

  const response = await fetch(spec.upstreamUrl, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new ModelIntegrityError(
      `Could not download ${spec.file} from its pinned source (HTTP ${response.status}).`,
    );
  }

  const hash = createHash("sha256");
  let received = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    const buffer = Buffer.from(chunk);
    received += buffer.byteLength;
    if (received > spec.bytes) break; // Stop early rather than buffer a wrong file.
    hash.update(buffer);
    chunks.push(buffer);
  }

  if (received !== spec.bytes) {
    throw new ModelIntegrityError(
      `${spec.file} was ${received} bytes but the pinned artifact is ${spec.bytes}. Refusing it.`,
    );
  }
  const digest = hash.digest("hex");
  if (digest !== spec.sha256) {
    throw new ModelIntegrityError(
      `${spec.file} failed its SHA-256 check. Expected ${spec.sha256}, got ${digest}. Refusing it.`,
    );
  }

  await writeFile(tempPath, Buffer.concat(chunks));
  // Rename is atomic on the same filesystem, so readers never see a half file.
  await rename(tempPath, finalPath);
  return { spec, filePath: finalPath, bytes: spec.bytes };
}

/** The model, from disk if possible, fetched and verified if not. */
export async function ensureModel(spec: ModelSpec): Promise<ResolvedModel> {
  const existing = await findOnDisk(spec);
  if (existing) return existing;

  const pending = inFlight.get(spec.file);
  if (pending) return pending;

  const task = download(spec).finally(() => inFlight.delete(spec.file));
  inFlight.set(spec.file, task);
  return task;
}

/** A readable stream of the model, so a 170 MB file never sits in memory. */
export function streamModel(resolved: ResolvedModel): ReadableStream<Uint8Array> {
  return Readable.toWeb(
    createReadStream(resolved.filePath),
  ) as unknown as ReadableStream<Uint8Array>;
}

export interface ModelStatus {
  id: string;
  file: string;
  label: string;
  bytes: number;
  /** True when it is already on disk and will not need downloading. */
  ready: boolean;
  location: "bundled" | "cache" | null;
}

/** What Settings shows so "is this working?" has an answer without guesswork. */
export async function modelStatuses(): Promise<ModelStatus[]> {
  return Promise.all(
    MODEL_LIST.map(async (spec) => {
      const found = await findOnDisk(spec);
      return {
        id: spec.id,
        file: spec.file,
        label: spec.label,
        bytes: spec.bytes,
        ready: found !== null,
        location: found
          ? found.filePath.startsWith(path.join(process.cwd(), "public"))
            ? ("bundled" as const)
            : ("cache" as const)
          : null,
      };
    }),
  );
}
