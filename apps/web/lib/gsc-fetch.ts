// Moved to @seo-tool/google (gsc-window.ts) so apps/worker's Site Audit
// cannibalization check can import the exact same implementation - this
// file is now just a re-export so none of its existing callers
// (gsc-insights/route.ts, dashboard page.tsx, gsc-insights/page.tsx) need
// to change their import path.
export { fetchGscExactWindow, type GscExactWindowResult } from "@seo-tool/google";
