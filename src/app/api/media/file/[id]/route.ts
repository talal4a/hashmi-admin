import { NextResponse } from "next/server";
import { getSessionAdmin } from "@/lib/auth/session";
import { readLocalMedia } from "@/server/services/media-storage";

export const runtime = "nodejs";

/**
 * Authenticated delivery for locally stored media. Private assets must not be
 * publicly enumerable (PRD §10.3), so every read re-checks the session.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSessionAdmin();
  if (!admin) return new NextResponse("Not signed in", { status: 401 });

  const { id } = await params;
  const file = await readLocalMedia(decodeURIComponent(id));
  if (!file) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Length": String(file.data.byteLength),
    },
  });
}
