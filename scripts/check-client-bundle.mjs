#!/usr/bin/env node
/**
 * Verifies no server-only secret reached the browser bundle (PRD §16.3, §25).
 *
 * Scans every client asset Next.js emitted for the literal values of the
 * server-only environment variables, and for the variable names themselves
 * appearing as inlined `process.env` reads. Run after `next build`.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const CLIENT_DIRS = [".next/static", ".next/server/app"];

/** Server-only variables whose values must never appear in client output. */
const SECRET_VARS = [
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "PIXABAY_API_KEY",
  "PEXELS_API_KEY",
  "UNSPLASH_ACCESS_KEY",
  "UNSPLASH_SECRET_KEY",
  "AUTH_SESSION_SECRET",
  "DEV_ADMIN_PASSWORD",
];

/** Only `.next/static` is actually shipped to the browser. */
const BROWSER_ONLY = ".next/static";

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

async function main() {
  const values = new Map();
  for (const name of SECRET_VARS) {
    const value = process.env[name];
    // Short values would produce false positives; only scan real secrets.
    if (value && value.length >= 8) values.set(name, value);
  }

  const files = [];
  for (const dir of CLIENT_DIRS) files.push(...(await walk(path.join(ROOT, dir))));

  const scannable = files.filter((f) => /\.(js|mjs|cjs|css|map|html|json|txt)$/.test(f));
  if (scannable.length === 0) {
    console.error("No build output found. Run `npm run build` first.");
    process.exitCode = 1;
    return;
  }

  const findings = [];
  let bytes = 0;

  for (const file of scannable) {
    const relative = path.relative(ROOT, file);
    const info = await stat(file);
    bytes += info.size;
    const content = await readFile(file, "utf8");

    for (const [name, value] of values) {
      if (content.includes(value)) findings.push({ file: relative, kind: "value", name });
    }

    // A client chunk should never carry a server-only variable name either.
    if (relative.startsWith(BROWSER_ONLY)) {
      for (const name of SECRET_VARS) {
        if (content.includes(name)) findings.push({ file: relative, kind: "name", name });
      }
    }
  }

  const mb = (bytes / 1024 / 1024).toFixed(1);
  console.log(`Scanned ${scannable.length} build artifacts (${mb} MB) for ${values.size} configured secrets.`);

  if (findings.length > 0) {
    console.error("\nSECRET EXPOSURE DETECTED:");
    for (const finding of findings) {
      console.error(
        `  ${finding.file}: ${finding.kind === "value" ? "contains the value of" : "references"} ${finding.name}`,
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log("No server-only secret value or variable name found in client output.");
}

await main();
