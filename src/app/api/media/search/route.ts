import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionAdmin } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { clientKey, rateLimit } from "@/lib/auth/rate-limit";
import { cacheKey, readCache, writeCache } from "@/lib/media/providers/cache";
import { searchPexels } from "@/lib/media/providers/pexels";
import { searchPixabay } from "@/lib/media/providers/pixabay";
import { searchUnsplash } from "@/lib/media/providers/unsplash";
import { ProviderNotConfiguredError, type ProviderSearchResponse } from "@/lib/media/providers/types";

export const runtime = "nodejs";

const Query = z.object({
  q: z.string().trim().min(2, "Type at least two characters").max(80),
  provider: z.enum(["all", "pixabay", "pexels", "unsplash"]).default("all"),
  page: z.coerce.number().int().min(1).max(50).default(1),
  perPage: z.coerce.number().int().min(6).max(40).default(24),
});

const SEARCHERS = {
  pixabay: searchPixabay,
  pexels: searchPexels,
  unsplash: searchUnsplash,
} as const;

/**
 * GET /api/media/search — the only path by which the browser reaches an image
 * provider. Keys stay server-side, responses are normalized and cached for 24h,
 * and no secret field is ever included in the payload (PRD §5.1, §15).
 */
export async function GET(request: Request) {
  const admin = await getSessionAdmin();
  if (!admin) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!can(admin, "products.write") && !can(admin, "categories.write") && !can(admin, "marketing.write")) {
    return NextResponse.json({ error: "Your role cannot search media." }, { status: 403 });
  }

  const limit = rateLimit(clientKey(request, `media-search:${admin.uid}`), 40, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Slow down a moment — too many searches." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const url = new URL(request.url);
  const parsed = Query.safeParse({
    q: url.searchParams.get("q") ?? "",
    provider: url.searchParams.get("provider") ?? "all",
    page: url.searchParams.get("page") ?? 1,
    perPage: url.searchParams.get("perPage") ?? 24,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid search." }, { status: 400 });
  }

  const { q, provider, page, perPage } = parsed.data;
  const targets = provider === "all" ? (["pixabay", "pexels", "unsplash"] as const) : ([provider] as const);
  const share = provider === "all" ? Math.max(6, Math.ceil(perPage / targets.length)) : perPage;

  const responses = await Promise.all(
    targets.map(async (name): Promise<ProviderSearchResponse> => {
      const key = cacheKey(name, q, page, share);
      const cached = readCache(key);
      if (cached) return cached;

      try {
        const result = await SEARCHERS[name]({ query: q, page, perPage: share });
        writeCache(key, result);
        return result;
      } catch (error) {
        if (error instanceof ProviderNotConfiguredError) {
          return { provider: name, results: [], total: 0, error: "Not configured" };
        }
        console.error(`[hashmimart-admin] ${name} search failed`);
        return { provider: name, results: [], total: 0, error: "Search failed" };
      }
    }),
  );

  // Interleave so an "All" search shows a fair mix rather than one provider first.
  const buckets = responses.map((r) => [...r.results]);
  const merged: ProviderSearchResponse["results"] = [];
  let index = 0;
  while (merged.length < perPage && buckets.some((b) => b.length > index)) {
    for (const bucket of buckets) {
      const item = bucket[index];
      if (item && merged.length < perPage) merged.push(item);
    }
    index += 1;
  }

  return NextResponse.json(
    {
      query: q,
      results: merged,
      providers: responses.map((r) => ({ provider: r.provider, total: r.total, error: r.error })),
    },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
