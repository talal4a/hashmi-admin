"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  Ban,
  Check,
  Clock,
  FileText,
  MapPin,
  Mic,
  Phone,
  Printer,
  Receipt,
  RotateCcw,
  StickyNote,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Table, TableScroll, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";
import { formatDateTime, formatPKR, formatRelative } from "@/lib/utils/format";
import { ALLOWED_TRANSITIONS, REASON_REQUIRED, nextStatus } from "@/lib/validation/order";
import { addOrderNoteAction, updateOrderStatusAction } from "@/server/actions/orders";
import { ProductThumb } from "@/components/products/product-card-preview";
import type { Order, OrderStatus } from "@/types";
import { ORDER_STATUS_LABEL, OrderStatusChip, PAYMENT_METHOD_LABEL, PaymentChip } from "./status-chip";

const TIMELINE_ORDER: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
];

export function OrderDetail({
  order,
  canWrite,
  canRefund,
  storeName,
  supportPhone,
}: {
  order: Order;
  canWrite: boolean;
  canRefund: boolean;
  storeName: string;
  supportPhone: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<null | OrderStatus>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [refundAmount, setRefundAmount] = useState(String(order.totals.grandTotal));
  const [noteDraft, setNoteDraft] = useState("");
  const [celebrate, setCelebrate] = useState(false);

  const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
  const forward = nextStatus(order.status);
  const terminal = order.status === "cancelled" || order.status === "refunded";
  const currentIndex = TIMELINE_ORDER.indexOf(order.status);

  const applyStatus = (status: OrderStatus) => {
    startTransition(async () => {
      const result = await updateOrderStatusAction({
        orderId: order.id,
        status,
        reason: reason.trim() || undefined,
        note: note.trim() || undefined,
        refundAmount: status === "refunded" ? Number(refundAmount) : undefined,
      });
      if (result.ok) {
        toast.success(result.message ?? "Updated");
        setDialog(null);
        setReason("");
        setNote("");
        if (status === "delivered") {
          setCelebrate(true);
          window.setTimeout(() => setCelebrate(false), 900);
        }
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const requestStatus = (status: OrderStatus) => {
    if (REASON_REQUIRED.includes(status)) {
      setDialog(status);
      return;
    }
    applyStatus(status);
  };

  const addNote = () => {
    startTransition(async () => {
      const result = await addOrderNoteAction({ orderId: order.id, note: noteDraft });
      if (result.ok) {
        toast.success("Note added");
        setNoteDraft("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const print = () => window.print();

  return (
    <>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          {/* Status timeline */}
          <Card>
            <CardHeader
              title="Fulfilment"
              subtitle={
                terminal
                  ? `This order is ${ORDER_STATUS_LABEL[order.status].toLowerCase()} — no further transitions are allowed`
                  : "Only valid next steps are offered; invalid jumps are blocked"
              }
              action={<OrderStatusChip status={order.status} />}
            />
            <CardBody>
              <ol className="mb-5 flex flex-wrap items-center gap-1.5">
                {TIMELINE_ORDER.map((status, index) => {
                  const done = currentIndex >= 0 && index <= currentIndex;
                  const active = status === order.status;
                  return (
                    <li key={status} className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap",
                          active && "border-[var(--hm-cyan-400)] bg-[var(--hm-cyan-50)] text-[var(--hm-cyan-800)]",
                          done && !active && "border-[var(--hm-success-100)] bg-[var(--hm-success-50)] text-[var(--hm-success-700)]",
                          !done && "border-[var(--hm-border)] text-[var(--hm-ink-400)]",
                        )}
                      >
                        {done && !active ? <Check className="size-3" /> : null}
                        {ORDER_STATUS_LABEL[status]}
                      </span>
                      {index < TIMELINE_ORDER.length - 1 ? (
                        <span aria-hidden className="h-px w-3 bg-[var(--hm-border-strong)]" />
                      ) : null}
                    </li>
                  );
                })}
              </ol>

              {canWrite && !terminal ? (
                <div className="flex flex-wrap gap-2">
                  {forward && allowed.includes(forward) ? (
                    <Button
                      onClick={() => requestStatus(forward)}
                      loading={pending}
                      className={cn("relative overflow-hidden", celebrate && "hm-sweep")}
                    >
                      <ArrowRight className="size-4" />
                      Mark {ORDER_STATUS_LABEL[forward].toLowerCase()}
                    </Button>
                  ) : null}
                  {allowed
                    .filter((s) => s !== forward)
                    .map((status) => (
                      <Button
                        key={status}
                        variant={status === "cancelled" || status === "refunded" ? "outline" : "secondary"}
                        onClick={() => requestStatus(status)}
                        disabled={pending || (status === "refunded" && !canRefund)}
                      >
                        {status === "cancelled" ? <Ban className="size-4" /> : null}
                        {status === "refunded" ? <RotateCcw className="size-4" /> : null}
                        {ORDER_STATUS_LABEL[status]}
                      </Button>
                    ))}
                </div>
              ) : null}

              {order.cancelReason ? (
                <p className="mt-3 rounded-[var(--hm-radius-control)] border border-[var(--hm-danger-100)] bg-[var(--hm-danger-50)] px-3 py-2 text-[12.5px] text-[var(--hm-danger-700)]">
                  Cancelled: {order.cancelReason}
                </p>
              ) : null}
              {order.refundAmount ? (
                <p className="mt-3 rounded-[var(--hm-radius-control)] border border-[var(--hm-border)] bg-[var(--hm-ink-50)] px-3 py-2 text-[12.5px] text-[var(--hm-ink-700)]">
                  Refunded {formatPKR(order.refundAmount)}
                </p>
              ) : null}
            </CardBody>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader
              title={`Items (${order.items.length})`}
              subtitle="Snapshot taken when the order was placed — editing a product never changes it"
            />
            <TableScroll>
              <Table className="min-w-[560px]">
                <thead>
                  <tr>
                    <Th>Product</Th>
                    <Th align="right">Unit price</Th>
                    <Th align="right">Qty</Th>
                    <Th align="right">Line total</Th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <Tr key={`${item.productId}-${item.sku}`}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <ProductThumb imageUrl={item.imageUrl} emoji={item.emojiFallback} size={36} />
                          <div className="min-w-0">
                            <Link
                              href={`/products/${item.productId}`}
                              className="block truncate text-[13px] font-semibold text-[var(--hm-ink-900)] hover:text-[var(--hm-cyan-700)]"
                            >
                              {item.name}
                            </Link>
                            <span className="text-[11.5px] text-[var(--hm-ink-500)]">
                              <code className="font-mono">{item.sku}</code> · {item.unitLabel}
                            </span>
                          </div>
                        </div>
                      </Td>
                      <Td align="right" className="whitespace-nowrap">
                        {formatPKR(item.price)}
                        {item.compareAtPrice && item.compareAtPrice > item.price ? (
                          <span className="ml-1.5 text-[11px] text-[var(--hm-ink-400)] line-through">
                            {formatPKR(item.compareAtPrice)}
                          </span>
                        ) : null}
                      </Td>
                      <Td align="right" className="tabular-nums">{item.quantity}</Td>
                      <Td align="right" className="font-semibold whitespace-nowrap text-[var(--hm-ink-900)]">
                        {formatPKR(item.lineTotal)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableScroll>
            <CardBody className="border-t border-[var(--hm-border)]">
              <dl className="ml-auto flex max-w-[280px] flex-col gap-1.5 text-[13px]">
                <Line label="Subtotal" value={formatPKR(order.totals.subtotal)} />
                {order.totals.discount > 0 ? (
                  <Line label={`Discount${order.couponCode ? ` (${order.couponCode})` : ""}`} value={`−${formatPKR(order.totals.discount)}`} />
                ) : null}
                <Line label="Delivery" value={order.totals.deliveryFee === 0 ? "Free" : formatPKR(order.totals.deliveryFee)} />
                {order.totals.tax > 0 ? <Line label="Tax" value={formatPKR(order.totals.tax)} /> : null}
                <div className="mt-1 flex justify-between border-t border-[var(--hm-border)] pt-2 text-[15px] font-bold text-[var(--hm-ink-900)]">
                  <dt>Total</dt>
                  <dd>{formatPKR(order.totals.grandTotal)}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader title="Audit timeline" subtitle="Every change records actor and timestamp" />
            <ol className="divide-y divide-[var(--hm-border)]">
              <AnimatePresence initial={false}>
                {[...order.events].reverse().map((event) => (
                  <motion.li
                    key={event.id}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-3 px-5 py-3"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[8px]",
                        event.type === "note"
                          ? "bg-[var(--hm-ink-100)] text-[var(--hm-ink-600,#475569)]"
                          : event.type === "refund"
                            ? "bg-[var(--hm-danger-50)] text-[var(--hm-danger-700)]"
                            : "bg-[var(--hm-cyan-50)] text-[var(--hm-cyan-700)]",
                      )}
                    >
                      {event.type === "note" ? <StickyNote className="size-3.5" /> : <Clock className="size-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-[var(--hm-ink-800)]">
                        {event.type === "note" ? (
                          <span>{event.note}</span>
                        ) : (
                          <span>
                            {event.from ? `${ORDER_STATUS_LABEL[event.from]} → ` : ""}
                            <strong className="font-semibold">
                              {event.to ? ORDER_STATUS_LABEL[event.to] : "Updated"}
                            </strong>
                          </span>
                        )}
                      </p>
                      {event.reason ? (
                        <p className="text-[12px] text-[var(--hm-ink-500)]">Reason: {event.reason}</p>
                      ) : null}
                      {event.note && event.type !== "note" ? (
                        <p className="text-[12px] text-[var(--hm-ink-500)]">{event.note}</p>
                      ) : null}
                      <p className="mt-0.5 text-[11px] text-[var(--hm-ink-400)]">
                        {event.actorName} · {formatDateTime(event.createdAt)}
                      </p>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
            {canWrite ? (
              <CardBody className="border-t border-[var(--hm-border)]">
                <Field label="Add an activity note" htmlFor="order-note" hint="Visible to staff for handoff">
                  <div className="flex gap-2">
                    <Input
                      id="order-note"
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="Customer asked to deliver after 6pm"
                    />
                    <Button onClick={addNote} disabled={!noteDraft.trim() || pending} loading={pending}>
                      Add
                    </Button>
                  </div>
                </Field>
              </CardBody>
            ) : null}
          </Card>
        </div>

        {/* Rail */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Customer" />
            <CardBody className="flex flex-col gap-2.5 text-[13px]">
              <Row icon={<User className="size-3.5" />}>{order.customer.fullName}</Row>
              <Row icon={<Phone className="size-3.5" />}>
                <a href={`tel:${order.customer.phone}`} className="hover:text-[var(--hm-cyan-700)]">
                  {order.customer.phone}
                </a>
              </Row>
              <Row icon={<MapPin className="size-3.5" />}>
                {order.address.line1}
                {order.address.society ? `, ${order.address.society}` : ""}, {order.address.city}
              </Row>
              {order.address.notes ? (
                <Row icon={<StickyNote className="size-3.5" />}>{order.address.notes}</Row>
              ) : null}
              {order.customer.uid ? (
                <Link
                  href={`/customers/${order.customer.uid}`}
                  className="mt-1 text-[12.5px] font-semibold text-[var(--hm-cyan-700)] hover:underline"
                >
                  View customer profile
                </Link>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Payment & delivery" />
            <CardBody className="flex flex-col gap-2.5 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-[var(--hm-ink-500)]">Method</span>
                <span className="font-medium">{PAYMENT_METHOD_LABEL[order.paymentMethod]}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--hm-ink-500)]">Payment</span>
                <PaymentChip status={order.paymentStatus} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--hm-ink-500)]">Source</span>
                {order.source === "voice" ? (
                  <Chip tone="violet" icon={<Mic className="size-3" />}>Voice</Chip>
                ) : (
                  <Chip tone="neutral">Cart</Chip>
                )}
              </div>
              {order.estimatedDeliveryMinutes ? (
                <div className="flex items-center justify-between">
                  <span className="text-[var(--hm-ink-500)]">ETA</span>
                  <span className="font-medium">{order.estimatedDeliveryMinutes} min</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="text-[var(--hm-ink-500)]">Stock</span>
                <span className="font-medium">
                  {order.stockReserved ? "Reserved" : "Not reserved"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--hm-ink-500)]">Placed</span>
                <span className="font-medium" title={formatDateTime(order.createdAt)}>
                  {formatRelative(order.createdAt)}
                </span>
              </div>
              {order.voiceOrderId ? (
                <Link
                  href={`/voice-orders/${order.voiceOrderId}`}
                  className="mt-1 text-[12.5px] font-semibold text-[var(--hm-cyan-700)] hover:underline"
                >
                  Open the original voice request
                </Link>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Documents" />
            <CardBody className="flex flex-col gap-2">
              <Button variant="outline" onClick={print} className="w-full">
                <Printer className="size-4" />
                Print packing slip
              </Button>
              <Button variant="outline" onClick={print} className="w-full">
                <FileText className="size-4" />
                Print invoice
              </Button>
              <p className="text-[11px] text-[var(--hm-ink-400)]">
                Both print the order sheet below, headed {storeName}
                {supportPhone ? ` · ${supportPhone}` : ""}.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Printable sheet — hidden on screen, laid out for paper */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold">{storeName}</h1>
        <p className="text-sm">
          Order {order.displayId} · {formatDateTime(order.createdAt)}
        </p>
        <p className="text-sm">
          {order.customer.fullName} · {order.customer.phone}
          <br />
          {order.address.line1}
          {order.address.society ? `, ${order.address.society}` : ""}, {order.address.city}
        </p>
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b py-1 text-left">Item</th>
              <th className="border-b py-1 text-right">Qty</th>
              <th className="border-b py-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.sku}>
                <td className="border-b py-1">{item.name} ({item.unitLabel})</td>
                <td className="border-b py-1 text-right">{item.quantity}</td>
                <td className="border-b py-1 text-right">{formatPKR(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-right text-base font-bold">
          Total {formatPKR(order.totals.grandTotal)} · {PAYMENT_METHOD_LABEL[order.paymentMethod]}
        </p>
      </div>

      {/* Reason capture for cancel / refund */}
      <Dialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog === "refunded" ? "Refund this order" : "Cancel this order"}
        description="The reason is recorded on the order timeline and in the audit log."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={pending}>
              Keep order
            </Button>
            <Button
              variant="danger"
              onClick={() => dialog && applyStatus(dialog)}
              loading={pending}
              disabled={!reason.trim()}
            >
              {dialog === "refunded" ? "Refund" : "Cancel order"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {dialog === "refunded" ? (
            <Field label="Refund amount (PKR)" htmlFor="refund" hint={`Order total is ${formatPKR(order.totals.grandTotal)}`}>
              <Input
                id="refund"
                type="number"
                min={0}
                max={order.totals.grandTotal}
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
              />
            </Field>
          ) : null}
          <Field label="Reason" htmlFor="reason" required>
            <Textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={dialog === "refunded" ? "Item damaged on delivery" : "Customer not reachable"}
            />
          </Field>
          <Field label="Internal note" htmlFor="cancel-note" hint="Optional, for the team">
            <Input id="cancel-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {order.stockReserved && dialog === "cancelled" ? (
            <p className="rounded-[var(--hm-radius-control)] bg-[var(--hm-cyan-50)] px-3 py-2 text-[12px] text-[var(--hm-cyan-800)]">
              <Receipt className="mr-1 inline size-3.5" />
              Reserved stock for this order will be released automatically.
            </p>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-[var(--hm-ink-500)]">{label}</dt>
      <dd className="font-medium text-[var(--hm-ink-800)]">{value}</dd>
    </div>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[var(--hm-ink-700)]">
      <span className="mt-0.5 shrink-0 text-[var(--hm-ink-400)]">{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  );
}
