import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require-admin";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/admin-shell/page-header";
import { AdminsView } from "@/components/system/admins-view";
import { listAdmins } from "@/server/repositories/misc";

export const metadata: Metadata = { title: "Admin Users" };
export const dynamic = "force-dynamic";

export default async function AdminsPage() {
  const admin = await requirePermission("admins.view");
  const admins = await listAdmins();
  const active = admins.filter((a) => a.active).length;

  return (
    <>
      <PageHeader
        title="Admin Users & Roles"
        subtitle={`${active} active · ${admins.length} total`}
      />
      <AdminsView admins={admins} currentUid={admin.uid} canWrite={can(admin, "admins.write")} />
    </>
  );
}
