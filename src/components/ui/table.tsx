import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("hm-card overflow-hidden", className)}>{children}</div>;
}

export function TableToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-[var(--hm-border)] px-4 py-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TableScroll({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("hm-scroll-x", className)}>{children}</div>;
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <table className={cn("w-full border-collapse text-left text-[13px]", className)}>{children}</table>
  );
}

export function Th({
  children,
  className,
  align = "left",
  scope = "col",
  ...rest
}: {
  children?: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  scope?: "col" | "row";
} & React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope={scope}
      className={cn(
        "sticky top-0 z-10 border-b border-[var(--hm-border)] bg-[var(--hm-ink-50)] px-4 py-2.5 text-[11.5px] font-bold tracking-[0.05em] whitespace-nowrap text-[var(--hm-ink-500)] uppercase",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  align = "left",
  ...rest
}: {
  children?: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
} & React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        "border-b border-[var(--hm-border)] px-4 py-3 align-middle text-[var(--hm-ink-700)]",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

export function Tr({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "transition-colors duration-[var(--hm-dur-fast)] hover:bg-[var(--hm-cyan-50)]/45",
        className,
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (next: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[12.5px] text-[var(--hm-ink-500)]">
      <span>
        Showing <strong className="text-[var(--hm-ink-800)]">{from}</strong>–
        <strong className="text-[var(--hm-ink-800)]">{to}</strong> of{" "}
        <strong className="text-[var(--hm-ink-800)]">{total}</strong>
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className="rounded-[9px] border border-[var(--hm-border)] bg-white px-2.5 py-1.5 font-semibold text-[var(--hm-ink-700)] transition-colors hover:border-[var(--hm-cyan-300)] disabled:opacity-45"
        >
          Previous
        </button>
        <span className="px-2 tabular-nums">
          {page + 1} / {pages}
        </span>
        <button
          type="button"
          onClick={() => onPage(Math.min(pages - 1, page + 1))}
          disabled={page >= pages - 1}
          className="rounded-[9px] border border-[var(--hm-border)] bg-white px-2.5 py-1.5 font-semibold text-[var(--hm-ink-700)] transition-colors hover:border-[var(--hm-cyan-300)] disabled:opacity-45"
        >
          Next
        </button>
      </div>
    </div>
  );
}
