#!/usr/bin/env node
/**
 * Puts the media studio's runtime files where the browser can reach them.
 *
 *   node scripts/prepare-media-runtime.mjs            # ONNX Runtime only (offline)
 *   node scripts/prepare-media-runtime.mjs --models   # also pre-fetch the model
 *
 * The ONNX Runtime `.wasm` files are copied out of node_modules, so this needs
 * no network and is safe to run from `postinstall`. Serving them from this
 * origin instead of a public CDN is what keeps background removal working on
 * networks that block third-party CDNs.
 *
 * The segmentation weights are optional here: `/api/media/model/<file>` fetches
 * and verifies them on first use anyway. Pre-fetching only avoids making the
 * first admin wait.
 */

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const ORT_DIST = path.join(ROOT, "node_modules", "onnxruntime-web", "dist");
const ORT_OUT = path.join(ROOT, "public", "ort");
const MODELS_OUT = path.join(ROOT, "public", "models");

/**
 * Only the builds the bundled entry point can request. The asyncify and jspi
 * variants are another 41 MB that this app never asks for.
 */
const ORT_FILES = [
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
];

/** Kept in step with src/lib/media/model-catalog.ts. */
const MODELS = [
  {
    file: "u2netp.onnx",
    bytes: 4_574_861,
    sha256: "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8",
    url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx",
  },
];

async function sizeOf(filePath) {
  try {
    return (await stat(filePath)).size;
  } catch {
    return null;
  }
}

async function copyOrtRuntime() {
  if ((await sizeOf(path.join(ORT_DIST, ORT_FILES[0]))) === null) {
    console.log("  onnxruntime-web is not installed yet — skipping the runtime copy.");
    return;
  }
  await mkdir(ORT_OUT, { recursive: true });

  let copied = 0;
  for (const file of ORT_FILES) {
    const from = path.join(ORT_DIST, file);
    const to = path.join(ORT_OUT, file);
    const [fromSize, toSize] = await Promise.all([sizeOf(from), sizeOf(to)]);
    if (fromSize === null) continue;
    if (fromSize === toSize) continue; // Already current.
    await copyFile(from, to);
    copied += 1;
  }
  console.log(
    copied > 0
      ? `  ONNX Runtime: ${copied} file(s) copied to public/ort/.`
      : "  ONNX Runtime: already up to date in public/ort/.",
  );
}

async function fetchModels() {
  await mkdir(MODELS_OUT, { recursive: true });

  for (const model of MODELS) {
    const target = path.join(MODELS_OUT, model.file);
    if ((await sizeOf(target)) === model.bytes) {
      const existing = createHash("sha256").update(await readFile(target)).digest("hex");
      if (existing === model.sha256) {
        console.log(`  ${model.file}: already present and verified.`);
        continue;
      }
    }

    const mb = (model.bytes / 1024 / 1024).toFixed(1);
    console.log(`  ${model.file}: downloading ${mb} MB…`);
    const response = await fetch(model.url, { redirect: "follow" });
    if (!response.ok) throw new Error(`${model.file}: HTTP ${response.status} from ${model.url}`);

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength !== model.bytes) {
      throw new Error(`${model.file}: got ${bytes.byteLength} bytes, expected ${model.bytes}.`);
    }
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== model.sha256) {
      throw new Error(`${model.file}: SHA-256 mismatch. Expected ${model.sha256}, got ${digest}.`);
    }

    // Write then rename, so an interrupted run never leaves a half model behind.
    const temp = `${target}.part`;
    await writeFile(temp, bytes);
    await rename(temp, target);
    console.log(`  ${model.file}: verified and saved.`);
  }
}

async function main() {
  console.log("\nPreparing the media studio runtime…");
  await copyOrtRuntime();

  if (process.argv.includes("--models")) {
    await fetchModels();
  } else {
    console.log("  Models are fetched on first use. Run `npm run fetch-models` to do it now.");
  }
  console.log("");
}

main().catch((error) => {
  console.error(`\nFailed: ${error.message}\n`);
  // A missing optional download must never break `npm install`.
  process.exitCode = process.argv.includes("--models") ? 1 : 0;
});
