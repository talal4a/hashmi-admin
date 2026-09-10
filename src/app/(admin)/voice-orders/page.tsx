import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/admin-shell/page-header";
import { VoiceQueue } from "@/components/orders/voice-queue";
import { listVoiceOrders } from "@/server/repositories/misc";
import { getSettings } from "@/server/repositories/settings";

export const metadata: Metadata = { title: "Voice Orders" };
export const dynamic = "force-dynamic";

export default async function VoiceOrdersPage() {
  await requirePermission("voice.view");
  const [voiceOrders, settings] = await Promise.all([listVoiceOrders(), getSettings()]);

  const waiting = voiceOrders.filter(
    (v) => v.reviewStatus === "unreviewed" || v.reviewStatus === "in_review",
  ).length;

  return (
    <>
      <PageHeader
        title="Voice Orders"
        subtitle={
          waiting > 0
            ? `${waiting} request${waiting === 1 ? "" : "s"} waiting for review — nothing is auto-confirmed`
            : "Everything has been reviewed"
        }
      />
      <VoiceQueue
        voiceOrders={voiceOrders}
        lowConfidenceThreshold={settings.voice.lowConfidenceThreshold}
      />
    </>
  );
}
