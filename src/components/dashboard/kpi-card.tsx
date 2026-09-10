"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { NotConfigured } from "@/components/ui/states";
import type { KpiValue } from "@/server/services/analytics";

type Tone = "cyan" | "success" | "warning" | "danger" | "info" | "violet" | "navy";

const TONE_STYLES: Record<Tone, string> = {
  cyan: "bg-[var(--hm-cyan-50)] text-[var(--hm-cyan-700)]",
  success: "bg-[var(--hm-success-50)] text-[var(--hm-success-700)]",
  warning: "bg-[var(--hm-warning-50)] text-[var(--hm-warning-700)]",
  danger: "bg-[var(--hm-danger-50)] text-[var(--hm-danger-700)]",
  info: "bg-[var(--hm-info-50)] text-[var(--hm-info-700)]",
  violet: "bg-[var(--hm-violet-50)] text-[var(--hm-violet-700)]",
  navy: "bg-[var(--hm-ink-100)] text-[var(--hm-navy-800)]",
};

/**
 * Counts up only after real data has arrived — never a placeholder number
 * animating while a request is still in flight (PRD §13.2).
 */
function useCountUp(target: number | null, enabled: boolean) {
  const [display, setDisplay] = useState(target ?? 0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (target === null) return;
    if (!enabled) {
      setDisplay(target);
      return;
    }
    const from = 0;
    const duration = 620;
    const start = performance.now();
    const step = (t: number) => {
      const progress = Math.min(1, (t - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(from + (target - from) * eased);
      if (progress < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [target, enabled]);

  return display;
}

export function KpiCard({
  label,
  hint,
  kpi,
  tone = "cyan",
  icon,
  format,
  index = 0,
}: {
  label: string;
  hint?: string;
  kpi: KpiValue;
  tone?: Tone;
  icon: React.ReactNode;
  format: (value: number) => string;
  index?: number;
}) {
  const reduced = useReducedMotion();
  const display = useCountUp(kpi.value, !reduced);

  const trend =
    kpi.changePercent === null ? null : kpi.changePercent > 0 ? "up" : kpi.changePercent < 0 ? "down" : "flat";

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: reduced ? 0 : index * 0.035, ease: [0.32, 0.72, 0, 1] }}
      className="hm-card hm-elevate flex min-h-[124px] flex-col p-4"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-[10px]",
            TONE_STYLES[tone],
          )}
        >
          {icon}
        </span>
        {trend && kpi.changePercent !== null ? (
          <span
            title="Compared with the previous equivalent period"
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
              trend === "up" && "bg-[var(--hm-success-50)] text-[var(--hm-success-700)]",
              trend === "down" && "bg-[var(--hm-danger-50)] text-[var(--hm-danger-700)]",
              trend === "flat" && "bg-[var(--hm-ink-100)] text-[var(--hm-ink-500)]",
            )}
          >
            {trend === "up" ? (
              <ArrowUpRight className="size-3" />
            ) : trend === "down" ? (
              <ArrowDownRight className="size-3" />
            ) : (
              <Minus className="size-3" />
            )}
            {Math.abs(kpi.changePercent).toFixed(1)}%
          </span>
        ) : null}
      </div>

      <p className="text-[26px] leading-none font-bold tracking-[-0.025em] text-[var(--hm-ink-900)] tabular-nums">
        {!kpi.configured ? (
          <NotConfigured label={label} />
        ) : kpi.value === null ? (
          <span className="text-[var(--hm-ink-400)]">—</span>
        ) : (
          format(display)
        )}
      </p>
      <p className="mt-1.5 text-[12.5px] font-medium text-[var(--hm-ink-500)]">{label}</p>
      {hint ? <p className="mt-auto pt-2 text-[11px] text-[var(--hm-ink-400)]">{hint}</p> : null}
    </motion.div>
  );
}
