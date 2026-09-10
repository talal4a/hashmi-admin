export interface Identified {
  id: string;
}

export interface QueryOptions<T> {
  where?: (doc: T) => boolean;
  orderBy?: { field: keyof T & string; direction?: "asc" | "desc" };
  limit?: number;
  offset?: number;
}

export interface CollectionHandle<T extends Identified> {
  name: string;
  all(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  query(options?: QueryOptions<T>): Promise<T[]>;
  set(doc: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
  /**
   * Read-modify-write applied atomically for the active backend.
   * Firestore uses a real transaction; the local backend serialises through a
   * single-writer queue so stock maths cannot interleave.
   */
  mutate<R>(id: string, fn: (current: T | null) => { next: T | null; result: R }): Promise<R>;
}

export interface Datastore {
  readonly backend: "firestore" | "local";
  collection<T extends Identified>(name: string): CollectionHandle<T>;
}

export const COLLECTIONS = {
  admins: "admins",
  products: "products",
  categories: "categories",
  orders: "orders",
  voiceOrders: "voiceOrders",
  inventoryMovements: "inventoryMovements",
  customers: "customers",
  societies: "societies",
  vendors: "vendors",
  offers: "offers",
  coupons: "coupons",
  banners: "banners",
  notifications: "notifications",
  auditLogs: "auditLogs",
  appConfig: "appConfig",
  supportConversations: "supportConversations",
  mediaLibrary: "mediaLibrary",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
