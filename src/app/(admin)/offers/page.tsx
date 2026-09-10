import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require-admin";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/admin-shell/page-header";
import { OffersView } from "@/components/marketing/offers-view";
import { listCategories } from "@/server/repositories/categories";
import { allProducts } from "@/server/repositories/products";
import { listCoupons, listOffers } from "@/server/repositories/misc";

export const metadata: Metadata = { title: "Offers & Coupons" };
export const dynamic = "force-dynamic";

export default async function OffersPage() {
  const admin = await requirePermission("marketing.view");
  const [coupons, offers, categories, products] = await Promise.all([
    listCoupons(),
    listOffers(),
    listCategories(),
    allProducts(),
  ]);

  const active = coupons.filter((c) => c.status === "active").length + offers.filter((o) => o.status === "active").length;

  return (
    <>
      <PageHeader
        title="Offers & Coupons"
        subtitle={`${active} live promotion${active === 1 ? "" : "s"} · ${coupons.length} coupons · ${offers.length} product offers`}
      />
      <OffersView
        coupons={coupons}
        offers={offers}
        categories={categories}
        products={products}
        canWrite={can(admin, "marketing.write")}
      />
    </>
  );
}
