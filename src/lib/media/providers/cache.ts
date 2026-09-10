import "server-only";

import type { ProviderSearchResponse } from "./types";

/**
 * 24-hour query cache.
 *
 * Pixabay's API terms require search results to be cached for 24 hours, and
 * Pexels and Unsplash both benefit from it under their rate limits — so every
 * provider goes through the same cache (PRD §5.1).
 */

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;

interface Entry {
  value: ProviderSearchResponse;
  expiresAt: number;
}

const cache = new Map<string, Entry>();

export function cacheKey(provider: string, query: string, page: number, perPage: number): string {
  return `${provider}:${query.trim().toLowerCase()}:${page}:${perPage}`;
}

export function readCache(key: string): ProviderSearchResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  // Refresh recency for the simple LRU eviction below.
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

export function writeCache(key: string, value: ProviderSearchResponse): void {
  if (value.error) return; // never cache a failure
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

export function clearCache(): void {
  cache.clear();
}
