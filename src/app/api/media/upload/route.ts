import { NextResponse } from "next/server";
import { getSessionAdmin } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { clientKey, rateLimit } from "@/lib/auth/rate-limit";
import { MAX_UPLOAD_BYTES, storeMedia, validateUpload } from "@/server/services/media-storage";

export const runtime = "nodejs";

/**
 * POST /api/media/upload — accepts an authenticated admin's original or
 * processed image and stores it (PRD §15). Type and size are validated here,
 * not just in the browser.
 */
export async function POST(request: Request) {
  const admin = await getSessionAdmin();
  if (!admin) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!can(admin, "products.write") && !can(admin, "categories.write") && !can(admin, "marketing.write")) {
    return NextResponse.json({ error: "Your role cannot upload media." }, { status: 403 });
  }

  const limit = rateLimit(clientKey(request, `media-upload:${admin.uid}`), 60, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many uploads. Wait a moment." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Could not read the upload." }, { status: 400 });
  }

  const file = form.get("file");
  const kind = String(form.get("kind") ?? "original");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was provided." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Image must be smaller than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` },
      { status: 413 },
    );
  }

  const problem = validateUpload(file.type, file.size);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const width = Number(form.get("width")) || null;
  const height = Number(form.get("height")) || null;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await storeMedia(buffer, file.type, kind === "cutout" ? "cutouts" : "originals");
    return NextResponse.json({
      url: stored.url,
      storageId: stored.storageId,
      mimeType: stored.mimeType,
      bytes: stored.bytes,
      width,
      height,
    });
  } catch (error) {
    console.error("[hashmimart-admin] media upload failed", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }
}
