// Shared between apps/web/lib/current-project.ts (server) and
// project-switcher.tsx (client) - kept in its own file with no server-only
// imports (next/headers, @seo-tool/db) so importing the constant from a
// client component doesn't drag server code into the browser bundle.
export const ACTIVE_PROJECT_COOKIE = "active_project_id";
