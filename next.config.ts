import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Cache Components are off for now: nearly every QuickPro screen is per-user
  // and per-request. See docs/decisions.md (D-006).
  cacheComponents: false,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Qualification documents are capped at 10 MB; leave room for form fields.
      bodySizeLimit: "11mb",
    },
    // proxy.ts buffers request bodies; keep its limit in step with the above.
    proxyClientMaxBodySize: "11mb",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
