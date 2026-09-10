import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/require-admin";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/admin-shell/page-header";
import { VoiceReview } from "@/components/orders/voice-review";
import { getVoiceOrder, listSocieties } from "@/server/repositories/misc";
import { getSettings } from "@/server/repositories/settings";
import { formatDateTime } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const voice = await getVoiceOrder(id);
  return { title: voice ? `Voice ${voice.displayId}` : "Voice order" };
}

export default async function VoiceOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePermission("voice.view");
  const { id } = await params;

  const [voiceOrder, societies, settings] = await Promise.all([
    getVoiceOrder(id),
    listSocieties(),
    getSettings(),
  ]);
  if (!voiceOrder) notFound();

  return (
    <>
      <PageHeader
        title={`Voice request ${voiceOrder.displayId}`}
        subtitle={`${voiceOrder.customer.fullName} · recorded ${formatDateTime(voiceOrder.createdAt)}`}
        breadcrumbs={[{ label: "Voice Orders", href: "/voice-orders" }, { label: voiceOrder.displayId }]}
      />
      <VoiceReview
        voiceOrder={voiceOrder}
        societies={societies}
        lowConfidenceThreshold={settings.voice.lowConfidenceThreshold}
        canWrite={can(admin, "voice.write")}
      />
    </>
  );
}
