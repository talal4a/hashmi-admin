import { NextResponse } from "next/server";
import { z } from "zod";
import { adminAuth, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { clientKey, rateLimit } from "@/lib/auth/rate-limit";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  clearSessionCookie,
  createLocalSessionToken,
  getSessionAdmin,
  loadAdmin,
  setSessionCookie,
} from "@/lib/auth/session";
import { ensureSeeded, getDatastore, COLLECTIONS } from "@/server/datastore";
import type { AdminUser } from "@/types";

export const runtime = "nodejs";

const FirebaseBody = z.object({ mode: z.literal("firebase"), idToken: z.string().min(20) });
const LocalBody = z.object({
  mode: z.literal("local"),
  email: z.string().email(),
  password: z.string().min(1),
});
const Body = z.discriminatedUnion("mode", [FirebaseBody, LocalBody]);

/**
 * POST /api/auth/session — verify the caller, confirm they are an active admin,
 * then issue a secure HttpOnly session cookie (PRD §15).
 */
export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, "session"), 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  await ensureSeeded();

  if (parsed.mode === "firebase") {
    const auth = adminAuth();
    if (!auth) {
      return NextResponse.json({ error: "Firebase is not configured on the server." }, { status: 503 });
    }
    let uid: string;
    let email: string | undefined;
    try {
      const decoded = await auth.verifyIdToken(parsed.idToken, true);
      uid = decoded.uid;
      email = decoded.email;
    } catch {
      return NextResponse.json({ error: "Sign-in could not be verified." }, { status: 401 });
    }

    const admin = await resolveAdmin(uid, email);
    if (!admin) {
      return NextResponse.json(
        { error: "This account is not an active HashmiMart admin." },
        { status: 403 },
      );
    }

    const sessionCookie = await auth.createSessionCookie(parsed.idToken, {
      expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
    });
    await setSessionCookie(sessionCookie);
    await touchLastLogin(admin);
    return NextResponse.json({ admin: publicAdmin(admin) });
  }

  /* Local development sign-in — only available while Firebase is unconfigured. */
  if (isFirebaseAdminConfigured) {
    return NextResponse.json(
      { error: "Local sign-in is disabled because Firebase is configured." },
      { status: 400 },
    );
  }

  const devPassword = process.env.DEV_ADMIN_PASSWORD;
  if (!devPassword) {
    return NextResponse.json(
      {
        error:
          "Local sign-in needs DEV_ADMIN_PASSWORD in .env.local, or configure Firebase for real authentication.",
      },
      { status: 503 },
    );
  }
  if (parsed.password !== devPassword) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  const admins = await getDatastore().collection<AdminUser & { id: string }>(COLLECTIONS.admins).all();
  const match = admins.find((a) => a.email.toLowerCase() === parsed.email.toLowerCase());
  if (!match || !match.active) {
    return NextResponse.json(
      { error: "This account is not an active HashmiMart admin." },
      { status: 403 },
    );
  }

  await setSessionCookie(
    createLocalSessionToken(match.uid, Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
  );
  await touchLastLogin(match);
  return NextResponse.json({ admin: publicAdmin(match) });
}

/** DELETE /api/auth/session — revoke the local session cookie. */
export async function DELETE(request: Request) {
  const admin = await getSessionAdmin();
  const url = new URL(request.url);

  if (admin && isFirebaseAdminConfigured && url.searchParams.get("revokeRefreshTokens") === "1") {
    // Security action: also invalidate every refresh token for this account.
    try {
      await adminAuth()?.revokeRefreshTokens(admin.uid);
    } catch {
      // A revoke failure must not leave the browser holding a session cookie.
    }
  }

  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const admin = await getSessionAdmin();
  return NextResponse.json({ admin: admin ? publicAdmin(admin) : null });
}

async function resolveAdmin(uid: string, email?: string): Promise<AdminUser | null> {
  const byUid = await loadAdmin(uid);
  if (byUid?.active) return byUid;
  if (!email) return null;
  const admins = await getDatastore().collection<AdminUser & { id: string }>(COLLECTIONS.admins).all();
  const byEmail = admins.find((a) => a.email.toLowerCase() === email.toLowerCase() && a.active);
  if (!byEmail) return null;
  // First sign-in for a pre-provisioned admin: bind the record to the Auth uid.
  const col = getDatastore().collection<AdminUser & { id: string }>(COLLECTIONS.admins);
  await col.remove(byEmail.uid);
  const bound = { ...byEmail, uid, id: uid };
  await col.set(bound);
  return bound;
}

async function touchLastLogin(admin: AdminUser): Promise<void> {
  try {
    await getDatastore()
      .collection<AdminUser & { id: string }>(COLLECTIONS.admins)
      .update(admin.uid, { lastLoginAt: new Date().toISOString() });
  } catch {
    // Login must not fail because the timestamp could not be written.
  }
}

function publicAdmin(admin: AdminUser) {
  return {
    uid: admin.uid,
    email: admin.email,
    displayName: admin.displayName,
    role: admin.role,
  };
}

export { SESSION_COOKIE };
