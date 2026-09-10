"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth/require-admin";
import { settingsSchema } from "@/lib/validation/settings";
import { recordAudit } from "@/server/repositories/audit";
import { getSettings, saveSettings } from "@/server/repositories/settings";
import type { AppSettings } from "@/types";
import { fail, failure, ok, type ActionResult } from "./result";

/** Summarises what actually changed, so the audit entry is readable. */
function diffSummary(before: AppSettings, after: AppSettings): string {
  const changes: string[] = [];
  const compare = (label: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) changes.push(label);
  };
  compare("store", before.store, after.store);
  compare("delivery", before.delivery, after.delivery);
  compare("tax", before.tax, after.tax);
  compare("payments", before.payments, after.payments);
  compare("catalog", before.catalog, after.catalog);
  compare("voice", before.voice, after.voice);
  compare("feature flags", before.featureFlags, after.featureFlags);
  compare("analytics", before.analytics, after.analytics);
  return changes.length ? changes.join(", ") : "no changes";
}

export async function saveSettingsAction(raw: unknown): Promise<ActionResult<undefined>> {
  try {
    const actor = await assertPermission("settings.write");
    const parsed = settingsSchema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return fail(
        parsed.error.issues[0]?.message ?? "Some settings need attention.",
        fieldErrors,
      );
    }

    const before = await getSettings();
    const after = parsed.data as AppSettings;
    await saveSettings(after);

    await recordAudit({
      actor,
      action: "settings.update",
      entityType: "appConfig",
      entityId: "settings",
      beforeSummary: null,
      afterSummary: `Changed: ${diffSummary(before, after)}`,
    });

    // Settings feed delivery fees, tax and thresholds across the app.
    for (const path of ["/settings", "/dashboard", "/orders", "/inventory", "/analytics"]) {
      revalidatePath(path);
    }

    return ok(undefined, "Settings saved");
  } catch (error) {
    return failure(error);
  }
}
