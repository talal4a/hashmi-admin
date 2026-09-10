import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/require-admin";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/admin-shell/page-header";
import { CustomerDetail } from "@/components/customers/customer-detail";
import {
  getCustomer,
  listSupportConversations,
  listVoiceOrders,
} from "@/server/repositories/misc";
import { allOrders } from "@/server/repositories/orders";
import { allProducts } from "@/server/repositories/products";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const customer = await getCustomer(id);
  return { title: customer ? customer.fullName : "Customer" };
}

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePermission("customers.view");
  const { id } = await params;

  const [customer, orders, voiceOrders, conversations, products] = await Promise.all([
    getCustomer(id),
    allOrders(),
    listVoiceOrders(),
    listSupportConversations(),
    allProducts(),
  ]);

  if (!customer) notFound();

  const theirOrders = orders
    .filter((o) => o.customer.uid === customer.uid)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const theirVoice = voiceOrders.filter((v) => v.customer.uid === customer.uid);
  const theirConversations = conversations.filter((c) => c.customer.uid === customer.uid);
  const wishlist = products.filter((p) => customer.wishlistProductIds.includes(p.id));

  return (
    <>
      <PageHeader
        title={customer.fullName}
        subtitle={`${customer.orderCount} orders · ${customer.society ?? "no area on file"}`}
        breadcrumbs={[{ label: "Customers", href: "/customers" }, { label: customer.fullName }]}
      />
      <CustomerDetail
        customer={customer}
        orders={theirOrders}
        voiceOrders={theirVoice}
        conversations={theirConversations}
        wishlist={wishlist}
        canWrite={can(admin, "customers.write")}
      />
    </>
  );
}
