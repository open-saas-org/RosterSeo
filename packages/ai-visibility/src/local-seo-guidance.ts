import { callProvider, pickConfiguredProvider } from "./llm-caller";

// Real, on-demand tip for a geo-grid scan with weak coverage - one real LLM
// call per click (not automatic on scan completion), same cost-predictable
// pattern as visibility-opportunity.ts.

export interface LocalGridSummary {
  avgPosition: number | null; // null when the business wasn't found at any grid point
  pctInTop3: number; // 0-100
  gridSize: number;
}

function buildPrompt(keyword: string, businessName: string, summary: LocalGridSummary): string {
  return `A local business ("${businessName}") was just checked for its Google Maps local-pack ranking for the search "${keyword}" across a ${summary.gridSize}x${summary.gridSize} grid of points around its location.

Results: ${summary.avgPosition === null ? "not found in the top results at any grid point" : `average position ${summary.avgPosition.toFixed(1)}`}, with ${summary.pctInTop3.toFixed(0)}% of grid points showing it in the top 3 (the "map pack").

Give 3-5 specific, actionable local SEO steps this business could take to rank better across more of this grid (Google Business Profile completeness, reviews, citations/NAP consistency, on-page local signals, etc). Be concrete, not generic SEO advice. Reply as a short bullet list only.`;
}

export async function generateLocalSeoGuidance(
  keyword: string,
  businessName: string,
  summary: LocalGridSummary,
): Promise<string | null> {
  const provider = pickConfiguredProvider();
  if (!provider) return null;

  try {
    const text = await callProvider(provider, buildPrompt(keyword, businessName, summary), 500);
    return text.trim() || null;
  } catch (err) {
    console.error(`[ai-visibility] generateLocalSeoGuidance via ${provider} failed:`, err);
    return null;
  }
}
