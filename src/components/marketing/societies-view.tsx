"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPinned, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Switch } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";
import { Table, TableScroll, Td, Th, Tr } from "@/components/ui/table";
import { formatNumber, formatPKR } from "@/lib/utils/format";
import { deleteSocietyAction, saveSocietyAction } from "@/server/actions/marketing";
import type { Society } from "@/types";

/**
 * Delivery areas — carried forward from the existing HashmiMart storefront,
 * where customers pick their "society" at checkout.
 */
export function SocietiesView({
  societies,
  orderCounts,
  canWrite,
}: {
  societies: Society[];
  orderCounts: Record<string, number>;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Partial<Society> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<Society | null>(null);

  const save = () => {
    if (!draft) return;
    setErrors({});
    startTransition(async () => {
      const result = await saveSocietyAction({
        ...draft,
        deliveryFee: Number(draft.deliveryFee ?? 0),
        freeDeliveryThreshold: draft.freeDeliveryThreshold ?? null,
        estimatedMinutes: Number(draft.estimatedMinutes ?? 30),
        sortOrder: draft.sortOrder ?? societies.length + 1,
        active: draft.active ?? true,
      });
      if (result.ok) {
        toast.success(result.message ?? "Saved");
        setDraft(null);
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    });
  };

  const remove = () => {
    if (!removing) return;
    startTransition(async () => {
      const result = await deleteSocietyAction(removing.id);
      if (result.ok) {
        toast.success(result.message ?? "Removed");
        setRemoving(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      <Card>
        <CardHeader
          title="Delivery areas"
          subtitle="Customers pick one of these at checkout; the fee and ETA come from here"
          action={
            canWrite ? (
              <Button size="sm" onClick={() => setDraft(blank(societies.length + 1))}>
                <Plus className="size-4" />
                Add area
              </Button>
            ) : null
          }
        />
        {societies.length === 0 ? (
          <EmptyState
            title="No delivery areas yet"
            message="Add one so customers can choose it at checkout."
            icon={<MapPinned className="size-5" />}
          />
        ) : (
          <TableScroll>
            <Table className="min-w-[760px]">
              <thead>
                <tr>
                  <Th>Area</Th>
                  <Th>City</Th>
                  <Th align="right">Delivery fee</Th>
                  <Th align="right">Free over</Th>
                  <Th align="right">ETA</Th>
                  <Th align="right">Orders</Th>
                  <Th>Status</Th>
                  {canWrite ? <Th align="right">Actions</Th> : null}
                </tr>
              </thead>
              <tbody>
                {societies.map((society) => (
                  <Tr key={society.id}>
                    <Td className="font-semibold text-[var(--hm-ink-900)]">{society.name}</Td>
                    <Td>{society.city}</Td>
                    <Td align="right" className="whitespace-nowrap">
                      {society.deliveryFee === 0 ? "Free" : formatPKR(society.deliveryFee)}
                    </Td>
                    <Td align="right" className="whitespace-nowrap">
                      {society.freeDeliveryThreshold ? formatPKR(society.freeDeliveryThreshold) : "—"}
                    </Td>
                    <Td align="right" className="tabular-nums">{society.estimatedMinutes} min</Td>
                    <Td align="right" className="tabular-nums">
                      {formatNumber(orderCounts[society.name] ?? 0)}
                    </Td>
                    <Td>
                      <Chip tone={society.active ? "success" : "neutral"}>
                        {society.active ? "Active" : "Paused"}
                      </Chip>
                    </Td>
                    {canWrite ? (
                      <Td align="right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="outline" size="sm" onClick={() => setDraft(society)}>
                            Edit
                          </Button>
                          <button
                            type="button"
                            onClick={() => setRemoving(society)}
                            aria-label={`Remove ${society.name}`}
                            className="rounded-[8px] p-1.5 text-[var(--hm-ink-400)] transition-colors hover:bg-[var(--hm-danger-50)] hover:text-[var(--hm-danger-700)]"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </Td>
                    ) : null}
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableScroll>
        )}
      </Card>

      <Dialog
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? `Edit ${draft.name}` : "Add delivery area"}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={pending}>Cancel</Button>
            <Button onClick={save} loading={pending}>Save area</Button>
          </>
        }
      >
        {draft ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Area name" htmlFor="s-name" required error={errors.name}>
              <Input
                id="s-name"
                value={draft.name ?? ""}
                invalid={Boolean(errors.name)}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="DHA Phase 5"
              />
            </Field>
            <Field label="City" htmlFor="s-city" required error={errors.city}>
              <Input
                id="s-city"
                value={draft.city ?? "Lahore"}
                invalid={Boolean(errors.city)}
                onChange={(e) => setDraft({ ...draft, city: e.target.value })}
              />
            </Field>
            <Field label="Delivery fee (PKR)" htmlFor="s-fee" required>
              <Input
                id="s-fee"
                type="number"
                min={0}
                value={draft.deliveryFee ?? 0}
                onChange={(e) => setDraft({ ...draft, deliveryFee: Number(e.target.value) })}
              />
            </Field>
            <Field label="Free delivery over (PKR)" htmlFor="s-free" hint="Blank means never free">
              <Input
                id="s-free"
                type="number"
                min={0}
                value={draft.freeDeliveryThreshold ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    freeDeliveryThreshold: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Estimated delivery (minutes)" htmlFor="s-eta" required error={errors.estimatedMinutes}>
              <Input
                id="s-eta"
                type="number"
                min={1}
                value={draft.estimatedMinutes ?? 30}
                invalid={Boolean(errors.estimatedMinutes)}
                onChange={(e) => setDraft({ ...draft, estimatedMinutes: Number(e.target.value) })}
              />
            </Field>
            <Field label="Sort order" htmlFor="s-order">
              <Input
                id="s-order"
                type="number"
                min={0}
                value={draft.sortOrder ?? 0}
                onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Switch
                checked={draft.active ?? true}
                onChange={(active) => setDraft({ ...draft, active })}
                label="Accepting orders"
                description="Turn off to stop offering this area at checkout without deleting it."
              />
            </div>
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        title={`Remove ${removing?.name ?? "area"}?`}
        message="Past orders keep their own area snapshot. Deletion is blocked while open orders are still delivering here."
        confirmLabel="Remove"
        loading={pending}
      />
    </>
  );
}

function blank(sortOrder: number): Partial<Society> {
  return {
    name: "",
    city: "Lahore",
    deliveryFee: 120,
    freeDeliveryThreshold: 2500,
    estimatedMinutes: 40,
    active: true,
    sortOrder,
  };
}
