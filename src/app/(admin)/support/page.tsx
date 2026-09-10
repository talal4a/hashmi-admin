import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/admin-shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/states";
import { formatRelative } from "@/lib/utils/format";
import { listSupportConversations } from "@/server/repositories/misc";
import { SupportThread } from "@/components/customers/support-thread";

export const metadata: Metadata = { title: "Support" };
export const dynamic = "force-dynamic";

export default async function SupportPage() {
  await requirePermission("support.view");
  const conversations = await listSupportConversations();
  const open = conversations.filter((c) => c.status !== "resolved").length;

  return (
    <>
      <PageHeader
        title="Support"
        subtitle={`${open} open conversation${open === 1 ? "" : "s"} · read-only view of customer chat and voice notes`}
      />

      {conversations.length === 0 ? (
        <Card>
          <EmptyState
            title="No support conversations"
            message="Customer chats and voice notes appear here as they come in."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {conversations.map((conversation) => (
            <Card key={conversation.id} className="flex flex-col">
              <CardHeader
                title={conversation.subject}
                subtitle={
                  <>
                    {conversation.customer.uid ? (
                      <Link
                        href={`/customers/${conversation.customer.uid}`}
                        className="hover:text-[var(--hm-cyan-700)] hover:underline"
                      >
                        {conversation.customer.fullName}
                      </Link>
                    ) : (
                      conversation.customer.fullName
                    )}
                    {" · "}
                    {formatRelative(conversation.lastMessageAt)}
                  </>
                }
                action={
                  <div className="flex items-center gap-1.5">
                    <Chip tone={conversation.channel === "voice" ? "violet" : "neutral"}>
                      {conversation.channel}
                    </Chip>
                    <Chip
                      tone={
                        conversation.status === "resolved"
                          ? "success"
                          : conversation.status === "pending"
                            ? "warning"
                            : "info"
                      }
                    >
                      {conversation.status}
                    </Chip>
                  </div>
                }
              />
              <SupportThread conversation={conversation} />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
