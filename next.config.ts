import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Required for `forbidden()` and `unauthorized()` to interrupt rendering.
     * The RBAC guards in `src/lib/auth/require-admin.ts` depend on this: without
     * it the call is inert and a page would render for a role that may not see
     * it. There is a route-level test asserting the denial actually happens.
     */
    authInterrupts: true,
  },
};

export default nextConfig;
