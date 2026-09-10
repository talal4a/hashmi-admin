import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import type { CollectionHandle, Datastore, Identified, QueryOptions } from "./types";

/**
 * Development datastore.
 *
 * Used only when the Firebase Admin credentials are absent, so the dashboard is
 * fully operable before a Firebase project is attached. Document shapes are
 * identical to the Firestore ones, so swapping backends changes nothing above
 * the repository layer. The topbar shows a "Local data" environment badge
 * whenever this backend is active, per PRD §2.2.
 */

const DATA_DIR = path.join(process.cwd(), ".hm-data");

type Store = Record<string, Record<string, unknown>>;

let cache: Store | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();

async function readStore(): Promise<Store> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, "store.json"), "utf8");
    cache = JSON.parse(raw) as Store;
  } catch {
    cache = {};
  }
  return cache;
}

async function persist(): Promise<void> {
  if (!cache) return;
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = path.join(DATA_DIR, `store.${process.pid}.tmp`);
  const target = path.join(DATA_DIR, "store.json");
  await fs.writeFile(tmp, JSON.stringify(cache, null, 2), "utf8");
  await fs.rename(tmp, target);
}

/** Serialise every write so read-modify-write cycles cannot interleave. */
function enqueue<R>(fn: () => Promise<R>): Promise<R> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function sortDocs<T extends Identified>(docs: T[], orderBy: QueryOptions<T>["orderBy"]): T[] {
  if (!orderBy) return docs;
  const dir = orderBy.direction === "desc" ? -1 : 1;
  return [...docs].sort((a, b) => {
    const av = a[orderBy.field] as unknown;
    const bv = b[orderBy.field] as unknown;
    if (av === bv) return 0;
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

class LocalCollection<T extends Identified> implements CollectionHandle<T> {
  constructor(readonly name: string) {}

  private async bucket(): Promise<Record<string, T>> {
    const store = await readStore();
    if (!store[this.name]) store[this.name] = {};
    return store[this.name] as Record<string, T>;
  }

  async all(): Promise<T[]> {
    const bucket = await this.bucket();
    return Object.values(bucket).map((d) => structuredClone(d));
  }

  async get(id: string): Promise<T | null> {
    const bucket = await this.bucket();
    const doc = bucket[id];
    return doc ? structuredClone(doc) : null;
  }

  async query(options: QueryOptions<T> = {}): Promise<T[]> {
    let docs = await this.all();
    if (options.where) docs = docs.filter(options.where);
    docs = sortDocs(docs, options.orderBy);
    const offset = options.offset ?? 0;
    return options.limit === undefined ? docs.slice(offset) : docs.slice(offset, offset + options.limit);
  }

  set(doc: T): Promise<T> {
    return enqueue(async () => {
      const bucket = await this.bucket();
      bucket[doc.id] = structuredClone(doc);
      await persist();
      return structuredClone(doc);
    });
  }

  update(id: string, patch: Partial<T>): Promise<T> {
    return enqueue(async () => {
      const bucket = await this.bucket();
      const current = bucket[id];
      if (!current) throw new Error(`${this.name}/${id} not found`);
      const next = { ...current, ...patch, id } as T;
      bucket[id] = next;
      await persist();
      return structuredClone(next);
    });
  }

  remove(id: string): Promise<void> {
    return enqueue(async () => {
      const bucket = await this.bucket();
      delete bucket[id];
      await persist();
    });
  }

  mutate<R>(id: string, fn: (current: T | null) => { next: T | null; result: R }): Promise<R> {
    return enqueue(async () => {
      const bucket = await this.bucket();
      const current = bucket[id] ? structuredClone(bucket[id]) : null;
      const { next, result } = fn(current);
      if (next === null) delete bucket[id];
      else bucket[id] = structuredClone(next);
      await persist();
      return result;
    });
  }
}

export class LocalDatastore implements Datastore {
  readonly backend = "local" as const;
  private handles = new Map<string, CollectionHandle<Identified>>();

  collection<T extends Identified>(name: string): CollectionHandle<T> {
    let handle = this.handles.get(name);
    if (!handle) {
      handle = new LocalCollection<Identified>(name);
      this.handles.set(name, handle);
    }
    return handle as CollectionHandle<T>;
  }

  /** Used by the seeder to detect a first run. */
  async isEmpty(): Promise<boolean> {
    const store = await readStore();
    return Object.keys(store).length === 0;
  }
}
