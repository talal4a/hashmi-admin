import "server-only";

import type { ProviderImageResult } from "@/types";
import { ProviderNotConfiguredError, type ProviderSearchParams, type ProviderSearchResponse } from "./types";

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  src: { tiny: string; medium: string; large2x: string; original: string };
  alt: string;
}

/** Pexels search. Attribution is preserved and shown in the picker (§5.1). */
export async function searchPexels({
  query,
  page,
  perPage,
  signal,
}: ProviderSearchParams): Promise<ProviderSearchResponse> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new ProviderNotConfiguredError("Pexels");

  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(Math.min(80, Math.max(1, perPage))));
  url.searchParams.set("page", String(page));

  const response = await fetch(url, {
    headers: { Authorization: key },
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    return { provider: "pexels", results: [], total: 0, error: `Pexels returned ${response.status}` };
  }

  const body = (await response.json()) as { total_results: number; photos: PexelsPhoto[] };

  const results: ProviderImageResult[] = (body.photos ?? []).map((photo) => ({
    id: String(photo.id),
    provider: "pexels",
    thumbUrl: photo.src.tiny,
    previewUrl: photo.src.medium,
    fullUrl: photo.src.large2x,
    width: photo.width,
    height: photo.height,
    author: photo.photographer,
    authorUrl: photo.photographer_url,
    sourcePageUrl: photo.url,
    attributionText: `Photo by ${photo.photographer} on Pexels`,
    hotlinkOnly: false,
    tags: photo.alt ? [photo.alt] : [],
  }));

  return { provider: "pexels", results, total: body.total_results ?? results.length, error: null };
}
