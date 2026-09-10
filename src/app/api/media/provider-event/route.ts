import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionAdmin } from "@/lib/auth/session";
import { trackUnsplashDownload } from "@/lib/media/providers/unsplash";

export const runtime = "nodejs";

const Body = z.object({
  provider: z.literal("unsplash"),
  event: z.literal("download"),
  downloadLocation: z.string().url(),
});

/**
 * POST /api/media/provider-event — fires provider-required tracking events.
 * Unsplash requires the download endpoint to be triggered on a download-like
 * action; the request is made server-side so the access key stays private.
 */
export async function POST(request: Request) {
  const admin = await getSessionAdmin();
  if (!admin) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid event." }, { status: 400 });

  const tracked = await trackUnsplashDownload(parsed.data.downloadLocation);
  // A tracking miss must never block the admin's workflow.
  return NextResponse.json({ tracked });
}
