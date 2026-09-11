import { NextResponse } from "next/server";
import { getSessionAdmin } from "@/lib/auth/session";
import { canAny } from "@/lib/auth/permissions";
import { specForFile } from "@/lib/media/model-catalog";
import { ModelIntegrityError, ensureModel, findOnDisk, streamModel } from "@/server/services/model-store";

export const runtime = "nodejs";
/** A 170 MB verified download must never be cut short by a function timeout. */
export const maxDuration = 300;

/**
 * GET /api/media/model/<file> — serves a pinned segmentation model.
 *
 * The browser asks this origin for the weights instead of a third-party CDN, so
 * the cutout works on networks that block those hosts, and the bytes are
 * checked against the catalogue before they are ever handed out.
 *
 * HEAD answers the "is this going to work?" probe without moving any data.
 */
async function guard(file: string) {
  const admin = await getSessionAdmin();
  if (!admin) return { error: new NextResponse("Not signed in", { status: 401 }) };
  if (!canAny(admin, ["products.write", "categories.write", "marketing.write"])) {
    return { error: new NextResponse("Your role cannot process media", { status: 403 }) };
  }

  const spec = specForFile(file);
  if (!spec) return { error: new NextResponse("Unknown model", { status: 404 }) };
  return { spec };
}

const CACHE_HEADERS = {
  // Pinned by hash, so the bytes behind this URL can never change.
  "Cache-Control": "private, max-age=31536000, immutable",
  "Content-Type": "application/octet-stream",
};

export async function HEAD(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const checked = await guard(file);
  if (checked.error) return checked.error;

  // A probe reports what is already available; it never starts a download.
  const found = await findOnDisk(checked.spec);
  return new NextResponse(null, {
    status: 200,
    headers: {
      ...CACHE_HEADERS,
      "Content-Length": String(checked.spec.bytes),
      "X-Model-Ready": found ? "1" : "0",
    },
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const checked = await guard(file);
  if (checked.error) return checked.error;

  try {
    const resolved = await ensureModel(checked.spec);
    return new NextResponse(streamModel(resolved), {
      headers: { ...CACHE_HEADERS, "Content-Length": String(resolved.bytes) },
    });
  } catch (error) {
    if (error instanceof ModelIntegrityError) {
      console.error(`[hashmimart-admin] ${error.message}`);
      return new NextResponse(error.message, { status: 502 });
    }
    console.error("[hashmimart-admin] model delivery failed");
    return new NextResponse(
      "The background-removal model could not be fetched. Check the server's internet access, or place the file in public/models/.",
      { status: 502 },
    );
  }
}
