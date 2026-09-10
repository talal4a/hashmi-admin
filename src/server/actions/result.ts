import "server-only";

import { PermissionError } from "@/lib/auth/require-admin";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/**
 * Turns an unexpected throw into a message the admin can act on, without
 * leaking internals. Permission failures keep their own wording.
 */
export function failure(error: unknown): ActionResult<never> {
  if (error instanceof PermissionError) return fail(error.message);
  if (error instanceof Error) {
    console.error("[hashmimart-admin] action failed:", error.message);
    return fail(error.message);
  }
  console.error("[hashmimart-admin] action failed with a non-error value");
  return fail("Something went wrong. Try again.");
}
