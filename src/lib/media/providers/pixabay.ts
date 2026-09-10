import "server-only";

import type { ProviderImageResult } from "@/types";
import { ProviderNotConfiguredError, type ProviderSearchParams, type ProviderSearchResponse } from "./types";

interface PixabayHit {
  id: number;
  pageURL: string;
  previewURL: string;
  webformatURL: string;
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
  user: string;
  tags: string;
}

/**
 * Pixabay search. The key is read from a server-only variable and never leaves
 * this module. Pixabay does not permit permanent hotlinking, so results are
 * marked as needing to be stored in HashmiMart media storage once selected.
 */
export async function searchPixabay({
  query,
  page,
  perPage,
  signal,
}: ProviderSearchParams): Promise<ProviderSearchResponse> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) throw new ProviderNotConfiguredError("Pixabay");

  const url = new URL("https://pixabay.com/api/");
  url.searchParams.set("key", key);
  url.searchParams.set("q", query);
  url.searchParams.set("image_type", "photo");
  url.searchParams.set("safesearch", "true");
  url.searchParams.set("per_page", String(Math.min(200, Math.max(3, perPage))));
  url.searchParams.set("page", String(page));

  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) {
    return { provider: "pixabay", results: [], total: 0, error: `Pixabay returned ${response.status}` };
  }

  const body = (await response.json()) as { total: number; hits: PixabayHit[] };

  const results: ProviderImageResult[] = (body.hits ?? []).map((hit) => ({
    id: String(hit.id),
    provider: "pixabay",
    thumbUrl: hit.previewURL,
    previewUrl: hit.webformatURL,
    fullUrl: hit.largeImageURL,
    width: hit.imageWidth,
    height: hit.imageHeight,
    author: hit.user,
    authorUrl: null,
    sourcePageUrl: hit.pageURL,
    attributionText: `Image by ${hit.user} on Pixabay`,
    // Pixabay disallows permanent hotlinking, so a selected image is stored.
    hotlinkOnly: false,
    tags: hit.tags ? hit.tags.split(",").map((t) => t.trim()) : [],
  }));

  return { provider: "pixabay", results, total: body.total ?? results.length, error: null };
}
