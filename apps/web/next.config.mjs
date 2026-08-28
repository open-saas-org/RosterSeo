import { fileURLToPath } from "node:url";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: [
    "@seo-tool/db",
    "@seo-tool/jobs",
    "@seo-tool/dataforseo",
    "@seo-tool/ai-visibility",
    "@seo-tool/google",
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
