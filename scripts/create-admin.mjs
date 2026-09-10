#!/usr/bin/env node
/**
 * Creates (or repairs) an admin login, so nobody has to click through the
 * Firebase Console and hand-build a Firestore document to get in.
 *
 *   npm run create-admin -- you@example.com yourpassword
 *
 * With Firebase configured it creates the Auth user and the matching
 * `admins/{uid}` document in one go — both are required, and missing either one
 * is the usual reason a correct password still gets rejected.
 *
 * With Firebase not configured it says so and prints the local sign-in details
 * instead, rather than pretending to have done something.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

/* Resolve the credential exactly as src/lib/firebase/admin.ts does. */
function resolveCredential() {
  const configured = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const candidates = configured
    ? [configured]
    : ["service-account.json", "serviceAccountKey.json", "firebase-service-account.json"];

  for (const candidate of candidates) {
    const filePath = path.isAbsolute(candidate) ? candidate : path.join(ROOT, candidate);
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8"));
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          source: `file (${candidate})`,
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: String(parsed.private_key).replace(/\\n/g, "\n"),
        };
      }
      console.warn(`  ${candidate} exists but is missing project_id, client_email or private_key.`);
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.warn(`  Could not read ${candidate}: ${error.message}`);
      }
    }
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (projectId && clientEmail && privateKey) {
    return { source: "environment variables", projectId, clientEmail, privateKey };
  }
  return null;
}

function usage() {
  console.log("\nUsage:\n  npm run create-admin -- <email> <password>\n");
  console.log("Example:\n  npm run create-admin -- talal@hashmimart.com MyPassword123\n");
  console.log("The password must be at least 6 characters (Firebase's minimum).\n");
}

async function main() {
  const [email, password] = process.argv.slice(2);

  const credential = resolveCredential();

  /* ---- Not connected to Firebase: explain local sign-in instead. ---- */
  if (!credential) {
    const devPassword = process.env.DEV_ADMIN_PASSWORD;
    console.log("\nFirebase is not configured, so the app is in LOCAL mode.");
    console.log("No Firebase user is needed — sign in with the seeded account:\n");
    console.log("  Email:    admin@hashmimart.example");
    console.log(`  Password: ${devPassword ?? "(DEV_ADMIN_PASSWORD is not set in .env.local)"}\n`);
    if (!devPassword) {
      console.log("Add DEV_ADMIN_PASSWORD to .env.local, then restart `npm run dev`.\n");
      process.exitCode = 1;
      return;
    }
    console.log("If that password is rejected, restart `npm run dev` — .env.local is");
    console.log("only read at startup.\n");
    console.log("To connect Firebase instead, add service-account.json to the project root");
    console.log("and run this command again.\n");
    return;
  }

  /* ---- Connected: create the Auth user and the admins document. ---- */
  console.log(`\nFirebase project: ${credential.projectId}`);
  console.log(`Credential from:  ${credential.source}\n`);

  if (!email || !password) {
    console.error("An email and password are required.");
    usage();
    process.exitCode = 1;
    return;
  }
  if (password.length < 6) {
    console.error(`Password is ${password.length} characters; Firebase requires at least 6.`);
    process.exitCode = 1;
    return;
  }

  const { cert, initializeApp } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  const { getFirestore } = await import("firebase-admin/firestore");

  const app = initializeApp({
    credential: cert({
      projectId: credential.projectId,
      clientEmail: credential.clientEmail,
      privateKey: credential.privateKey,
    }),
    projectId: credential.projectId,
  });

  const auth = getAuth(app);
  const db = getFirestore(app);

  // 1. The Auth user — created, or its password reset if it already exists.
  let user;
  try {
    user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password });
    console.log(`Auth user already existed — password reset.  uid: ${user.uid}`);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      user = await auth.createUser({ email, password, emailVerified: true });
      console.log(`Auth user created.                          uid: ${user.uid}`);
    } else {
      throw error;
    }
  }

  // 2. A custom claim, so the Firestore security rules can recognise an admin
  //    without reading a document on every request.
  await auth.setCustomUserClaims(user.uid, { admin: true, role: "super_admin" });
  console.log("Custom claims set:                          admin, super_admin");

  // 3. The admins document the dashboard checks on every request. Without it,
  //    Firebase accepts the password but the dashboard still refuses entry.
  const existing = await db.collection("admins").doc(user.uid).get();
  await db
    .collection("admins")
    .doc(user.uid)
    .set(
      {
        id: user.uid,
        uid: user.uid,
        email,
        displayName: existing.exists ? (existing.data().displayName ?? email.split("@")[0]) : email.split("@")[0],
        role: "super_admin",
        active: true,
        createdAt: existing.exists ? (existing.data().createdAt ?? new Date().toISOString()) : new Date().toISOString(),
      },
      { merge: true },
    );
  console.log(`admins/${user.uid} ${existing.exists ? "updated" : "created"}.`);

  // Any stale admin record keyed by something other than the uid would shadow
  // this one in the list, so point it out rather than leaving a duplicate.
  const byEmail = await db.collection("admins").where("email", "==", email).get();
  const strays = byEmail.docs.filter((d) => d.id !== user.uid);
  if (strays.length > 0) {
    console.log(
      `\nNote: ${strays.length} other admins document(s) use this email: ${strays
        .map((d) => d.id)
        .join(", ")}. Delete them in the Firebase Console to avoid duplicates.`,
    );
  }

  console.log("\nDone. Sign in at http://localhost:3000/login with:\n");
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}\n`);
  console.log("If it still refuses, check Firebase Console -> Authentication ->");
  console.log("Sign-in method and make sure Email/Password is enabled.\n");
}

main().catch((error) => {
  const message = String(error.message ?? error);
  console.error(`\nFailed: ${message}\n`);

  // Translate the two failures people actually hit into something actionable.
  if (message.includes("PEM") || message.includes("DECODER") || message.includes("asn1")) {
    console.error("The private key could not be parsed. If you are using environment");
    console.error("variables, it must be one line in double quotes with its \\n markers");
    console.error("intact — or drop service-account.json in the project root instead.\n");
  } else if (message.includes("invalid_grant") || message.includes("account not found")) {
    console.error("Firebase rejected the credential itself. Either the key was revoked, or");
    console.error("it belongs to a different project. Generate a fresh one at Project");
    console.error("Settings -> Service Accounts -> Generate new private key.\n");
  } else if (message.includes("ENOTFOUND") || message.includes("ETIMEDOUT")) {
    console.error("Could not reach Firebase. Check your internet connection.\n");
  }
  process.exitCode = 1;
});
