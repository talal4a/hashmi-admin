import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require-admin";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/admin-shell/page-header";
import { SettingsView } from "@/components/system/settings-view";
import { getSettings } from "@/server/repositories/settings";
import { datastoreBackend } from "@/server/datastore";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const admin = await requirePermission("settings.view");
  const settings = await getSettings();

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Store, delivery, tax, payments, catalog defaults, voice policy and app config"
      />
      <SettingsView
        settings={settings}
        backend={datastoreBackend()}
        canWrite={can(admin, "settings.write")}
      />
    </>
  );
}
