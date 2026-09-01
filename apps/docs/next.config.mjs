import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createMDX } from 'fumadocs-mdx/next';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Same standalone-server shape as apps/web (see its own next.config.mjs
  // comment on outputFileTracingRoot) - the Docker image runs this app's
  // compiled server.js as a second, internal-only process alongside
  // apps/web's, not `next start` against the full source tree.
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  // This app runs as its own internal process (see docker-entrypoint.sh)
  // and apps/web proxies /docs/* to it (see apps/web/next.config.ts's
  // rewrites) so both are reachable under one public origin/port - the
  // Next.js "Multi Zones" pattern. Content already lives under /docs/*
  // internally (docsRoute in src/lib/shared.ts), so no basePath is needed
  // here; assetPrefix only exists to keep this app's own _next/static
  // requests from colliding with apps/web's, once both are reachable
  // through the same origin.
  assetPrefix: '/docs-static',
};

export default withMDX(config);
