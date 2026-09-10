"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Megaphone, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/utils/cn";
import { formatDateTime, formatRelative } from "@/lib/utils/format";
import {
  createCampaignAction,
  markAllReadAction,
  markReadAction,
} from "@/server/actions/notifications";
import type { NotificationRecord } from "@/types";

const STATUS_TONE: Record<NotificationRecord["status"], ChipTone> = {
  sent: "success",
  queued: "info",
  failed: "danger",
  draft: "neutral",
};

const VIEWS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "transactional", label: "Transactional" },
  { key: "campaign", label: "Campaigns" },
] as const;

export function NotificationsView({
  notifications,
  canWrite,
}: {
  notifications: NotificationRecord[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<(typeof VIEWS)[number]["key"]>("all");
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    message: "",
    audience: "customer" as NotificationRecord["audience"],
    send: true,
  });

  const counts = useMemo(
    () => ({
      all: notifications.length,
      unread: notifications.filter((n) => !n.isRead).length,
      transactional: notifications.filter((n) => n.kind === "transactional").length,
      campaign: notifications.filter((n) => n.kind === "campaign").length,
    }),
    [notifications],
  );

  const rows = useMemo(() => {
    if (view === "unread") return notifications.filter((n) => !n.isRead);
    if (view === "all") return notifications;
    return notifications.filter((n) => n.kind === view);
  }, [notifications, view]);

  const markAll = () => {
    startTransition(async () => {
      const result = await markAllReadAction();
      if (result.ok) {
        toast.success(result.message ?? "Marked read");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const send = () => {
    startTransition(async () => {
      const result = await createCampaignAction(draft);
      if (result.ok) {
        toast.success(result.message ?? "Saved");
        setComposing(false);
        setDraft({ title: "", message: "", audience: "customer", send: true });
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setView(v.key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
              view === v.key
                ? "border-[var(--hm-cyan-300)] bg-[var(--hm-cyan-50)] text-[var(--hm-cyan-800)]"
                : "border-[var(--hm-border)] bg-white text-[var(--hm-ink-600,#475569)] hover:border-[var(--hm-cyan-200)]",
            )}
          >
            {v.label}
            <span className="ml-1.5 text-[11px] opacity-70 tabular-nums">{counts[v.key]}</span>
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          {counts.unread > 0 ? (
            <Button variant="outline" size="sm" onClick={markAll} loading={pending}>
              <CheckCheck className="size-4" />
              Mark all read
            </Button>
          ) : null}
          {canWrite ? (
            <Button size="sm" onClick={() => setComposing(true)}>
              <Plus className="size-4" />
              New campaign
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader
          title="Notification log"
          subtitle="Transactional messages written by order activity, plus admin campaigns"
        />
        {rows.length === 0 ? (
          <EmptyState
            title={view === "unread" ? "You're all caught up" : "Nothing here yet"}
            message={
              view === "unread"
                ? "Every notification has been read."
                : "Notifications appear as orders move through the queue."
            }
            icon={<Bell className="size-5" />}
          />
        ) : (
          <ul className="divide-y divide-[var(--hm-border)]">
            {rows.map((notification) => (
              <li
                key={notification.id}
                className={cn(
                  "flex items-start gap-3 px-5 py-3.5 transition-colors",
                  !notification.isRead && "bg-[var(--hm-cyan-50)]/40",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[9px]",
                    notification.kind === "campaign"
                      ? "bg-[var(--hm-violet-50)] text-[var(--hm-violet-700)]"
                      : "bg-[var(--hm-cyan-50)] text-[var(--hm-cyan-700)]",
                  )}
                >
                  {notification.kind === "campaign" ? (
                    <Megaphone className="size-4" />
                  ) : (
                    <Bell className="size-4" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-[var(--hm-ink-900)]">
                    {notification.title}
                    {!notification.isRead ? (
                      <span
                        aria-label="Unread"
                        className="size-1.5 rounded-full bg-[var(--hm-cyan-500)]"
                      />
                    ) : null}
                  </p>
                  <p className="text-[12.5px] text-[var(--hm-ink-600,#475569)]">
                    {notification.message}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--hm-ink-400)]">
                    <span title={formatDateTime(notification.createdAt)}>
                      {formatRelative(notification.createdAt)}
                    </span>
                    <span>· to {notification.audience}</span>
                    {notification.orderId ? (
                      <Link
                        href={`/orders/${notification.orderId}`}
                        className="font-semibold text-[var(--hm-cyan-700)] hover:underline"
                      >
                        View order
                      </Link>
                    ) : null}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Chip tone={STATUS_TONE[notification.status]}>{notification.status}</Chip>
                  {!notification.isRead ? (
                    <button
                      type="button"
                      onClick={() =>
                        startTransition(async () => {
                          await markReadAction(notification.id);
                          router.refresh();
                        })
                      }
                      className="text-[11.5px] font-semibold text-[var(--hm-cyan-700)] hover:underline"
                    >
                      Mark read
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog
        open={composing}
        onClose={() => setComposing(false)}
        title="New notification campaign"
        description="Queued for the messaging integration to deliver — nothing is marked sent until it confirms."
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setComposing(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={send} loading={pending} disabled={!draft.title.trim() || !draft.message.trim()}>
              <Send className="size-4" />
              {draft.send ? "Queue campaign" : "Save draft"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Title" htmlFor="n-title" required>
            <Input
              id="n-title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Fresh stock just landed"
            />
          </Field>
          <Field label="Message" htmlFor="n-body" required>
            <Textarea
              id="n-body"
              rows={3}
              value={draft.message}
              onChange={(e) => setDraft({ ...draft, message: e.target.value })}
              placeholder="Vegetables restocked this morning — order before 6pm for same-day delivery."
            />
          </Field>
          <Field label="Audience" htmlFor="n-audience">
            <Select
              id="n-audience"
              value={draft.audience}
              onChange={(e) =>
                setDraft({ ...draft, audience: e.target.value as NotificationRecord["audience"] })
              }
            >
              <option value="customer">All customers</option>
              <option value="staff">Staff only</option>
              <option value="segment">Selected segment</option>
            </Select>
          </Field>
          <Switch
            checked={draft.send}
            onChange={(send) => setDraft({ ...draft, send })}
            label="Queue for delivery now"
            description="Turn off to keep it as a draft."
          />
        </div>
      </Dialog>
    </>
  );
}
