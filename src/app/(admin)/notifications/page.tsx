import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require-admin";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/admin-shell/page-header";
import { NotificationsView } from "@/components/system/notifications-view";
import { listNotifications } from "@/server/repositories/misc";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const admin = await requirePermission("notifications.view");
  const notifications = await listNotifications();
  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={`${unread} unread · ${notifications.length} in the log`}
      />
      <NotificationsView
        notifications={notifications}
        canWrite={can(admin, "notifications.write")}
      />
    </>
  );
}
