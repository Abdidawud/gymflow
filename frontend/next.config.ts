import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Optional: forward /api/v1 to a separately running API server instead of the
 * one built into this app (src/app/api/v1/[...path]/route.ts). Set at build
 * time, e.g. API_PROXY_TARGET=http://127.0.0.1:4000.
 */
const apiProxyTarget = process.env.API_PROXY_TARGET?.replace(/\/$/, "");

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
  // The API (backend/) runs inside the web app's route handler; its Node.js server
  // libraries are loaded at runtime instead of bundled (pg, sharp and argon2 already are by default).
  serverExternalPackages: [
    "fastify",
    "@fastify/cookie",
    "@fastify/cors",
    "@fastify/multipart",
    "@fastify/rate-limit",
    "nodemailer",
  ],
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
  async rewrites() {
    return apiProxyTarget ? [{ source: "/api/v1/:path*", destination: `${apiProxyTarget}/api/v1/:path*` }] : [];
  },
};

export default nextConfig;
