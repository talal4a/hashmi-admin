#!/usr/bin/env node
/**
 * Route-level RBAC check against a running dev server.
 *
 * Signs in as each seeded role and asserts that every module outside that role
 * renders the permission-denied UI and leaks none of the module's data.
 *
 * Status codes alone are not a reliable signal here: Next streams the shell and
 * commits a 200 before the render is interrupted, so this checks the *content*.
 *
 *   npm run dev &
 *   node --env-file=.env.local scripts/check-rbac.mjs
 */

const BASE = process.env.RBAC_CHECK_URL ?? "http://127.0.0.1:3000";
const PASSWORD = process.env.DEV_ADMIN_PASSWORD;

/** Text that only appears once a module has actually rendered its data. */
const MODULE_EVIDENCE = {
  // Chosen so it renders for view-only roles too, not just those who can write.
  "/products": "Search name, SKU",
  "/categories": "Category order",
  // A category's own page is a second door into the same data, so it is
  // checked as its own module rather than assumed to inherit the list's guard.
  "/categories/cat-vegetables": "Products in this category",
  "/inventory": "Recent stock movements",
  "/orders": "awaiting action",
  "/voice-orders": "Needs review",
  "/customers": "lifetime",
  "/support": "open conversation",
  "/offers": "Product offers",
  "/banners": "Home content",
  "/vendors": "Vendors &amp; stores",
  "/societies": "Delivery areas",
  "/analytics": "Busiest hour",
  "/notifications": "Notification log",
  "/admins": "What each role can do",
  "/settings": "Count revenue from",
  "/audit": "Change history",
};

const DENIED_MARKER = "have access to";

const ROLES = [
  {
    email: "admin@hashmimart.example",
    role: "super_admin",
    allowed: Object.keys(MODULE_EVIDENCE),
  },
  {
    email: "catalog@hashmimart.example",
    role: "catalog_manager",
    allowed: [
      "/products", "/categories", "/categories/cat-vegetables", "/inventory",
      "/offers", "/banners", "/vendors", "/analytics",
    ],
  },
  {
    email: "orders@hashmimart.example",
    role: "order_manager",
    allowed: [
      "/orders", "/voice-orders", "/inventory",
      "/customers", "/products", "/notifications", "/support",
    ],
  },
  {
    email: "support@hashmimart.example",
    role: "support_agent",
    allowed: [
      "/orders", "/voice-orders", "/customers",
      "/support", "/notifications", "/products",
    ],
  },
];

async function signIn(email) {
  const response = await fetch(`${BASE}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "local", email, password: PASSWORD }),
  });
  if (!response.ok) {
    throw new Error(`Sign-in failed for ${email}: ${response.status}`);
  }
  const cookie = response.headers.getSetCookie?.() ?? [];
  const session = cookie.find((c) => c.startsWith("hm_admin_session="));
  if (!session) throw new Error(`No session cookie returned for ${email}`);
  return session.split(";")[0];
}

async function main() {
  if (!PASSWORD) {
    console.error("DEV_ADMIN_PASSWORD is not set — run with --env-file=.env.local");
    process.exitCode = 1;
    return;
  }

  const failures = [];
  let checks = 0;

  // An unauthenticated request must never reach an admin route.
  const anonymous = await fetch(`${BASE}/dashboard`, { redirect: "manual" });
  checks += 1;
  if (anonymous.status !== 307 || !(anonymous.headers.get("location") ?? "").includes("/login")) {
    failures.push(`anonymous /dashboard did not redirect to /login (got ${anonymous.status})`);
  }

  for (const subject of ROLES) {
    const cookie = await signIn(subject.email);

    for (const [route, evidence] of Object.entries(MODULE_EVIDENCE)) {
      const html = await (await fetch(`${BASE}${route}`, { headers: { cookie } })).text();
      const rendered = html.includes(evidence);
      const denied = html.includes(DENIED_MARKER);
      const shouldSee = subject.allowed.includes(route);
      checks += 1;

      if (shouldSee && !rendered) {
        failures.push(`${subject.role} should see ${route} but its content did not render`);
      }
      if (!shouldSee && rendered) {
        failures.push(`LEAK: ${subject.role} must not see ${route}, but its data rendered`);
      }
      if (!shouldSee && !denied) {
        failures.push(`${subject.role} was not shown the permission-denied UI on ${route}`);
      }
    }
  }

  console.log(`Ran ${checks} route-level authorization checks across ${ROLES.length} roles.`);

  if (failures.length > 0) {
    console.error("\nAUTHORIZATION FAILURES:");
    for (const failure of failures) console.error(`  ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log("Every role sees exactly its own modules; no module data leaked across roles.");
}

await main();
