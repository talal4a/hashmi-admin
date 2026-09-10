import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Lock, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Loading / empty / error / permission-denied states.
 * PRD §16.2 requires all four to exist for every major module.
 */

export function EmptyState({
  title,
  message,
  icon,
  action,
  className,
}: {
  title: string;
  message?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <div className="mb-3 flex size-12 items-center justify-center rounded-[14px] bg-[var(--hm-cyan-50)] text-[var(--hm-cyan-600)]">
        {icon ?? <Inbox className="size-5" />}
      </div>
      <p className="text-[14.5px] font-semibold text-[var(--hm-ink-900)]">{title}</p>
      {message ? (
        <p className="mt-1 max-w-md text-[13px] text-[var(--hm-ink-500)]">{message}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  action,
}: {
  title?: string;
  message?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-[14px] bg-[var(--hm-danger-50)] text-[var(--hm-danger-700)]">
        <AlertTriangle className="size-5" />
      </div>
      <p className="text-[14.5px] font-semibold text-[var(--hm-ink-900)]">{title}</p>
      {message ? (
        <p className="mt-1 max-w-md text-[13px] text-[var(--hm-ink-500)]">{message}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function PermissionDenied({ module }: { module: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-[14px] bg-[var(--hm-ink-100)] text-[var(--hm-ink-500)]">
        <Lock className="size-5" />
      </div>
      <p className="text-[14.5px] font-semibold text-[var(--hm-ink-900)]">
        You don&apos;t have access to {module}
      </p>
      <p className="mt-1 max-w-md text-[13px] text-[var(--hm-ink-500)]">
        Your role doesn&apos;t include this module. Ask a super admin if you need it.
      </p>
    </div>
  );
}

export function OfflineState() {
  return (
    <div className="flex items-center gap-3 rounded-[var(--hm-radius-control-lg)] border border-[var(--hm-warning-100)] bg-[var(--hm-warning-50)] px-4 py-3">
      <WifiOff className="size-4 shrink-0 text-[var(--hm-warning-700)]" />
      <p className="text-[13px] text-[var(--hm-warning-700)]">
        You appear to be offline. Changes won&apos;t save until the connection returns.
      </p>
    </div>
  );
}

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div aria-hidden style={style} className={cn("hm-skeleton", className)} />;
}

/** Reserves the exact height a table will occupy so stats never shift (§16.2). */
export function TableSkeleton({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y divide-[var(--hm-border)]" aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-5 py-3.5">
          {Array.from({ length: columns }).map((__, c) => (
            <Skeleton key={c} className={cn("h-4", c === 0 ? "w-[22%]" : "flex-1")} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** PRD §3.2: show this rather than inventing a number. */
export function NotConfigured({ label }: { label: string }) {
  return (
    <span
      title={`${label} is not configured yet`}
      className="inline-flex items-center rounded-md bg-[var(--hm-ink-100)] px-2 py-0.5 text-[11.5px] font-semibold text-[var(--hm-ink-500)]"
    >
      Not configured
    </span>
  );
}
