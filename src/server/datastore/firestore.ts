import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import type { CollectionHandle, Datastore, Identified, QueryOptions } from "./types";

/** Firestore-backed datastore used whenever Admin credentials are configured. */

class FirestoreCollection<T extends Identified> implements CollectionHandle<T> {
  constructor(
    readonly name: string,
    private db: Firestore,
  ) {}

  private ref() {
    return this.db.collection(this.name);
  }

  async all(): Promise<T[]> {
    const snap = await this.ref().get();
    return snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
  }

  async get(id: string): Promise<T | null> {
    const doc = await this.ref().doc(id).get();
    return doc.exists ? ({ ...(doc.data() as T), id: doc.id }) : null;
  }

  /**
   * Predicate filters run in memory so the repository layer can express rich
   * admin filters without demanding a composite index per combination — PRD
   * §11.3 asks for indexes to be created only once query patterns settle.
   * Ordering and paging are pushed to Firestore where they are expressible.
   */
  async query(options: QueryOptions<T> = {}): Promise<T[]> {
    let q: FirebaseFirestore.Query = this.ref();
    if (options.orderBy && !options.where) {
      q = q.orderBy(options.orderBy.field, options.orderBy.direction ?? "asc");
      if (options.offset) q = q.offset(options.offset);
      if (options.limit !== undefined) q = q.limit(options.limit);
      const snap = await q.get();
      return snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
    }

    const docs = await this.all();
    let filtered = options.where ? docs.filter(options.where) : docs;
    if (options.orderBy) {
      const dir = options.orderBy.direction === "desc" ? -1 : 1;
      const field = options.orderBy.field;
      filtered = [...filtered].sort((a, b) => {
        const av = a[field] as unknown;
        const bv = b[field] as unknown;
        if (av === bv) return 0;
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    }
    const offset = options.offset ?? 0;
    return options.limit === undefined
      ? filtered.slice(offset)
      : filtered.slice(offset, offset + options.limit);
  }

  async set(doc: T): Promise<T> {
    await this.ref().doc(doc.id).set(doc, { merge: false });
    return doc;
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    const ref = this.ref().doc(id);
    await ref.set({ ...patch, id }, { merge: true });
    const next = await ref.get();
    return { ...(next.data() as T), id };
  }

  async remove(id: string): Promise<void> {
    await this.ref().doc(id).delete();
  }

  async mutate<R>(id: string, fn: (current: T | null) => { next: T | null; result: R }): Promise<R> {
    const ref = this.ref().doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists ? ({ ...(snap.data() as T), id: snap.id }) : null;
      const { next, result } = fn(current);
      if (next === null) tx.delete(ref);
      else tx.set(ref, next, { merge: false });
      return result;
    });
  }
}

export class FirestoreDatastore implements Datastore {
  readonly backend = "firestore" as const;

  constructor(private db: Firestore) {}

  collection<T extends Identified>(name: string): CollectionHandle<T> {
    return new FirestoreCollection<T>(name, this.db);
  }
}
