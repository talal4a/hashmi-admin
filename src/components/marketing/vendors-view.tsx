"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";
import { Table, TableScroll, Td, Th, Tr } from "@/components/ui/table";
import { deleteVendorAction, saveVendorAction } from "@/server/actions/marketing";
import type { Society, Vendor } from "@/types";

const TONE: Record<Vendor["status"], ChipTone> = {
  active: "success",
  paused: "warning",
  disabled: "neutral",
};

export function VendorsView({
  vendors,
  societies,
  productCounts,
  canWrite,
}: {
  vendors: Vendor[];
  societies: Society[];
  productCounts: Record<string, number>;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Partial<Vendor> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<Vendor | null>(null);

  const save = () => {
    if (!draft) return;
    setErrors({});
    startTransition(async () => {
      const result = await saveVendorAction({
        ...draft,
        contactName: draft.contactName || null,
        phone: draft.phone || null,
        email: draft.email || null,
        openingHours: draft.openingHours || null,
        logoUrl: draft.logoUrl || null,
        serviceAreaSocietyIds: draft.serviceAreaSocietyIds ?? [],
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
      const result = await deleteVendorAction(removing.id);
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
          title="Vendors & stores"
          subtitle="Products are assigned to one or more of these; analytics and queues can be filtered by vendor"
          action={
            canWrite ? (
              <Button size="sm" onClick={() => setDraft(blank())}>
                <Plus className="size-4" />
                Add vendor
              </Button>
            ) : null
          }
        />
        {vendors.length === 0 ? (
          <EmptyState
            title="No vendors yet"
            message="Add a store so products can be assigned to it."
            icon={<Store className="size-5" />}
          />
        ) : (
          <TableScroll>
            <Table className="min-w-[820px]">
              <thead>
                <tr>
                  <Th>Vendor</Th>
                  <Th>Contact</Th>
                  <Th>Service area</Th>
                  <Th>Hours</Th>
                  <Th align="right">Products</Th>
                  <Th>Status</Th>
                  {canWrite ? <Th align="right">Actions</Th> : null}
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => (
                  <Tr key={vendor.id}>
                    <Td className="font-semibold text-[var(--hm-ink-900)]">{vendor.name}</Td>
                    <Td className="text-[12px] text-[var(--hm-ink-500)]">
                      {vendor.contactName ?? "—"}
                      {vendor.phone ? <><br />{vendor.phone}</> : null}
                    </Td>
                    <Td className="text-[12px] text-[var(--hm-ink-500)]">
                      {vendor.serviceAreaSocietyIds.length === societies.length
                        ? "All areas"
                        : vendor.serviceAreaSocietyIds
                            .map((id) => societies.find((s) => s.id === id)?.name ?? id)
                            .join(", ") || "None"}
                    </Td>
                    <Td className="text-[12px] whitespace-nowrap text-[var(--hm-ink-500)]">
                      {vendor.openingHours ?? "—"}
                    </Td>
                    <Td align="right" className="tabular-nums">
                      <Link
                        href={`/products?vendor=${vendor.id}`}
                        className="hover:text-[var(--hm-cyan-700)] hover:underline"
                      >
                        {productCounts[vendor.id] ?? 0}
                      </Link>
                    </Td>
                    <Td>
                      <Chip tone={TONE[vendor.status]}>{vendor.status}</Chip>
                    </Td>
                    {canWrite ? (
                      <Td align="right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="outline" size="sm" onClick={() => setDraft(vendor)}>Edit</Button>
                          <button
                            type="button"
                            onClick={() => setRemoving(vendor)}
                            aria-label={`Remove ${vendor.name}`}
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
        title={draft?.id ? `Edit ${draft.name}` : "Add vendor"}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={pending}>Cancel</Button>
            <Button onClick={save} loading={pending}>Save vendor</Button>
          </>
        }
      >
        {draft ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="v-name" required error={errors.name} className="sm:col-span-2">
              <Input
                id="v-name"
                value={draft.name ?? ""}
                invalid={Boolean(errors.name)}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="HashmiMart DHA Outlet"
              />
            </Field>
            <Field label="Contact name" htmlFor="v-contact">
              <Input
                id="v-contact"
                value={draft.contactName ?? ""}
                onChange={(e) => setDraft({ ...draft, contactName: e.target.value })}
              />
            </Field>
            <Field label="Phone" htmlFor="v-phone">
              <Input
                id="v-phone"
                value={draft.phone ?? ""}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
            </Field>
            <Field label="Email" htmlFor="v-email" error={errors.email}>
              <Input
                id="v-email"
                type="email"
                value={draft.email ?? ""}
                invalid={Boolean(errors.email)}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </Field>
            <Field label="Opening hours" htmlFor="v-hours">
              <Input
                id="v-hours"
                value={draft.openingHours ?? ""}
                onChange={(e) => setDraft({ ...draft, openingHours: e.target.value })}
                placeholder="09:00 – 22:00 daily"
              />
            </Field>
            <Field label="Status" htmlFor="v-status" className="sm:col-span-2">
              <Select
                id="v-status"
                value={draft.status ?? "active"}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as Vendor["status"] })}
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="disabled">Disabled</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <p className="mb-2 text-[12.5px] font-semibold text-[var(--hm-ink-700)]">Service area</p>
              <div className="flex flex-wrap gap-2.5">
                {societies.map((society) => (
                  <label key={society.id} className="flex items-center gap-1.5">
                    <Checkbox
                      checked={(draft.serviceAreaSocietyIds ?? []).includes(society.id)}
                      onChange={(next) =>
                        setDraft({
                          ...draft,
                          serviceAreaSocietyIds: next
                            ? [...(draft.serviceAreaSocietyIds ?? []), society.id]
                            : (draft.serviceAreaSocietyIds ?? []).filter((id) => id !== society.id),
                        })
                      }
                    />
                    <span className="text-[12.5px] text-[var(--hm-ink-700)]">{society.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        title={`Remove ${removing?.name ?? "vendor"}?`}
        message="Removal is blocked while products are still assigned to this vendor."
        confirmLabel="Remove"
        loading={pending}
      />
    </>
  );
}

function blank(): Partial<Vendor> {
  return {
    name: "",
    status: "active",
    contactName: null,
    phone: null,
    email: null,
    serviceAreaSocietyIds: [],
    openingHours: null,
    logoUrl: null,
  };
}
