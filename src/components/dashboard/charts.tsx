"use client";

import { useMemo } from "react";
import { useReducedMotion } from "motion/react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPKR, formatShortDate } from "@/lib/utils/format";
import type { DashboardData } from "@/server/services/analytics";

/**
 * Charts are loaded lazily by the pages that use them (PRD §13.3) and reveal
 * once per data change, skipping animation under reduced motion.
 */

const CYAN = "#06B6D4";
const NAVY = "#1E293B";
const GRID = "#E6EDF2";
const AXIS = "#94A3B8";

const SERIES = ["#06B6D4", "#0E7490", "#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#64748B"];

const axisProps = {
  stroke: AXIS,
  fontSize: 11,
  tickLine: false,
  axisLine: { stroke: GRID },
};

function TooltipBox({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string; dataKey?: string }>;
  label?: string | number;
  valueFormatter?: (value: number, key: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[10px] border border-[var(--hm-border)] bg-white px-3 py-2 shadow-[var(--hm-shadow-md)]">
      {label !== undefined ? (
        <p className="mb-1 text-[11.5px] font-semibold text-[var(--hm-ink-500)]">{label}</p>
      ) : null}
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-1.5 text-[12.5px] text-[var(--hm-ink-800)]">
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ background: entry.color ?? CYAN }}
          />
          <span className="font-medium">{entry.name}</span>
          <span className="ml-auto pl-3 font-bold tabular-nums">
            {valueFormatter && typeof entry.value === "number"
              ? valueFormatter(entry.value, String(entry.dataKey ?? ""))
              : String(entry.value)}
          </span>
        </p>
      ))}
    </div>
  );
}

export function RevenueTrendChart({ data }: { data: DashboardData["revenueTrend"] }) {
  const reduced = useReducedMotion();
  const rows = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        label: formatShortDate(d.date),
      })),
    [data],
  );

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="hm-revenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CYAN} stopOpacity={0.28} />
            <stop offset="100%" stopColor={CYAN} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={64} tickFormatter={(v: number) => formatPKR(v)} />
        <Tooltip
          content={
            <TooltipBox
              valueFormatter={(value, key) => (key === "revenue" ? formatPKR(value) : String(value))}
            />
          }
          cursor={{ stroke: GRID }}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke={CYAN}
          strokeWidth={2.2}
          fill="url(#hm-revenue)"
          isAnimationActive={!reduced}
          animationDuration={520}
        />
        <Line
          type="monotone"
          dataKey="orders"
          name="Orders"
          stroke={NAVY}
          strokeWidth={1.6}
          strokeDasharray="4 4"
          dot={false}
          isAnimationActive={!reduced}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function StatusDonut({ data }: { data: DashboardData["statusDistribution"] }) {
  const reduced = useReducedMotion();
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Tooltip content={<TooltipBox />} />
        <Pie
          data={data}
          dataKey="count"
          nameKey="label"
          innerRadius="58%"
          outerRadius="88%"
          paddingAngle={2}
          isAnimationActive={!reduced}
        >
          {data.map((entry, i) => (
            <Cell key={entry.status} fill={SERIES[i % SERIES.length]} stroke="#fff" strokeWidth={2} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

export function HorizontalBars({
  data,
  valueKey = "revenue",
  currency = true,
}: {
  data: { name: string; revenue: number; units: number }[];
  valueKey?: "revenue" | "units";
  currency?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={128}
          {...axisProps}
          axisLine={false}
          tick={{ fontSize: 11.5, fill: "#334155" }}
        />
        <Tooltip
          cursor={{ fill: "rgba(6,182,212,0.06)" }}
          content={
            <TooltipBox
              valueFormatter={(value) => (currency ? formatPKR(value) : String(value))}
            />
          }
        />
        <Bar
          dataKey={valueKey}
          name={valueKey === "revenue" ? "Revenue" : "Units"}
          radius={[0, 6, 6, 0]}
          isAnimationActive={!reduced}
          animationDuration={480}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={SERIES[i % SERIES.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HourlyBars({ data }: { data: DashboardData["ordersByHour"] }) {
  const reduced = useReducedMotion();
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <XAxis dataKey="hour" {...axisProps} interval={3} />
        <YAxis {...axisProps} allowDecimals={false} width={40} />
        <Tooltip cursor={{ fill: "rgba(6,182,212,0.06)" }} content={<TooltipBox />} />
        <Bar
          dataKey="orders"
          name="Orders"
          fill={CYAN}
          radius={[5, 5, 0, 0]}
          isAnimationActive={!reduced}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SourceRadial({ data }: { data: DashboardData["sourceSplit"] }) {
  const reduced = useReducedMotion();
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const rows = data.map((d, i) => ({
    ...d,
    percent: Math.round((d.count / total) * 100),
    fill: i === 0 ? CYAN : "#8B5CF6",
  }));
  return (
    <ResponsiveContainer width="100%" height={190}>
      <RadialBarChart innerRadius="42%" outerRadius="96%" data={rows} startAngle={90} endAngle={-270}>
        <PolarAngleAxis type="number" domain={[0, 100]} dataKey="percent" tick={false} />
        <RadialBar dataKey="percent" background cornerRadius={8} isAnimationActive={!reduced} />
        <Tooltip content={<TooltipBox valueFormatter={(v) => `${v}%`} />} />
      </RadialBarChart>
    </ResponsiveContainer>
  );
}
