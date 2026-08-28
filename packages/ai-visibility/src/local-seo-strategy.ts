import { z } from "zod";
import { callProvider, pickConfiguredProvider } from "./llm-caller";

// Real, on-demand local SEO strategy for Local SEO's Optimize page - one
// real LLM call per click (manual trigger only, never automatic), whose
// output the caller persists as a checklist so it isn't regenerated (and
// re-shuffled) on every visit. Unlike local-seo-guidance.ts (a single free-
// text tip), this returns multiple structured recommendations.

export interface LocalSeoStrategyInput {
  profile: {
    name: string;
    category: string | null;
    additionalCategories: string[];
    description: string | null;
    phone: string | null;
    website: string | null;
    hasHours: boolean;
    totalPhotos: number;
    rating: number | null;
    reviewCount: number;
  };
  gridSummary: { avgPosition: number | null; pctInTop3: number; gridSize: number } | null;
  topCompetitors: string[];
}

export interface LocalSeoRecommendation {
  category: "listing" | "content" | "reviews" | "technical";
  title: string;
  description: string;
}

const recommendationSchema = z.object({
  category: z.enum(["listing", "content", "reviews", "technical"]),
  title: z.string().min(1),
  description: z.string().min(1),
});

function buildPrompt(input: LocalSeoStrategyInput): string {
  const { profile, gridSummary, topCompetitors } = input;
  return `A local business's real Google listing and local-pack ranking data:

Name: ${profile.name}
Category: ${profile.category ?? "not set"}
Additional categories: ${profile.additionalCategories.length > 0 ? profile.additionalCategories.join(", ") : "none"}
Description: ${profile.description ?? "not set"}
Phone listed: ${profile.phone ? "yes" : "no"}
Website listed: ${profile.website ? "yes" : "no"}
Hours listed: ${profile.hasHours ? "yes" : "no"}
Photos: ${profile.totalPhotos}
Rating: ${profile.rating !== null ? `${profile.rating} (${profile.reviewCount} reviews)` : "no reviews yet"}
${gridSummary ? `Local-pack rank: average position ${gridSummary.avgPosition?.toFixed(1) ?? "not found"}, ${gridSummary.pctInTop3.toFixed(0)}% of a ${gridSummary.gridSize}x${gridSummary.gridSize} grid in the top 3` : "No rank-tracking data yet."}
${topCompetitors.length > 0 ? `Businesses currently outranking it nearby: ${topCompetitors.join(", ")}` : ""}

Based ONLY on what's actually missing or weak above, give 5-10 specific local SEO recommendations covering: listing completeness (missing category/hours/photos/description), content or pages worth building on the business's own website, review/citation building, and technical local SEO. Do not invent problems that aren't evidenced above.

Reply with ONLY a JSON array, no other text, in this exact shape:
[{"category": "listing" | "content" | "reviews" | "technical", "title": "short action title", "description": "1-2 sentence explanation"}]`;
}

function parseRecommendations(text: string): LocalSeoRecommendation[] {
  const jsonStart = text.indexOf("[");
  const jsonEnd = text.lastIndexOf("]");
  if (jsonStart === -1 || jsonEnd === -1) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const recommendations: LocalSeoRecommendation[] = [];
  for (const entry of parsed) {
    const result = recommendationSchema.safeParse(entry);
    if (result.success) recommendations.push(result.data);
  }
  return recommendations;
}

export async function generateLocalSeoStrategy(input: LocalSeoStrategyInput): Promise<LocalSeoRecommendation[] | null> {
  const provider = pickConfiguredProvider();
  if (!provider) return null;

  try {
    const text = await callProvider(provider, buildPrompt(input), 1500);
    const recommendations = parseRecommendations(text);
    return recommendations.length > 0 ? recommendations : null;
  } catch (err) {
    console.error(`[ai-visibility] generateLocalSeoStrategy via ${provider} failed:`, err);
    return null;
  }
}
