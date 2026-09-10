import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { adminAuth, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { getDatastore, ensureSeeded, COLLECTIONS } from "@/server/datastore";
import type { AdminUser } from "@/types";

export const SESSION_COOKIE = "hm_admin_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 5; // 5 days

/**
 * Session handling (PRD §10.1).
 *
 * With Firebase configured the browser's ID token is exchanged for a Firebase
 * session cookie by the Admin SDK, and every privileged request re-verifies it.
 * Without Firebase, a signed local session is issued instead so the dashboard
 * remains operable in development; it carries the same claims and is subject to
 * the same role checks.
 */

function secret(): string {
  const value = process.env.AUTH_SESSION_SECRET;
  if (value && value.length >= 16) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SESSION_SECRET must be set to a strong value in production.");
  }
  // Development-only fallback; a real secret is required before deploying.
  return "hashmimart-dev-only-session-secret";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createLocalSessionToken(uid: string, expiresAtMs: number): string {
  const body = Buffer.from(JSON.stringify({ uid, exp: expiresAtMs })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyLocalSessionToken(token: string): { uid: string } | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = sign(body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      uid: string;
      exp: number;
    };
    if (!parsed.uid || parsed.exp < Date.now()) return null;
    return { uid: parsed.uid };
  } catch {
    return null;
  }
}

async function loadAdmin(uid: string): Promise<AdminUser | null> {
  await ensureSeeded();
  const doc = await getDatastore()
    .collection<AdminUser & { id: string }>(COLLECTIONS.admins)
    .get(uid);
  if (!doc) return null;
  const { id: _id, ...admin } = doc;
  void _id;
  return admin as AdminUser;
}

/** Resolves the signed-in admin, or null. Never throws on a bad cookie. */
export async function getSessionAdmin(): Promise<AdminUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let uid: string | null = null;

  if (isFirebaseAdminConfigured) {
    const auth = adminAuth();
    if (!auth) return null;
    try {
      const decoded = await auth.verifySessionCookie(token, true);
      uid = decoded.uid;
    } catch {
      return null;
    }
  } else {
    uid = verifyLocalSessionToken(token)?.uid ?? null;
  }

  if (!uid) return null;

  const admin = await loadAdmin(uid);
  if (!admin || !admin.active) return null;
  return admin;
}

export async function setSessionCookie(value: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export { loadAdmin };
