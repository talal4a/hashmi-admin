"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertPermission } from "@/lib/auth/require-admin";
import { recordAudit } from "@/server/repositories/audit";
import { newId, nowIso } from "@/server/repositories/base";
import {
  listNotifications,
  markNotificationsRead,
  saveNotification,
} from "@/server/repositories/misc";
import type { NotificationRecord } from "@/types";
import { fail, failure, ok, type ActionResult } from "./result";

const campaignSchema = z.object({
  title: z.string().trim().min(3, "Give the campaign a title").max(80),
  message: z.string().trim().min(5, "Write the message body").max(300),
  audience: z.enum(["staff", "customer", "segment"]),
  send: z.boolean(),
});

/**
 * Admin-created campaigns (PRD §2.1 Notifications).
 *
 * The record is written here; actual FCM delivery is handled by the messaging
 * integration, so a campaign that has not been dispatched stays `queued` rather
 * than claiming to have been sent.
 */
export async function createCampaignAction(
  raw: unknown,
): Promise<ActionResult<{ id: string; status: NotificationRecord["status"] }>> {
  try {
    const actor = await assertPermission("notifications.write");
    const parsed = campaignSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid campaign.");

    const { title, message, audience, send } = parsed.data;
    const now = nowIso();

    const record: NotificationRecord = {
      id: newId("ntf"),
      kind: "campaign",
      audience,
      title,
      message,
      orderId: null,
      // Nothing claims to be delivered until the messaging integration confirms it.
      status: send ? "queued" : "draft",
      isRead: false,
      sentAt: null,
      createdAt: now,
    };

    await saveNotification(record);
    await recordAudit({
      actor,
      action: send ? "notification.queue" : "notification.draft",
      entityType: "notification",
      entityId: record.id,
      beforeSummary: null,
      afterSummary: `${audience} · ${title}`,
    });

    revalidatePath("/notifications");
    return ok(
      { id: record.id, status: record.status },
      send ? "Campaign queued for delivery" : "Draft saved",
    );
  } catch (error) {
    return failure(error);
  }
}

export async function markAllReadAction(): Promise<ActionResult<{ count: number }>> {
  try {
    await assertPermission("notifications.view");
    const all = await listNotifications();
    const unread = all.filter((n) => !n.isRead).map((n) => n.id);
    if (unread.length === 0) return ok({ count: 0 }, "Nothing unread");

    await markNotificationsRead(unread);
    revalidatePath("/notifications");
    revalidatePath("/dashboard");
    return ok({ count: unread.length }, `${unread.length} marked as read`);
  } catch (error) {
    return failure(error);
  }
}

export async function markReadAction(id: string): Promise<ActionResult<undefined>> {
  try {
    await assertPermission("notifications.view");
    await markNotificationsRead([id]);
    revalidatePath("/notifications");
    revalidatePath("/dashboard");
    return ok(undefined);
  } catch (error) {
    return failure(error);
  }
}
