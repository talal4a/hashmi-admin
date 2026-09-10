"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnalyticsView } from "./analytics-view";
import type { DashboardData } from "@/server/services/analytics";

export function AnalyticsPageClient({ data, range }: { data: DashboardData; range: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const onRangeChange = useCallback(
    (next: number) => {
      const search = new URLSearchParams(params.toString());
      search.set("range", String(next));
      router.replace(`${pathname}?${search.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  return <AnalyticsView data={data} range={range} onRangeChange={onRangeChange} />;
}
