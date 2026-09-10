import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Firebase Admin SDK — server only (PRD §10.3).
 *
 * Credentials are resolved from one of two places, in this order:
 *
 *   1. A service-account JSON file, for local development. Drop the file
 *      Firebase gives you into the project root as `service-account.json` (or
 *      point FIREBASE_SERVICE_ACCOUNT_PATH at it). It is git-ignored.
 *   2. Individual environment variables, for deployment. Hosting providers
 *      accept environment variables, not file uploads, so production uses these.
 *
 * Either way the credential stays server-side: it is never read from a client
 * component and never exposed through a NEXT_PUBLIC_* variable.
 */

interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  storageBucket?: string;
}

/** Reads the service-account JSON if one is present. Never throws. */
function fromFile(): ServiceAccount | null {
  const configured = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const candidates = configured
    ? [configured]
    : ["service-account.json", "serviceAccountKey.json", "firebase-service-account.json"];

  for (const candidate of candidates) {
    const filePath = path.isAbsolute(candidate)
      ? candidate
      : path.join(process.cwd(), candidate);
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8")) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          // Handles both real newlines and the escaped form.
          privateKey: parsed.private_key.replace(/\\n/g, "\n"),
          storageBucket: process.env.FIREBASE_ADMIN_STORAGE_BUCKET,
        };
      }
      console.warn(
        `[hashmimart-admin] ${candidate} is missing project_id, client_email or private_key — ignoring it.`,
      );
    } catch (error) {
      // A missing file is the normal case in production; anything else is worth
      // surfacing, because a malformed key is otherwise silent.
      const code = (error as NodeJS.ErrnoException).code;
      if (configured && code === "ENOENT") {
        console.warn(
          `[hashmimart-admin] FIREBASE_SERVICE_ACCOUNT_PATH points at ${filePath}, which does not exist.`,
        );
      } else if (code !== "ENOENT") {
        console.warn(
          `[hashmimart-admin] Could not read ${candidate}: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }
  }
  return null;
}

/** Reads the individual environment variables, as used in deployment. */
function fromEnv(): ServiceAccount | null {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;
  return {
    projectId,
    clientEmail,
    privateKey,
    storageBucket: process.env.FIREBASE_ADMIN_STORAGE_BUCKET,
  };
}

const fileAccount = fromFile();
const serviceAccount: ServiceAccount | null = fileAccount ?? fromEnv();

export const isFirebaseAdminConfigured = serviceAccount !== null;

/** Which source was used — surfaced in Settings so it is never a mystery. */
export const firebaseAdminSource: "file" | "env" | "none" = !serviceAccount
  ? "none"
  : fileAccount
    ? "file"
    : "env";

let cached: App | null = null;

function adminApp(): App | null {
  if (!serviceAccount) return null;
  if (cached) return cached;
  cached = getApps().length
    ? getApp()
    : initializeApp({
        credential: cert({
          projectId: serviceAccount.projectId,
          clientEmail: serviceAccount.clientEmail,
          privateKey: serviceAccount.privateKey,
        }),
        projectId: serviceAccount.projectId,
        storageBucket: serviceAccount.storageBucket,
      });
  return cached;
}

export function adminAuth(): Auth | null {
  const app = adminApp();
  return app ? getAuth(app) : null;
}

export function adminFirestore(): Firestore | null {
  const app = adminApp();
  if (!app) return null;
  const db = getFirestore(app);
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // settings() throws if called twice; the first call already applied.
  }
  return db;
}
