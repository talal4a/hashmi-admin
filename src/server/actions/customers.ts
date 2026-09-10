"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertPermission } from "@/lib/auth/require-admin";
import { recordAudit } from "@/server/repositories/audit";
import { getCustomer, updateCustomer, updateSupportConversation } from "@/server/repositories/misc";
import { fail, failure, ok, type ActionResult } from "./result";

const noteSchema = z.object({
  customerId: z.string().min(1),
  notes: z.string().trim().max(1000),
});

/** Identity fields stay read-only; staff notes are the editable surface (§9.1). */
export async function saveCustomerNoteAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const actor = await assertPermission("customers.write");
    const parsed = noteSchema.safeParse(raw);
    if (!parsed.success) return fail("Note is too long.");

    const customer = await getCustomer(parsed.data.customerId);
    if (!customer) return fail("That customer no longer exists.");

    await updateCustomer(parsed.data.customerId, { notes: parsed.data.notes || null });
    await recordAudit({
      actor,
      action: "customer.note",
      entityType: "customer",
      entityId: customer.uid,
      beforeSummary: customer.notes ?? null,
      afterSummary: parsed.data.notes || "(cleared)",
    });

    revalidatePath("/customers");
    revalidatePath(`/customers/${parsed.data.customerId}`);
    return ok(undefined, "Note saved");
  } catch (error) {
    return failure(error);
  }
}

const statusSchema = z.object({
  customerId: z.string().min(1),
  status: z.enum(["active", "blocked"]),
  reason: z.string().trim().min(3, "A reason is required for this change"),
});

/** A privileged change, so it demands a reason and writes an audit entry. */
export async function setCustomerStatusAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const actor = await assertPermission("customers.write");
    const parsed = statusSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid change.");

    const customer = await getCustomer(parsed.data.customerId);
    if (!customer) return fail("That customer no longer exists.");

    await updateCustomer(parsed.data.customerId, { status: parsed.data.status });
    await recordAudit({
      actor,
      action: parsed.data.status === "blocked" ? "customer.block" : "customer.unblock",
      entityType: "customer",
      entityId: customer.uid,
      beforeSummary: customer.status,
      afterSummary: parsed.data.status,
      reason: parsed.data.reason,
    });

    revalidatePath("/customers");
    revalidatePath(`/customers/${parsed.data.customerId}`);
    return ok(
      undefined,
      parsed.data.status === "blocked" ? "Customer blocked" : "Customer unblocked",
    );
  } catch (error) {
    return failure(error);
  }
}

export async function setConversationStatusAction(
  id: string,
  status: "open" | "pending" | "resolved",
): Promise<ActionResult<undefined>> {
  try {
    await assertPermission("support.view");
    await updateSupportConversation(id, { status, unread: false });
    revalidatePath("/support");
    return ok(undefined, `Marked ${status}`);
  } catch (error) {
    return failure(error);
  }
}
