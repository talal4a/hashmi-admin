import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type ChipTone =
  | "cyan"
  | "navy"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "violet"
  | "neutral";

const TONES: Record<ChipTone, string> = {
  cyan: "bg-[var(--hm-cyan-50)] text-[var(--hm-cyan-800)] ring-[var(--hm-cyan-100)]",
  navy: "bg-[var(--hm-ink-100)] text-[var(--hm-navy-800)] ring-[var(--hm-ink-200)]",
  success: "bg-[var(--hm-success-50)] text-[var(--hm-success-700)] ring-[var(--hm-success-100)]",
  warning: "bg-[var(--hm-warning-50)] text-[var(--hm-warning-700)] ring-[var(--hm-warning-100)]",
  danger: "bg-[var(--hm-danger-50)] text-[var(--hm-danger-700)] ring-[var(--hm-danger-100)]",
  info: "bg-[var(--hm-info-50)] text-[var(--hm-info-700)] ring-[var(--hm-info-100)]",
  violet: "bg-[var(--hm-violet-50)] text-[var(--hm-violet-700)] ring-[var(--hm-violet-100)]",
  neutral: "bg-[var(--hm-ink-50)] text-[var(--hm-ink-500)] ring-[var(--hm-ink-200)]",
};

export function Chip({
  tone = "neutral",
  children,
  icon,
  className,
}: {
  tone?: ChipTone;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.04em] uppercase ring-1 ring-inset whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral", className }: { tone?: ChipTone; className?: string }) {
  const colors: Record<ChipTone, string> = {
    cyan: "bg-[var(--hm-cyan-500)]",
    navy: "bg-[var(--hm-navy-700)]",
    success: "bg-[var(--hm-success-500)]",
    warning: "bg-[var(--hm-warning-500)]",
    danger: "bg-[var(--hm-danger-500)]",
    info: "bg-[var(--hm-info-500)]",
    violet: "bg-[var(--hm-violet-500)]",
    neutral: "bg-[var(--hm-ink-400)]",
  };
  return <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", colors[tone], className)} />;
}
