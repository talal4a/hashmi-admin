import "server-only";

import { adminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { FirestoreDatastore } from "./firestore";
import { LocalDatastore } from "./local";
import type { Datastore } from "./types";

export * from "./types";

let instance: Datastore | null = null;
let seeded = false;

export function getDatastore(): Datastore {
  if (instance) return instance;
  if (isFirebaseAdminConfigured) {
    const db = adminFirestore();
    if (db) {
      instance = new FirestoreDatastore(db);
      return instance;
    }
  }
  instance = new LocalDatastore();
  return instance;
}

/**
 * Seeds the local dev datastore on first use so every module has realistic
 * HashmiMart data to operate on. Never runs against Firestore.
 */
export async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  const db = getDatastore();
  if (db.backend !== "local") {
    seeded = true;
    return;
  }
  const local = db as LocalDatastore;
  if (await local.isEmpty()) {
    const { seedLocalDatastore } = await import("./seed");
    await seedLocalDatastore(local);
  }
  seeded = true;
}

export function datastoreBackend(): "firestore" | "local" {
  return getDatastore().backend;
}
