import "server-only";

import type { ProviderImageResult } from "@/types";
import { ProviderNotConfiguredError, type ProviderSearchParams, type ProviderSearchResponse } from "./types";

interface UnsplashPhoto {
  id: string;
  width: number;
  height: number;
  links: { html: string; download_location: string };
  user: { name: string; links: { html: string } };
  urls: { thumb: string; small: string; regular: string; full: string };
  alt_description: string | null;
}

/**
 * Unsplash search.
 *
 * The Unsplash API guidelines require API uses to render the hotlinked image
 * URLs rather than re-hosting copies, and to trigger the download endpoint on a
 * download-like action. Results are therefore marked `hotlinkOnly`, and the
 * download tracking URL is carried through so the studio can ping it.
 */
export async function searchUnsplash({
  query,
  page,
  perPage,
  signal,
}: ProviderSearchParams): Promise<ProviderSearchResponse> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) throw new ProviderNotConfiguredError("Unsplash");

  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(Math.min(30, Math.max(1, perPage))));
  url.searchParams.set("page", String(page));
  url.searchParams.set("content_filter", "high");

  const response = await fetch(url, {
    headers: {
      Authorization: `Client-ID ${key}`,
      "Accept-Version": "v1",
    },
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    return { provider: "unsplash", results: [], total: 0, error: `Unsplash returned ${response.status}` };
  }

  const body = (await response.json()) as { total: number; results: UnsplashPhoto[] };

  const results: ProviderImageResult[] = (body.results ?? []).map((photo) => ({
    id: photo.id,
    provider: "unsplash",
    thumbUrl: photo.urls.thumb,
    previewUrl: photo.urls.small,
    fullUrl: photo.urls.regular,
    width: photo.width,
    height: photo.height,
    author: photo.user.name,
    authorUrl: photo.user.links.html,
    sourcePageUrl: photo.links.html,
    attributionText: `Photo by ${photo.user.name} on Unsplash`,
    hotlinkOnly: true,
    downloadTrackingUrl: photo.links.download_location,
    tags: photo.alt_description ? [photo.alt_description] : [],
  }));

  return { provider: "unsplash", results, total: body.total ?? results.length, error: null };
}

/** Fires the Unsplash download endpoint, as their guidelines require (§15). */
export async function trackUnsplashDownload(downloadLocation: string): Promise<boolean> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return false;
  if (!downloadLocation.startsWith("https://api.unsplash.com/")) return false;

  try {
    const response = await fetch(downloadLocation, {
      headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}
