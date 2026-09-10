import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/admin-shell/page-header";
import { AuditView } from "@/components/system/audit-view";
import { listAudit } from "@/server/repositories/audit";

export const metadata: Metadata = { title: "Audit Log" };
export const dynamic = "force-dynamic";

export default async function AuditPage() {
  await requirePermission("audit.view");
  const entries = await listAudit({ limit: 500 });

  return (
    <>
      <PageHeader
        title="Audit Log"
        subtitle={`${entries.length} recorded change${entries.length === 1 ? "" : "s"} · actor, timestamp and before/after for every sensitive action`}
      />
      <AuditView entries={entries} />
    </>
  );
}
