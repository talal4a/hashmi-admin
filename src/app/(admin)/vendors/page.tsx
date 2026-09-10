import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require-admin";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/admin-shell/page-header";
import { VendorsView } from "@/components/marketing/vendors-view";
import { listSocieties, listVendors } from "@/server/repositories/misc";
import { allProducts } from "@/server/repositories/products";

export const metadata: Metadata = { title: "Vendors & Stores" };
export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const admin = await requirePermission("vendors.view");
  const [vendors, societies, products] = await Promise.all([
    listVendors(),
    listSocieties(),
    allProducts(),
  ]);

  const productCounts: Record<string, number> = {};
  for (const product of products) {
    for (const vendorId of product.availability.vendorIds) {
      productCounts[vendorId] = (productCounts[vendorId] ?? 0) + 1;
    }
  }

  const active = vendors.filter((v) => v.status === "active").length;

  return (
    <>
      <PageHeader
        title="Vendors & Stores"
        subtitle={`${active} active · ${vendors.length} total`}
      />
      <VendorsView
        vendors={vendors}
        societies={societies}
        productCounts={productCounts}
        canWrite={can(admin, "vendors.write")}
      />
    </>
  );
}
