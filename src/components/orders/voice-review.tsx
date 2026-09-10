"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Ban,
  Check,
  Minus,
  Plus,
  Save,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatPKR } from "@/lib/utils/format";
import {
  convertVoiceOrderAction,
  rejectVoiceOrderAction,
  saveVoiceCorrectionsAction,
  searchCatalogForVoiceAction,
} from "@/server/actions/voice-orders";
import type { Society, VoiceDetectedItem, VoiceOrder } from "@/types";
import { WaveformPlayer } from "./waveform-player";

interface CatalogMatch {
  id: string;
  name: string;
  unitLabel: string;
  price: number;
  sku: string;
}

/**
 * Voice-order review (PRD §7.2, §14.3).
 *
 * Nothing is auto-confirmed. Items below the configured confidence threshold are
 * visibly flagged, and conversion is blocked until every line is matched to a
 * real catalog product by a person.
 */
export function VoiceReview({
  voiceOrder,
  societies,
  lowConfidenceThreshold,
  canWrite,
}: {
  voiceOrder: VoiceOrder;
  societies: Society[];
  lowConfidenceThreshold: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<VoiceDetectedItem[]>(voiceOrder.detectedItems);
  const [dirty, setDirty] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [converting, setConverting] = useState(false);

  const [address, setAddress] = useState("");
  const [society, setSociety] = useState(voiceOrder.customer.society ?? "");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash_on_delivery");

  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<CatalogMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<number | null>(null);

  const converted = voiceOrder.reviewStatus === "converted";
  const rejected = voiceOrder.reviewStatus === "rejected";
  const readOnly = !canWrite || converted || rejected;

  const unmatched = items.filter((i) => !i.matchedProductId).length;
  const lowConfidence = items.filter((i) => i.confidence < lowConfidenceThreshold).length;

  const estimatedTotal = useMemo(
    () => items.reduce((sum, item) => sum + (item.matchedProductId ? item.quantity : 0), 0),
    [items],
  );

  const runSearch = useCallback((value: string) => {
    if (debounce.current) window.clearTimeout(debounce.current);
    setQuery(value);
    if (value.trim().length < 2) {
      setMatches([]);
      return;
    }
    debounce.current = window.setTimeout(() => {
      setSearching(true);
      void searchCatalogForVoiceAction(value).then((result) => {
        setMatches(result.ok ? result.data : []);
        setSearching(false);
      });
    }, 250);
  }, []);

  const patchItem = (id: string, patch: Partial<VoiceDetectedItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch, corrected: true } : i)));
    setDirty(true);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setDirty(true);
  };

  const saveCorrections = () => {
    startTransition(async () => {
      const result = await saveVoiceCorrectionsAction(voiceOrder.id, items);
      if (result.ok) {
        toast.success("Corrections saved");
        setDirty(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const convert = () => {
    startTransition(async () => {
      const result = await convertVoiceOrderAction({
        voiceOrderId: voiceOrder.id,
        items,
        society: society || null,
        addressLine1: address,
        notes: notes || undefined,
        paymentMethod,
      });
      if (result.ok) {
        toast.success(result.message ?? "Order created");
        setConverting(false);
        router.push(`/orders/${result.data.orderId}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const reject = () => {
    startTransition(async () => {
      const result = await rejectVoiceOrderAction(voiceOrder.id, rejectReason);
      if (result.ok) {
        toast.success(result.message ?? "Rejected");
        setRejecting(false);
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
            <CardHeader
              title="Original recording"
              subtitle="Play the request while checking the detected items"
            />
            <CardBody>
              <WaveformPlayer
                src={voiceOrder.audioUrl}
                waveform={voiceOrder.waveform}
                durationSeconds={voiceOrder.audioDurationSeconds}
                recordedAt={voiceOrder.createdAt}
              />

              {voiceOrder.transcript ? (
                <div className="mt-4">
                  <p className="mb-1.5 flex items-center gap-2 text-[12.5px] font-semibold text-[var(--hm-ink-700)]">
                    Transcript
                    {voiceOrder.transcriptLanguage ? (
                      <Chip tone="neutral">{voiceOrder.transcriptLanguage}</Chip>
                    ) : null}
                  </p>
                  <p className="rounded-[var(--hm-radius-control)] border border-[var(--hm-border)] bg-white px-3.5 py-3 text-[13.5px] leading-relaxed text-[var(--hm-ink-800)]">
                    “{voiceOrder.transcript}”
                  </p>
                </div>
              ) : (
                <p className="mt-4 text-[13px] text-[var(--hm-ink-500)]">
                  No transcript is available for this recording. Listen and enter the items manually.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={`Detected items (${items.length})`}
              subtitle="Correct quantities and match each line to a catalog product"
              action={
                lowConfidence > 0 ? (
                  <Chip tone="warning" icon={<AlertTriangle className="size-3" />}>
                    {lowConfidence} low confidence
                  </Chip>
                ) : null
              }
            />

            {items.length === 0 ? (
              <CardBody>
                <p className="text-[13px] text-[var(--hm-ink-500)]">
                  No items on this request. Add one from the catalog to build the order.
                </p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-[var(--hm-border)]">
                <AnimatePresence initial={false}>
                  {items.map((item) => {
                    const low = item.confidence < lowConfidenceThreshold;
                    return (
                      <motion.li
                        key={item.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, height: 0 }}
                        className={cn(
                          "flex flex-wrap items-center gap-3 px-5 py-3.5",
                          low && !item.matchedProductId && "bg-[var(--hm-warning-50)]/50",
                        )}
                      >
                        <div className="min-w-[180px] flex-1">
                          <p className="flex items-center gap-2 text-[13.5px] font-semibold text-[var(--hm-ink-900)]">
                            {item.matchedProductName ?? item.rawText}
                            {item.corrected ? <Chip tone="cyan">Corrected</Chip> : null}
                          </p>
                          <p className="flex items-center gap-2 text-[11.5px] text-[var(--hm-ink-500)]">
                            <span>Heard: “{item.rawText}”</span>
                            <span
                              className={cn(
                                "font-semibold",
                                low ? "text-[var(--hm-warning-700)]" : "text-[var(--hm-success-700)]",
                              )}
                              title="Detection confidence"
                            >
                              {Math.round(item.confidence * 100)}%
                            </span>
                          </p>
                        </div>

                        {/* Quantity stepper */}
                        <div className="flex items-center gap-1 rounded-[var(--hm-radius-control)] border border-[var(--hm-border)] bg-white">
                          <button
                            type="button"
                            disabled={readOnly}
                            onClick={() =>
                              patchItem(item.id, { quantity: Math.max(0.5, item.quantity - 1) })
                            }
                            aria-label={`Decrease quantity of ${item.matchedProductName ?? item.rawText}`}
                            className="p-1.5 text-[var(--hm-ink-500)] hover:text-[var(--hm-ink-900)] disabled:opacity-40"
                          >
                            <Minus className="size-3.5" />
                          </button>
                          <span className="min-w-[36px] text-center text-[13px] font-semibold tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            disabled={readOnly}
                            onClick={() => patchItem(item.id, { quantity: item.quantity + 1 })}
                            aria-label={`Increase quantity of ${item.matchedProductName ?? item.rawText}`}
                            className="p-1.5 text-[var(--hm-ink-500)] hover:text-[var(--hm-ink-900)] disabled:opacity-40"
                          >
                            <Plus className="size-3.5" />
                          </button>
                        </div>

                        {item.matchedProductId ? (
                          <Chip tone="success" icon={<Check className="size-3" />}>Matched</Chip>
                        ) : (
                          <Chip tone="danger">Unmatched</Chip>
                        )}

                        {!readOnly ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setPickerFor(item.id);
                                runSearch(item.matchedProductName ?? item.rawText);
                              }}
                            >
                              <Search className="size-3.5" />
                              {item.matchedProductId ? "Change" : "Match"}
                            </Button>
                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
                              aria-label={`Remove ${item.rawText}`}
                              className="rounded-[8px] p-1.5 text-[var(--hm-ink-400)] transition-colors hover:bg-[var(--hm-danger-50)] hover:text-[var(--hm-danger-700)]"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        ) : null}
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}

            {!readOnly ? (
              <CardBody className="flex flex-wrap gap-2 border-t border-[var(--hm-border)]">
                <Button
                  variant="outline"
                  onClick={() => {
                    setPickerFor("new");
                    runSearch("");
                  }}
                >
                  <Plus className="size-4" />
                  Add item from catalog
                </Button>
                <Button variant="outline" onClick={saveCorrections} disabled={!dirty} loading={pending}>
                  <Save className="size-4" />
                  Save corrections
                </Button>
              </CardBody>
            ) : null}
          </Card>
        </div>

        {/* Rail */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Customer" />
            <CardBody className="flex flex-col gap-2 text-[13px]">
              <p className="font-semibold text-[var(--hm-ink-900)]">{voiceOrder.customer.fullName}</p>
              <p className="text-[var(--hm-ink-600,#475569)]">{voiceOrder.customer.phone}</p>
              <p className="text-[var(--hm-ink-500)]">{voiceOrder.customer.society ?? "No area on file"}</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Review" />
            <CardBody className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[var(--hm-ink-500)]">Status</span>
                <Chip
                  tone={
                    converted ? "success" : rejected ? "danger" : voiceOrder.reviewStatus === "in_review" ? "info" : "warning"
                  }
                >
                  {voiceOrder.reviewStatus.replace(/_/g, " ")}
                </Chip>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[var(--hm-ink-500)]">Units requested</span>
                <span className="font-semibold tabular-nums">{estimatedTotal}</span>
              </div>

              {converted && voiceOrder.linkedOrderId ? (
                <Link
                  href={`/orders/${voiceOrder.linkedOrderId}`}
                  className="rounded-[var(--hm-radius-control)] bg-[var(--hm-success-50)] px-3 py-2.5 text-[12.5px] font-semibold text-[var(--hm-success-700)] hover:underline"
                >
                  Converted — open the linked order
                </Link>
              ) : null}

              {rejected ? (
                <p className="rounded-[var(--hm-radius-control)] bg-[var(--hm-danger-50)] px-3 py-2.5 text-[12.5px] text-[var(--hm-danger-700)]">
                  Rejected: {voiceOrder.rejectionReason}
                </p>
              ) : null}

              {!readOnly ? (
                <>
                  {unmatched > 0 ? (
                    <p className="flex items-start gap-1.5 rounded-[var(--hm-radius-control)] bg-[var(--hm-warning-50)] px-3 py-2.5 text-[12px] text-[var(--hm-warning-700)]">
                      <AlertTriangle className="mt-px size-3.5 shrink-0" />
                      {unmatched} item{unmatched === 1 ? "" : "s"} still need matching before this can
                      become an order.
                    </p>
                  ) : null}
                  <Button
                    onClick={() => setConverting(true)}
                    disabled={unmatched > 0 || items.length === 0}
                    className="w-full"
                  >
                    <ShoppingCart className="size-4" />
                    Convert to order
                  </Button>
                  <Button variant="outline" onClick={() => setRejecting(true)} className="w-full">
                    <Ban className="size-4" />
                    Reject request
                  </Button>
                </>
              ) : null}

              {voiceOrder.retentionExpiresAt ? (
                <p className="text-[11px] text-[var(--hm-ink-400)]">
                  Audio retained until{" "}
                  {formatDate(voiceOrder.retentionExpiresAt)} under the
                  configured retention policy.
                </p>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Catalog picker */}
      <Dialog
        open={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        title="Match to a catalog product"
        description="Only published products can be added to an order."
        size="md"
      >
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--hm-ink-400)]" />
            <Input
              value={query}
              onChange={(e) => runSearch(e.target.value)}
              placeholder="Search the catalog…"
              aria-label="Search catalog"
              className="pl-9"
              autoFocus
            />
          </div>

          {searching ? (
            <p className="py-6 text-center text-[13px] text-[var(--hm-ink-500)]">Searching…</p>
          ) : matches.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[var(--hm-ink-500)]">
              {query.trim().length < 2 ? "Type at least two characters." : `Nothing matches “${query}”.`}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--hm-border)] rounded-[var(--hm-radius-card)] border border-[var(--hm-border)]">
              {matches.map((match) => (
                <li key={match.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (pickerFor === "new") {
                        setItems((prev) => [
                          ...prev,
                          {
                            id: `manual-${Date.now()}`,
                            rawText: "Added by admin",
                            matchedProductId: match.id,
                            matchedProductName: match.name,
                            quantity: 1,
                            unitLabel: match.unitLabel,
                            confidence: 1,
                            corrected: true,
                          },
                        ]);
                        setDirty(true);
                      } else if (pickerFor) {
                        patchItem(pickerFor, {
                          matchedProductId: match.id,
                          matchedProductName: match.name,
                          unitLabel: match.unitLabel,
                        });
                      }
                      setPickerFor(null);
                      setQuery("");
                      setMatches([]);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--hm-cyan-50)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-[var(--hm-ink-900)]">
                        {match.name}
                      </span>
                      <span className="block text-[11.5px] text-[var(--hm-ink-500)]">
                        <code className="font-mono">{match.sku}</code> · {match.unitLabel}
                      </span>
                    </span>
                    <span className="shrink-0 text-[13px] font-semibold text-[var(--hm-ink-800)]">
                      {formatPKR(match.price)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>

      {/* Conversion */}
      <Dialog
        open={converting}
        onClose={() => setConverting(false)}
        title="Convert to a structured order"
        description="Confirm the delivery details. Totals are computed from live catalog prices."
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setConverting(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={convert} loading={pending} disabled={!address.trim()}>
              <Check className="size-4" />
              Create order
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Delivery address" htmlFor="vo-address" required>
            <Input
              id="vo-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="House 12, Street 3"
            />
          </Field>
          <Field label="Delivery area" htmlFor="vo-society">
            <Select id="vo-society" value={society} onChange={(e) => setSociety(e.target.value)}>
              <option value="">Not set</option>
              {societies.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name} · {formatPKR(s.deliveryFee)} delivery
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Payment method" htmlFor="vo-payment">
            <Select
              id="vo-payment"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="cash_on_delivery">Cash on delivery</option>
              <option value="jazzcash">JazzCash</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank transfer</option>
            </Select>
          </Field>
          <Field label="Notes" htmlFor="vo-notes" hint="Optional delivery instructions">
            <Textarea id="vo-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <p className="rounded-[var(--hm-radius-control)] bg-[var(--hm-cyan-50)] px-3 py-2.5 text-[12px] text-[var(--hm-cyan-800)]">
            The new order starts as <strong>Pending</strong> so it still goes through normal
            confirmation. The voice request keeps a link to it for traceability.
          </p>
        </div>
      </Dialog>

      {/* Rejection */}
      <Dialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Reject this voice request"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRejecting(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={reject} loading={pending} disabled={!rejectReason.trim()}>
              <X className="size-4" />
              Reject
            </Button>
          </>
        }
      >
        <Field label="Reason" htmlFor="vo-reject" required hint="Recorded in the audit log">
          <Textarea
            id="vo-reject"
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Recording was inaudible and the customer could not be reached"
          />
        </Field>
      </Dialog>
    </>
  );
}
