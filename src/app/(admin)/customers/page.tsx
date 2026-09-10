import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/admin-shell/page-header";
import { CustomersView } from "@/components/customers/customers-view";
import { listCustomers, listSocieties } from "@/server/repositories/misc";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  await requirePermission("customers.view");
  const [customers, societies] = await Promise.all([listCustomers(), listSocieties()]);

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Profiles, order history, addresses and support context"
      />
      <CustomersView customers={customers} societies={societies} />
    </>
  );
}
