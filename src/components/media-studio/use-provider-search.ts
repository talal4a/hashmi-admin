"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { rankGroupShots } from "@/lib/media/group-shot";
import type { ProviderImageResult } from "@/types";

export type ProviderTab = "all" | "pixabay" | "pexels" | "unsplash";

interface ProviderStatus {
  provider: string;
  total: number;
  error: string | null;
}

const RECENT_KEY = "hm.media.recentSearches";
const DEBOUNCE_MS = 350;
const MIN_QUERY = 2;

/**
 * Debounced provider search (PRD §5.2): 350ms debounce, minimum two characters,
 * stale requests cancelled, and paging that appends rather than replaces.
 */
export function useProviderSearch(options: { groupFirst?: boolean } = {}) {
  const [query, setQuery] = useState("");
  /**
   * Assortments first. On by default for category art, where a photo of one
   * strawberry is never the right answer, and off for products, where it
   * usually is.
   */
  const [groupFirst, setGroupFirst] = useState(options.groupFirst ?? false);
  const [tab, setTab] = useState<ProviderTab>("all");
  const [results, setResults] = useState<ProviderImageResult[]>([]);
  const [statuses, setStatuses] = useState<ProviderStatus[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  const controllerRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    // Deferred: localStorage is unavailable during SSR, and updating state in
    // the effect body would cascade a render.
    queueMicrotask(() => {
      try {
        const stored = window.localStorage.getItem(RECENT_KEY);
        if (stored) setRecent(JSON.parse(stored) as string[]);
      } catch {
        // Storage can throw in private mode; recents are a convenience only.
      }
    });
  }, []);

  const rememberSearch = useCallback((value: string) => {
    setRecent((prev) => {
      const next = [value, ...prev.filter((v) => v !== value)].slice(0, 6);
      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // Ignore.
      }
      return next;
    });
  }, []);

  const run = useCallback(
    async (value: string, provider: ProviderTab, pageNumber: number, append: boolean) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          q: value,
          provider,
          page: String(pageNumber),
          perPage: "24",
        });
        const response = await fetch(`/api/media/search?${params}`, { signal: controller.signal });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error ?? "Image search failed.");
        }
        const body = (await response.json()) as {
          results: ProviderImageResult[];
          providers: ProviderStatus[];
        };
        setResults((prev) => (append ? [...prev, ...body.results] : body.results));
        setStatuses(body.providers);
        if (!append) rememberSearch(value);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Image search failed.");
        if (!append) setResults([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [rememberSearch],
  );

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY) {
      controllerRef.current?.abort();
      queueMicrotask(() => {
        setResults([]);
        setStatuses([]);
        setLoading(false);
      });
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      setPage(1);
      void run(trimmed, tab, 1, false);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, tab, run]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const loadMore = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY || loading || loadingMore) return;
    const next = page + 1;
    setPage(next);
    void run(trimmed, tab, next, true);
  }, [query, tab, page, loading, loadingMore, run]);

  const ordered = useMemo(
    () => (groupFirst ? rankGroupShots(results) : results),
    [results, groupFirst],
  );

  return {
    query,
    setQuery,
    tab,
    setTab,
    groupFirst,
    setGroupFirst,
    results: ordered,
    statuses,
    loading,
    loadingMore,
    error,
    recent,
    loadMore,
    minQuery: MIN_QUERY,
  };
}
