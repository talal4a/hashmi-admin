import "server-only";

import { forbidden, redirect, unauthorized } from "next/navigation";
import { can } from "./permissions";
import { getSessionAdmin } from "./session";
import type { AdminUser, Permission } from "@/types";

/**
 * Server-side guards. Every privileged page and server action calls one of
 * these before reading or writing anything (PRD §10.1).
 */

export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getSessionAdmin();
  if (!admin) redirect("/login");
  return admin;
}

export async function requirePermission(permission: Permission): Promise<AdminUser> {
  const admin = await requireAdmin();
  if (!can(admin, permission)) forbidden();
  return admin;
}

/** For server actions and route handlers, where a thrown error is the contract. */
export async function assertPermission(permission: Permission): Promise<AdminUser> {
  const admin = await getSessionAdmin();
  if (!admin) throw new PermissionError("You are signed out. Sign in again to continue.", 401);
  if (!can(admin, permission)) {
    throw new PermissionError("Your role does not allow this action.", 403);
  }
  return admin;
}

export class PermissionError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
    this.name = "PermissionError";
  }
}

export { unauthorized, forbidden };
