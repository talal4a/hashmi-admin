import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require-admin";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/admin-shell/page-header";
import { BannersView } from "@/components/marketing/banners-view";
import { listBanners } from "@/server/repositories/misc";

export const metadata: Metadata = { title: "Banners & Content" };
export const dynamic = "force-dynamic";

export default async function BannersPage() {
  const admin = await requirePermission("marketing.view");
  const banners = await listBanners();
  const live = banners.filter((b) => b.status === "live").length;

  return (
    <>
      <PageHeader
        title="Banners & Home Content"
        subtitle={`${live} live · ${banners.length} total`}
      />
      <BannersView banners={banners} canWrite={can(admin, "marketing.write")} />
    </>
  );
}
