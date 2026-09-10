import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { getStorage } from "firebase-admin/storage";
import { isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { newId } from "@/server/repositories/base";

/**
 * Media storage.
 *
 * With Firebase configured, processed media goes to the project's storage
 * bucket. Otherwise it is written under the local development data directory and
 * served back through an authenticated route, so nothing private is ever
 * publicly enumerable (PRD §10.3).
 */

const UPLOAD_DIR = path.join(process.cwd(), ".hm-data", "uploads");

export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export interface StoredMedia {
  storageId: string;
  url: string;
  mimeType: string;
  bytes: number;
}

export function validateUpload(mimeType: string, bytes: number): string | null {
  if (!(ALLOWED_MIME as readonly string[]).includes(mimeType)) {
    return "Only JPG, PNG, WEBP and AVIF images are allowed.";
  }
  if (bytes > MAX_UPLOAD_BYTES) {
    return `Image must be smaller than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`;
  }
  if (bytes <= 0) return "The file is empty.";
  return null;
}

function extensionFor(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/avif") return "avif";
  return "jpg";
}

export async function storeMedia(
  data: Buffer,
  mimeType: string,
  prefix = "media",
): Promise<StoredMedia> {
  const storageId = `${prefix}/${newId("m")}.${extensionFor(mimeType)}`;

  if (isFirebaseAdminConfigured && process.env.FIREBASE_ADMIN_STORAGE_BUCKET) {
    const bucket = getStorage().bucket(process.env.FIREBASE_ADMIN_STORAGE_BUCKET);
    const file = bucket.file(storageId);
    await file.save(data, { contentType: mimeType, resumable: false });
    // Long-lived signed URL; the object itself stays private in the bucket.
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
    });
    return { storageId, url, mimeType, bytes: data.byteLength };
  }

  const filePath = path.join(UPLOAD_DIR, storageId.replace("/", "__"));
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(filePath, data);
  return {
    storageId,
    url: `/api/media/file/${encodeURIComponent(storageId.replace("/", "__"))}`,
    mimeType,
    bytes: data.byteLength,
  };
}

export async function readLocalMedia(name: string): Promise<{ data: Buffer; mimeType: string } | null> {
  // Reject anything that could escape the upload directory.
  if (name.includes("..") || name.includes("/") || name.includes("\\")) return null;
  try {
    const data = await fs.readFile(path.join(UPLOAD_DIR, name));
    const ext = name.split(".").pop() ?? "jpg";
    const mimeType =
      ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "avif" ? "image/avif" : "image/jpeg";
    return { data, mimeType };
  } catch {
    return null;
  }
}
