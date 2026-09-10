"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowRight, Check, Clock, Mic } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/utils/cn";
import { formatDuration, formatRelative } from "@/lib/utils/format";
import type { VoiceOrder } from "@/types";

const VIEWS = [
  { key: "queue", label: "Needs review" },
  { key: "converted", label: "Converted" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
] as const;

export function VoiceQueue({
  voiceOrders,
  lowConfidenceThreshold,
}: {
  voiceOrders: VoiceOrder[];
  lowConfidenceThreshold: number;
}) {
  const reduced = useReducedMotion();
  const [view, setView] = useState<(typeof VIEWS)[number]["key"]>("queue");

  const filtered = voiceOrders.filter((v) => {
    if (view === "all") return true;
    if (view === "queue") return v.reviewStatus === "unreviewed" || v.reviewStatus === "in_review";
    return v.reviewStatus === view;
  });

  const counts = {
    queue: voiceOrders.filter((v) => v.reviewStatus === "unreviewed" || v.reviewStatus === "in_review").length,
    converted: voiceOrders.filter((v) => v.reviewStatus === "converted").length,
    rejected: voiceOrders.filter((v) => v.reviewStatus === "rejected").length,
    all: voiceOrders.length,
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
              "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors duration-[var(--hm-dur-fast)]",
              view === v.key
                ? "border-[var(--hm-cyan-300)] bg-[var(--hm-cyan-50)] text-[var(--hm-cyan-800)]"
                : "border-[var(--hm-border)] bg-white text-[var(--hm-ink-600,#475569)] hover:border-[var(--hm-cyan-200)]",
            )}
          >
            {v.label}
            <span className="ml-1.5 text-[11px] opacity-70 tabular-nums">{counts[v.key]}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            title={view === "queue" ? "Nothing waiting for review" : "No requests in this view"}
            message={
              view === "queue"
                ? "New voice requests appear here as soon as customers record them."
                : undefined
            }
            icon={<Mic className="size-5" />}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((voice, index) => {
            const lowConfidence = voice.detectedItems.filter(
              (i) => i.confidence < lowConfidenceThreshold,
            ).length;
            const unmatched = voice.detectedItems.filter((i) => !i.matchedProductId).length;
            const needsWork = voice.reviewStatus === "unreviewed" || voice.reviewStatus === "in_review";

            return (
              <motion.div
                key={voice.id}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: reduced ? 0 : Math.min(index, 12) * 0.03 }}
              >
                <Card className="hm-elevate flex h-full flex-col">
                  <CardHeader
                    title={
                      <span className="flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-full bg-[var(--hm-violet-50)] text-[var(--hm-violet-700)]">
                          <Mic className="size-3.5" />
                        </span>
                        <span className="font-mono">{voice.displayId}</span>
                      </span>
                    }
                    subtitle={`${voice.customer.fullName} · ${formatRelative(voice.createdAt)}`}
                    action={
                      <Chip
                        tone={
                          voice.reviewStatus === "converted"
                            ? "success"
                            : voice.reviewStatus === "rejected"
                              ? "danger"
                              : voice.reviewStatus === "in_review"
                                ? "info"
                                : "warning"
                        }
                      >
                        {voice.reviewStatus.replace(/_/g, " ")}
                      </Chip>
                    }
                  />

                  <div className="flex flex-1 flex-col gap-3 p-5">
                    {voice.transcript ? (
                      <p className="line-clamp-2 text-[13px] leading-relaxed text-[var(--hm-ink-700)]">
                        “{voice.transcript}”
                      </p>
                    ) : (
                      <p className="text-[13px] text-[var(--hm-ink-400)]">No transcript available</p>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                      <span className="flex items-center gap-1 rounded-full bg-[var(--hm-ink-100)] px-2 py-0.5 text-[var(--hm-ink-600,#475569)]">
                        <Clock className="size-3" />
                        {formatDuration(voice.audioDurationSeconds)}
                      </span>
                      <span className="rounded-full bg-[var(--hm-ink-100)] px-2 py-0.5 text-[var(--hm-ink-600,#475569)]">
                        {voice.detectedItems.length} item{voice.detectedItems.length === 1 ? "" : "s"}
                      </span>
                      {lowConfidence > 0 ? (
                        <span className="flex items-center gap-1 rounded-full bg-[var(--hm-warning-50)] px-2 py-0.5 font-semibold text-[var(--hm-warning-700)]">
                          <AlertTriangle className="size-3" />
                          {lowConfidence} low confidence
                        </span>
                      ) : null}
                      {unmatched > 0 && needsWork ? (
                        <span className="rounded-full bg-[var(--hm-danger-50)] px-2 py-0.5 font-semibold text-[var(--hm-danger-700)]">
                          {unmatched} unmatched
                        </span>
                      ) : null}
                    </div>

                    {/* Compact waveform preview */}
                    <div className="flex h-8 items-end gap-[2px]" aria-hidden>
                      {(voice.waveform ?? Array.from({ length: 40 }, () => 0.3))
                        .slice(0, 40)
                        .map((value, i) => (
                          <span
                            key={i}
                            className="flex-1 rounded-[1px] bg-[var(--hm-ink-200)]"
                            style={{ height: `${Math.max(12, value * 100)}%` }}
                          />
                        ))}
                    </div>

                    <div className="mt-auto flex items-center justify-between pt-1">
                      {voice.linkedOrderId ? (
                        <Link
                          href={`/orders/${voice.linkedOrderId}`}
                          className="flex items-center gap-1 text-[12.5px] font-semibold text-[var(--hm-success-700)] hover:underline"
                        >
                          <Check className="size-3.5" />
                          Linked order
                        </Link>
                      ) : (
                        <span className="text-[11.5px] text-[var(--hm-ink-400)]">
                          {voice.customer.society ?? "No area on file"}
                        </span>
                      )}
                      <Link
                        href={`/voice-orders/${voice.id}`}
                        className="flex items-center gap-1 rounded-[9px] border border-[var(--hm-border)] px-2.5 py-1 text-[12px] font-semibold text-[var(--hm-ink-700)] transition-colors hover:border-[var(--hm-cyan-300)] hover:text-[var(--hm-cyan-700)]"
                      >
                        {needsWork ? "Review" : "Open"}
                        <ArrowRight className="size-3.5" />
                      </Link>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </>
  );
}
