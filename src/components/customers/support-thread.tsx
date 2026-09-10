"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, Mic, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { formatRelative } from "@/lib/utils/format";
import { setConversationStatusAction } from "@/server/actions/customers";
import type { SupportConversation } from "@/types";

/**
 * Read-only conversation view (PRD §9 / §2.1, priority P2).
 * Admins can triage the status; replying to customers stays in the app itself.
 */
export function SupportThread({ conversation }: { conversation: SupportConversation }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const setStatus = (status: "open" | "pending" | "resolved") => {
    startTransition(async () => {
      const result = await setConversationStatusAction(conversation.id, status);
      if (result.ok) {
        toast.success(result.message ?? "Updated");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      <ul className="flex flex-1 flex-col gap-2.5 p-5">
        {conversation.messages.map((message) => {
          const own = message.author !== "customer";
          return (
            <li
              key={message.id}
              className={cn("flex max-w-[86%] flex-col gap-1", own ? "self-end items-end" : "self-start")}
            >
              <span
                className={cn(
                  "rounded-[14px] px-3.5 py-2.5 text-[13px] leading-relaxed",
                  own
                    ? "rounded-br-[4px] bg-[var(--hm-cyan-500)] text-white"
                    : "rounded-bl-[4px] bg-[var(--hm-ink-100)] text-[var(--hm-ink-800)]",
                )}
              >
                {message.audioUrl !== undefined && message.audioUrl === null && message.body.startsWith("Voice") ? (
                  <span className="flex items-center gap-1.5">
                    <Mic className="size-3.5" />
                    {message.body}
                  </span>
                ) : (
                  message.body
                )}
              </span>
              <span className="flex items-center gap-1 text-[10.5px] text-[var(--hm-ink-400)]">
                {message.author === "customer" ? (
                  <User className="size-3" />
                ) : message.author === "assistant" ? (
                  <Bot className="size-3" />
                ) : (
                  <User className="size-3" />
                )}
                {message.author} · {formatRelative(message.createdAt)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-2 border-t border-[var(--hm-border)] px-5 py-3">
        {(["open", "pending", "resolved"] as const).map((status) => (
          <Button
            key={status}
            variant={conversation.status === status ? "secondary" : "outline"}
            size="sm"
            onClick={() => setStatus(status)}
            disabled={pending || conversation.status === status}
          >
            {status === "resolved" ? <Check className="size-3.5" /> : null}
            Mark {status}
          </Button>
        ))}
      </div>
    </>
  );
}
