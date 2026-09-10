import "server-only";

import { COLLECTIONS, ensureSeeded, getDatastore } from "@/server/datastore";
import type { CollectionHandle } from "@/server/datastore";

export { COLLECTIONS };

export async function collection<T extends { id: string }>(name: string): Promise<CollectionHandle<T>> {
  await ensureSeeded();
  return getDatastore().collection<T>(name);
}

export function newId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}${random}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
