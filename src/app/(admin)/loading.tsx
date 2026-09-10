import { Skeleton } from "@/components/ui/states";

/** Reserves stable space so nothing jumps when data resolves (PRD §16.2). */
export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-3.5 w-72" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[124px] rounded-[var(--hm-radius-card)]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Skeleton className="h-[340px] rounded-[var(--hm-radius-card)] xl:col-span-2" />
        <Skeleton className="h-[340px] rounded-[var(--hm-radius-card)]" />
      </div>
    </div>
  );
}
