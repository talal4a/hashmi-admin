import { NextResponse } from "next/server";
import { getSessionAdmin } from "@/lib/auth/session";
import { canAny } from "@/lib/auth/permissions";
import { clientKey, rateLimit } from "@/lib/auth/rate-limit";
import { isAllowedImageUrl } from "@/lib/media/providers/hosts";

export const runtime = "nodejs";

/** A stock photo above this is not a product packshot; it is a mistake. */
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * GET /api/media/proxy?url=… — re-serves a provider image from this origin.
 *
 * Canvas work (cropping, background removal, reading pixels for the palette)
 * needs same-origin pixels. Pixabay's CDN sends no `Access-Control-Allow-Origin`
 * at all, and networks that block image CDNs break the rest, so going through
 * the server is both the correct and the more reliable path.
 *
 * The URL is checked against a fixed host list before and after redirects, so
 * this cannot be turned into a general-purpose fetcher.
 */
export async function GET(request: Request) {
  const admin = await getSessionAdmin();
  if (!admin) return new NextResponse("Not signed in", { status: 401 });
  if (!canAny(admin, ["products.write", "categories.write", "marketing.write"])) {
    return new NextResponse("Your role cannot process media", { status: 403 });
  }

  const limit = rateLimit(clientKey(request, `media-proxy:${admin.uid}`), 120, 60_000);
  if (!limit.allowed) {
    return new NextResponse("Too many image requests.", {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  const target = new URL(request.url).searchParams.get("url") ?? "";
  if (!isAllowedImageUrl(target)) {
    return new NextResponse("That image host is not allowed.", { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      redirect: "follow",
      headers: { Accept: "image/*" },
    });
  } catch {
    return new NextResponse("The image provider could not be reached.", { status: 502 });
  }

  // A redirect must not be able to walk off the allowlist.
  if (!isAllowedImageUrl(upstream.url || target)) {
    return new NextResponse("That image redirected somewhere not allowed.", { status: 400 });
  }
  if (!upstream.ok) {
    return new NextResponse("The provider did not return that image.", { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  // Pixabay's CDN labels its files `binary/octet-stream`, so an unspecific type
  // is tolerated; anything that positively claims to be non-image is not.
  if (contentType.startsWith("text/") || contentType.includes("html")) {
    return new NextResponse("That URL is not an image.", { status: 400 });
  }

  const declared = Number(upstream.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) {
    return new NextResponse("That image is too large to process.", { status: 413 });
  }

  const buffer = new Uint8Array(await upstream.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) {
    return new NextResponse("That image is too large to process.", { status: 413 });
  }

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType.startsWith("image/") ? contentType : "image/jpeg",
      "Content-Length": String(buffer.byteLength),
      // Private: this is fetched with the admin's session, not for public edges.
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      // Same-origin already, but this keeps the header honest for the canvas.
      "Access-Control-Allow-Origin": "*",
    },
  });
}
