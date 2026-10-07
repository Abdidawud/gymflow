import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/** Origin of an absolute API base URL, so the CSP allows calls to a separate backend. */
function apiOrigin(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  try {
    return base.startsWith("http") ? new URL(base).origin : "";
  } catch {
    return "";
  }
}

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js bootstraps with inline scripts, and the theme script runs before paint.
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' ${apiOrigin()}`.trim(),
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  poweredByHeader: false,
  experimental: {
    // Every screen sits behind a client-side session check and renders a shell
    // skeleton on the server, so only segments that opt in are validated.
    instantInsights: { validationLevel: "manual-warning" },
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
    return isProduction ? [{ source: "/:path*", headers: securityHeaders }] : [];
  },
};

export default nextConfig;
