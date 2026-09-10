"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertPermission } from "@/lib/auth/require-admin";
import { ALL_ROLES } from "@/lib/auth/permissions";
import { recordAudit } from "@/server/repositories/audit";
import { newId, nowIso } from "@/server/repositories/base";
import { deleteAdmin, listAdmins, saveAdmin, updateAdmin } from "@/server/repositories/misc";
import type { AdminUser, Role } from "@/types";
import { fail, failure, ok, type ActionResult } from "./result";

const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  displayName: z.string().trim().min(2, "Enter a name").max(80),
  role: z.enum(ALL_ROLES as [Role, ...Role[]]),
});

/**
 * Provisions an admin record. The person still signs in through Firebase Auth
 * with their own credentials — no password is ever set or stored here (§10.1).
 */
export async function inviteAdminAction(raw: unknown): Promise<ActionResult<{ uid: string }>> {
  try {
    const actor = await assertPermission("admins.write");
    const parsed = inviteSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid invite.");

    const { email, displayName, role } = parsed.data;
    const existing = (await listAdmins()).find(
      (a) => a.email.toLowerCase() === email.toLowerCase(),
    );
    if (existing) return fail("An admin with that email already exists.");

    const admin: AdminUser = {
      // Replaced with the Firebase Auth uid on that account's first sign-in.
      uid: newId("adm"),
      email,
      displayName,
      role,
      active: true,
      createdAt: nowIso(),
    };

    await saveAdmin(admin);
    await recordAudit({
      actor,
      action: "admin.invite",
      entityType: "admin",
      entityId: email,
      beforeSummary: null,
      afterSummary: `role: ${role}`,
    });

    revalidatePath("/admins");
    return ok({ uid: admin.uid }, `${displayName} can now sign in as ${role.replace(/_/g, " ")}`);
  } catch (error) {
    return failure(error);
  }
}

const roleSchema = z.object({
  uid: z.string().min(1),
  role: z.enum(ALL_ROLES as [Role, ...Role[]]),
  reason: z.string().trim().min(3, "A reason is required for a role change"),
});

/** Role changes are among the most security-sensitive actions (PRD §10.3). */
export async function changeRoleAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const actor = await assertPermission("admins.write");
    const parsed = roleSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid role change.");

    const { uid, role, reason } = parsed.data;
    const admins = await listAdmins();
    const target = admins.find((a) => a.uid === uid);
    if (!target) return fail("That admin no longer exists.");

    // Never let the last active super admin demote themselves out of existence.
    if (target.role === "super_admin" && role !== "super_admin") {
      const remaining = admins.filter(
        (a) => a.role === "super_admin" && a.active && a.uid !== uid,
      ).length;
      if (remaining === 0) {
        return fail("This is the last active super admin. Promote someone else first.");
      }
    }

    await updateAdmin(uid, { role });
    await recordAudit({
      actor,
      action: "role.change",
      entityType: "admin",
      entityId: target.email,
      beforeSummary: target.role,
      afterSummary: role,
      reason,
    });

    revalidatePath("/admins");
    return ok(undefined, `${target.displayName} is now ${role.replace(/_/g, " ")}`);
  } catch (error) {
    return failure(error);
  }
}

const activeSchema = z.object({
  uid: z.string().min(1),
  active: z.boolean(),
  reason: z.string().trim().min(3, "A reason is required"),
});

export async function setAdminActiveAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const actor = await assertPermission("admins.write");
    const parsed = activeSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid change.");

    const { uid, active, reason } = parsed.data;
    if (uid === actor.uid && !active) {
      return fail("You cannot disable your own account.");
    }

    const admins = await listAdmins();
    const target = admins.find((a) => a.uid === uid);
    if (!target) return fail("That admin no longer exists.");

    if (!active && target.role === "super_admin") {
      const remaining = admins.filter(
        (a) => a.role === "super_admin" && a.active && a.uid !== uid,
      ).length;
      if (remaining === 0) {
        return fail("This is the last active super admin and cannot be disabled.");
      }
    }

    await updateAdmin(uid, { active });
    await recordAudit({
      actor,
      action: active ? "admin.enable" : "admin.disable",
      entityType: "admin",
      entityId: target.email,
      beforeSummary: target.active ? "active" : "disabled",
      afterSummary: active ? "active" : "disabled",
      reason,
    });

    revalidatePath("/admins");
    return ok(undefined, active ? "Access restored" : "Access revoked");
  } catch (error) {
    return failure(error);
  }
}

export async function removeAdminAction(
  uid: string,
  reason: string,
): Promise<ActionResult<undefined>> {
  try {
    const actor = await assertPermission("admins.write");
    if (!reason.trim()) return fail("A reason is required.");
    if (uid === actor.uid) return fail("You cannot remove your own account.");

    const admins = await listAdmins();
    const target = admins.find((a) => a.uid === uid);
    if (!target) return fail("That admin no longer exists.");
    if (target.active) return fail("Disable the account before removing it.");

    await deleteAdmin(uid);
    await recordAudit({
      actor,
      action: "admin.remove",
      entityType: "admin",
      entityId: target.email,
      beforeSummary: `${target.role} · disabled`,
      afterSummary: "removed",
      reason: reason.trim(),
    });

    revalidatePath("/admins");
    return ok(undefined, `${target.displayName} removed`);
  } catch (error) {
    return failure(error);
  }
}
