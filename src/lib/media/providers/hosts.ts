/**
 * Image hosts the media proxy is allowed to fetch from.
 *
 * The proxy exists so the browser only ever loads pixels from this origin — a
 * canvas fed a third-party image is either blocked outright (cdn.pixabay.com
 * sends no CORS header at all) or becomes tainted, which is what left every
 * product sitting on the fallback pale-cyan card. A proxy that would fetch any
 * URL is an SSRF hole, so it fetches only from this list, and only over HTTPS.
 */

export const ALLOWED_IMAGE_HOSTS = [
  // Pixabay
  "pixabay.com",
  "cdn.pixabay.com",
  // Pexels
  "images.pexels.com",
  "www.pexels.com",
  // Unsplash
  "images.unsplash.com",
  "plus.unsplash.com",
] as const;

/** Exact host match only — no suffix matching, which `evil-pixabay.com` defeats. */
export function isAllowedImageUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return (ALLOWED_IMAGE_HOSTS as readonly string[]).includes(url.hostname);
}

/**
 * Rewrites a provider URL to the same-origin proxy. Anything not on the list is
 * returned untouched, so uploads and blob/data URLs pass straight through.
 */
export function proxiedImageUrl(raw: string): string {
  return isAllowedImageUrl(raw) ? `/api/media/proxy?url=${encodeURIComponent(raw)}` : raw;
}
