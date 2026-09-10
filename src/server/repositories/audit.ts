import "server-only";

import type { AdminUser, AuditLogEntry } from "@/types";
import { COLLECTIONS, collection, newId, nowIso } from "./base";

/**
 * Audit trail (PRD §10.3). Every sensitive change records actor, timestamp and a
 * before/after summary; the reason is captured where the action asks for one.
 */
export async function recordAudit(entry: {
  actor: Pick<AdminUser, "uid" | "displayName">;
  action: string;
  entityType: string;
  entityId: string;
  beforeSummary?: string | null;
  afterSummary?: string | null;
  reason?: string | null;
}): Promise<void> {
  const col = await collection<AuditLogEntry>(COLLECTIONS.auditLogs);
  await col.set({
    id: newId("aud"),
    actorUid: entry.actor.uid,
    actorName: entry.actor.displayName,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    beforeSummary: entry.beforeSummary ?? null,
    afterSummary: entry.afterSummary ?? null,
    reason: entry.reason ?? null,
    timestamp: nowIso(),
  });
}

export async function listAudit(options: {
  search?: string;
  action?: string;
  entityType?: string;
  limit?: number;
} = {}): Promise<AuditLogEntry[]> {
  const col = await collection<AuditLogEntry>(COLLECTIONS.auditLogs);
  const all = await col.query({ orderBy: { field: "timestamp", direction: "desc" } });
  const search = options.search?.trim().toLowerCase();
  return all
    .filter((e) => (options.action ? e.action === options.action : true))
    .filter((e) => (options.entityType ? e.entityType === options.entityType : true))
    .filter((e) =>
      search
        ? [e.actorName, e.action, e.entityId, e.beforeSummary, e.afterSummary, e.reason]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(search))
        : true,
    )
    .slice(0, options.limit ?? 300);
}
