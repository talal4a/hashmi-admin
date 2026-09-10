import "server-only";

import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Firebase Admin SDK — server only (PRD §10.3).
 * Credentials come from server-only environment variables and are never
 * exposed through NEXT_PUBLIC_* or shipped to the browser.
 */

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
// Deployment providers commonly store the PEM with escaped newlines.
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

export const isFirebaseAdminConfigured = Boolean(projectId && clientEmail && privateKey);

let cached: App | null = null;

function adminApp(): App | null {
  if (!isFirebaseAdminConfigured) return null;
  if (cached) return cached;
  cached = getApps().length
    ? getApp()
    : initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
        projectId,
        storageBucket: process.env.FIREBASE_ADMIN_STORAGE_BUCKET,
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
