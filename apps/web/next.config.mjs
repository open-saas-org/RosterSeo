import { fileURLToPath } from "node:url";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: [
    "@rosterseo/db",
    "@rosterseo/jobs",
    "@rosterseo/dataforseo",
    "@rosterseo/ai-visibility",
    "@rosterseo/google",
  ],
  images: {
    // next/image rejects local SVGs by default (they can embed <script>).
    // Every brand logo in the app - Insights nav icons, and now the
    // Publish/Social connector cards - is a real static SVG we own in
    // public/, not user-uploaded, so this is safe; the CSP still sandboxes
    // anything served through the image optimizer regardless.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  // Serves the docs (apps/docs, a separate Fumadocs Next.js app) at /docs
  // on this same origin/port instead of a separate subdomain - Next.js's
  // documented "Multi Zones" pattern. docker-entrypoint.sh runs the docs
  // app as a second internal-only process (DOCS_INTERNAL_URL, default
  // http://127.0.0.1:3001) alongside this one; only this app's port is
  // ever exposed publicly. /docs-static/* carries the docs app's own
  // _next/static assets (see its assetPrefix) so they don't collide with
  // this app's own /_next/*.
  async rewrites() {
    const docsUrl = (process.env.DOCS_INTERNAL_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
    return [
      { source: "/docs", destination: `${docsUrl}/docs` },
      { source: "/docs/:path*", destination: `${docsUrl}/docs/:path*` },
      { source: "/docs-static/:path*", destination: `${docsUrl}/docs-static/:path*` },
      { source: "/api/search", destination: `${docsUrl}/api/search` },
      { source: "/llms.txt", destination: `${docsUrl}/llms.txt` },
      { source: "/llms-full.txt", destination: `${docsUrl}/llms-full.txt` },
      { source: "/llms.mdx/:path*", destination: `${docsUrl}/llms.mdx/:path*` },
      { source: "/og/docs/:path*", destination: `${docsUrl}/og/docs/:path*` },
    ];
  },
};

// Safe with no Sentry config at all - source-map upload (which needs
// SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN) is silently skipped when
// those aren't set; this wrap doesn't require SENTRY_DSN either, that's
// only checked at runtime in instrumentation.ts.
export default withSentryConfig(nextConfig, {
  silent: true,
  webpack: { treeshake: { removeDebugLogging: true } },
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
