"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Ban, CheckCircle2, Heart, MapPin, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";
import { Table, TableScroll, Td, Th, Tr } from "@/components/ui/table";
import { formatDateTime, formatPKR, formatRelative } from "@/lib/utils/format";
import {
  saveCustomerNoteAction,
  setCustomerStatusAction,
} from "@/server/actions/customers";
import { OrderStatusChip } from "@/components/orders/status-chip";
import { ProductThumb } from "@/components/products/product-card-preview";
import type { Customer, Order, Product, SupportConversation, VoiceOrder } from "@/types";

export function CustomerDetail({
  customer,
  orders,
  voiceOrders,
  conversations,
  wishlist,
  canWrite,
}: {
  customer: Customer;
  orders: Order[];
  voiceOrders: VoiceOrder[];
  conversations: SupportConversation[];
  wishlist: Product[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState(customer.notes ?? "");
  const [statusDialog, setStatusDialog] = useState(false);
  const [reason, setReason] = useState("");

  const refunds = orders.filter((o) => o.status === "refunded" || o.status === "cancelled");

  const saveNote = () => {
    startTransition(async () => {
      const result = await saveCustomerNoteAction({ customerId: customer.uid, notes });
      if (result.ok) {
        toast.success("Note saved");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const toggleStatus = () => {
    startTransition(async () => {
      const result = await setCustomerStatusAction({
        customerId: customer.uid,
        status: customer.status === "active" ? "blocked" : "active",
        reason,
      });
      if (result.ok) {
        toast.success(result.message ?? "Updated");
        setStatusDialog(false);
        setReason("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title={`Orders (${orders.length})`} subtitle="Newest first" />
            {orders.length === 0 ? (
              <EmptyState title="No orders yet" />
            ) : (
              <TableScroll>
                <Table className="min-w-[560px]">
                  <thead>
                    <tr>
                      <Th>Order</Th>
                      <Th align="right">Items</Th>
                      <Th align="right">Total</Th>
                      <Th>Status</Th>
                      <Th>Placed</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.slice(0, 20).map((order) => (
                      <Tr key={order.id}>
                        <Td>
                          <Link
                            href={`/orders/${order.id}`}
                            className="font-mono text-[13px] font-semibold text-[var(--hm-ink-900)] hover:text-[var(--hm-cyan-700)]"
                          >
                            {order.displayId}
                          </Link>
                        </Td>
                        <Td align="right" className="tabular-nums">
                          {order.items.reduce((s, i) => s + i.quantity, 0)}
                        </Td>
                        <Td align="right" className="font-semibold whitespace-nowrap">
                          {formatPKR(order.totals.grandTotal)}
                        </Td>
                        <Td><OrderStatusChip status={order.status} /></Td>
                        <Td className="whitespace-nowrap text-[12px] text-[var(--hm-ink-500)]">
                          {formatRelative(order.createdAt)}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableScroll>
            )}
          </Card>

          {voiceOrders.length > 0 ? (
            <Card>
              <CardHeader title={`Voice requests (${voiceOrders.length})`} />
              <ul className="divide-y divide-[var(--hm-border)]">
                {voiceOrders.map((voice) => (
                  <li key={voice.id} className="flex items-center gap-3 px-5 py-3">
                    <Link
                      href={`/voice-orders/${voice.id}`}
                      className="min-w-0 flex-1 font-mono text-[13px] font-semibold text-[var(--hm-ink-900)] hover:text-[var(--hm-cyan-700)]"
                    >
                      {voice.displayId}
                    </Link>
                    <span className="truncate text-[12px] text-[var(--hm-ink-500)]">
                      {voice.transcript ? `“${voice.transcript.slice(0, 50)}…”` : "No transcript"}
                    </span>
                    <Chip
                      tone={
                        voice.reviewStatus === "converted"
                          ? "success"
                          : voice.reviewStatus === "rejected"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {voice.reviewStatus.replace(/_/g, " ")}
                    </Chip>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {wishlist.length > 0 ? (
            <Card>
              <CardHeader
                title="Wishlist"
                subtitle="Saved items — a demand signal carried over from the storefront"
              />
              <CardBody className="flex flex-wrap gap-3">
                {wishlist.map((product) => (
                  <Link
                    key={product.id}
                    href={`/products/${product.id}`}
                    className="flex items-center gap-2.5 rounded-[var(--hm-radius-control-lg)] border border-[var(--hm-border)] py-1.5 pr-3 pl-1.5 transition-colors hover:border-[var(--hm-cyan-300)]"
                  >
                    <ProductThumb
                      imageUrl={product.media?.cutout?.url ?? product.media?.original.url}
                      emoji={product.emojiFallback}
                      palette={product.media?.palette}
                      size={32}
                    />
                    <span>
                      <span className="block text-[12.5px] font-semibold text-[var(--hm-ink-800)]">
                        {product.name}
                      </span>
                      <span className="block text-[11px] text-[var(--hm-ink-500)]">
                        {formatPKR(product.pricing.price)}
                      </span>
                    </span>
                  </Link>
                ))}
              </CardBody>
            </Card>
          ) : null}

          {conversations.length > 0 ? (
            <Card>
              <CardHeader title="Support context" subtitle="Recent conversations" />
              <ul className="divide-y divide-[var(--hm-border)]">
                {conversations.map((conversation) => (
                  <li key={conversation.id} className="px-5 py-3">
                    <p className="flex items-center gap-2 text-[13px] font-semibold text-[var(--hm-ink-900)]">
                      {conversation.subject}
                      <Chip tone={conversation.status === "resolved" ? "success" : "warning"}>
                        {conversation.status}
                      </Chip>
                    </p>
                    <p className="truncate text-[12px] text-[var(--hm-ink-500)]">
                      {conversation.messages.at(-1)?.body ?? "No messages"}
                    </p>
                    <p className="text-[11px] text-[var(--hm-ink-400)]">
                      {formatRelative(conversation.lastMessageAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader
              title="Profile"
              subtitle="Identity fields are managed by Auth and read-only here"
              action={<Chip tone={customer.status === "active" ? "success" : "danger"}>{customer.status}</Chip>}
            />
            <CardBody className="flex flex-col gap-2.5 text-[13px]">
              <Row label="Phone">{customer.phone}</Row>
              <Row label="Email">{customer.email ?? "—"}</Row>
              <Row label="Area">{customer.society ?? "—"}</Row>
              <Row label="UID"><code className="font-mono text-[11.5px]">{customer.uid}</code></Row>
              <Row label="Joined">{formatDateTime(customer.createdAt)}</Row>
              <Row label="Lifetime value">
                <strong>{formatPKR(customer.lifetimeValue)}</strong>
              </Row>
              <Row label="Orders">{customer.orderCount}</Row>
              <Row label="Refund / cancel">{refunds.length}</Row>
              <Row label="Wishlist">
                <span className="inline-flex items-center gap-1">
                  <Heart className="size-3.5 text-[var(--hm-danger-500)]" />
                  {customer.wishlistProductIds.length}
                </span>
              </Row>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Addresses" />
            {customer.addresses.length === 0 ? (
              <EmptyState title="No saved addresses" />
            ) : (
              <ul className="divide-y divide-[var(--hm-border)]">
                {customer.addresses.map((address) => (
                  <li key={address.id} className="flex items-start gap-2.5 px-5 py-3 text-[13px]">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-[var(--hm-ink-400)]" />
                    <span>
                      <span className="block font-semibold text-[var(--hm-ink-800)]">
                        {address.label}
                        {address.isDefault ? (
                          <Chip tone="cyan" className="ml-1.5">Default</Chip>
                        ) : null}
                      </span>
                      <span className="block text-[12px] text-[var(--hm-ink-500)]">
                        {address.line1}
                        {address.society ? `, ${address.society}` : ""}, {address.city}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {canWrite ? (
            <Card>
              <CardHeader title="Staff notes" subtitle="Visible to admins only" />
              <CardBody className="flex flex-col gap-2">
                <Textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Prefers delivery after 6pm"
                  aria-label="Staff notes"
                />
                <Button variant="outline" onClick={saveNote} loading={pending}>
                  <Save className="size-4" />
                  Save note
                </Button>
                <Button
                  variant={customer.status === "active" ? "outline" : "primary"}
                  onClick={() => setStatusDialog(true)}
                  className={customer.status === "active" ? "text-[var(--hm-danger-700)]" : undefined}
                >
                  {customer.status === "active" ? (
                    <>
                      <Ban className="size-4" />
                      Block customer
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-4" />
                      Unblock customer
                    </>
                  )}
                </Button>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      <Dialog
        open={statusDialog}
        onClose={() => setStatusDialog(false)}
        title={customer.status === "active" ? "Block this customer?" : "Unblock this customer?"}
        description="Privileged change — the reason is written to the audit log."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setStatusDialog(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant={customer.status === "active" ? "danger" : "primary"}
              onClick={toggleStatus}
              loading={pending}
              disabled={!reason.trim()}
            >
              <ShieldCheck className="size-4" />
              {customer.status === "active" ? "Block" : "Unblock"}
            </Button>
          </>
        }
      >
        <Field label="Reason" htmlFor="cust-reason" required>
          <Textarea
            id="cust-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Repeated fraudulent refund claims"
          />
        </Field>
      </Dialog>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-[var(--hm-ink-500)]">{label}</span>
      <span className="min-w-0 text-right break-words text-[var(--hm-ink-800)]">{children}</span>
    </div>
  );
}
