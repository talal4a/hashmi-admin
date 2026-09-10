"use client";

import { useMemo, useState } from "react";
import { Download, ScrollText, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { Input, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";
import { Table, TableScroll, TableToolbar, Td, Th, Tr } from "@/components/ui/table";
import { formatDateTime, formatRelative, initials } from "@/lib/utils/format";
import type { AuditLogEntry } from "@/types";

/** Colour by the kind of change, so security-relevant rows stand out. */
function toneFor(action: string): ChipTone {
  if (action.startsWith("role") || action.startsWith("admin")) return "danger";
  if (action.includes("delete") || action.includes("cancel") || action.includes("refund")) return "danger";
  if (action.includes("publish") || action.includes("create")) return "success";
  if (action.includes("price") || action.includes("inventory")) return "warning";
  if (action.startsWith("customer")) return "violet";
  return "neutral";
}

export function AuditView({ entries }: { entries: AuditLogEntry[] }) {
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState("all");
  const [action, setAction] = useState("all");

  const entityTypes = useMemo(
    () => Array.from(new Set(entries.map((e) => e.entityType))).sort(),
    [entries],
  );
  const actions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.action))).sort(),
    [entries],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter((e) => (entityType === "all" ? true : e.entityType === entityType))
      .filter((e) => (action === "all" ? true : e.action === action))
      .filter((e) =>
        q
          ? [e.actorName, e.action, e.entityId, e.beforeSummary, e.afterSummary, e.reason]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q))
          : true,
      );
  }, [entries, search, entityType, action]);

  const exportCsv = () => {
    const header = ["timestamp", "actor", "action", "entityType", "entityId", "before", "after", "reason"];
    const lines = rows.map((e) =>
      [
        e.timestamp,
        e.actorName,
        e.action,
        e.entityType,
        e.entityId,
        e.beforeSummary ?? "",
        e.afterSummary ?? "",
        e.reason ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hashmimart-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader
        title="Change history"
        subtitle="Role changes, publishes, price and stock changes, cancellations, refunds and settings edits"
      />
      <TableToolbar>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--hm-ink-400)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actor, entity or reason…"
            aria-label="Search the audit log"
            className="pl-9"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-[var(--hm-ink-400)] hover:text-[var(--hm-ink-700)]"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <Select
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          aria-label="Filter by entity type"
          className="h-8 w-auto min-w-[130px] text-[12.5px]"
        >
          <option value="all">All entities</option>
          {entityTypes.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </Select>

        <Select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          aria-label="Filter by action"
          className="h-8 w-auto min-w-[150px] text-[12.5px]"
        >
          <option value="all">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </Select>

        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="size-4" />
          Export
        </Button>
      </TableToolbar>

      {rows.length === 0 ? (
        <EmptyState
          title="No matching entries"
          message="Admin actions are recorded here as they happen."
          icon={<ScrollText className="size-5" />}
        />
      ) : (
        <TableScroll>
          <Table className="min-w-[900px]">
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Actor</Th>
                <Th>Action</Th>
                <Th>Entity</Th>
                <Th>Change</Th>
                <Th>Reason</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <Tr key={entry.id}>
                  <Td className="whitespace-nowrap" title={formatDateTime(entry.timestamp)}>
                    {formatRelative(entry.timestamp)}
                  </Td>
                  <Td>
                    <span className="flex items-center gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--hm-ink-100)] text-[10px] font-bold text-[var(--hm-ink-700)]">
                        {initials(entry.actorName)}
                      </span>
                      <span className="truncate">{entry.actorName}</span>
                    </span>
                  </Td>
                  <Td>
                    <Chip tone={toneFor(entry.action)}>{entry.action}</Chip>
                  </Td>
                  <Td className="text-[12px]">
                    <span className="block text-[var(--hm-ink-500)]">{entry.entityType}</span>
                    <code className="font-mono text-[11.5px] text-[var(--hm-ink-800)]">
                      {entry.entityId}
                    </code>
                  </Td>
                  <Td className="max-w-[280px] text-[12px] text-[var(--hm-ink-600,#475569)]">
                    {entry.beforeSummary ? (
                      <span className="text-[var(--hm-ink-400)]">{entry.beforeSummary} → </span>
                    ) : null}
                    {entry.afterSummary ?? "—"}
                  </Td>
                  <Td className="max-w-[200px] text-[12px] text-[var(--hm-ink-500)]">
                    {entry.reason ?? "—"}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableScroll>
      )}
    </Card>
  );
}
