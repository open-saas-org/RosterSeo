import type { ClayToolDef } from "@seo-tool/ai-visibility";
import * as read from "./read";
import * as write from "./write";

export type ClayToolContext = { userId: string; projectId: string };
export type ClayProject = { id: string; domain: string; name: string };

export type ClayToolSpec = ClayToolDef & { requiresConfirmation: boolean };

// Every tool Clay can call, in one place - real read tools (mirroring
// apps/mcp-server's proven query logic, see tools/read.ts) auto-execute;
// real write tools (tools/write.ts) always pause for the user's explicit
// Approve/Deny in the chat UI, except update_project_notes (see its own
// comment in write.ts). No `projectId` param on any of these - Clay is
// always scoped to whichever project the chat panel is open on
// (ClayToolContext), never asked-for by the model.
export const CLAY_TOOLS: ClayToolSpec[] = [
  {
    name: "get_project_details",
    description: "Full details for the current project (domain, target location, connected properties).",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    requiresConfirmation: false,
  },
  {
    name: "get_tracked_keywords",
    description: "Tracked keywords for the current project (Rank Tracking).",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    requiresConfirmation: false,
  },
  {
    name: "get_keyword_rankings",
    description: "Real position-check history for tracked keywords, most recent first.",
    parameters: {
      type: "object",
      properties: { keyword: { type: "string", description: "Filter to one tracked keyword's exact text (optional)" }, limit: { type: "number", description: "Max rows (default 100)" } },
      additionalProperties: false,
    },
    requiresConfirmation: false,
  },
  {
    name: "get_site_audits",
    description: "Site audit run history (status, health score, pages crawled).",
    parameters: { type: "object", properties: { limit: { type: "number", description: "Max audits (default 10)" } }, additionalProperties: false },
    requiresConfirmation: false,
  },
  {
    name: "get_site_audit_detail",
    description: "One site audit's full issue list and crawled pages.",
    parameters: { type: "object", properties: { auditId: { type: "string" } }, required: ["auditId"], additionalProperties: false },
    requiresConfirmation: false,
  },
  {
    name: "get_competitors",
    description: "Tracked competitor domains for the current project.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    requiresConfirmation: false,
  },
  {
    name: "get_brand_visibility",
    description: "AI-answer-engine brand visibility: tracked prompts, real sample results, and visibility percent for the project's own brand.",
    parameters: { type: "object", properties: { limit: { type: "number", description: "Max result rows (default 200)" } }, additionalProperties: false },
    requiresConfirmation: false,
  },
  {
    name: "get_ai_visibility_opportunities",
    description: "The latest AI-visibility content/outreach opportunity report for the current project.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    requiresConfirmation: false,
  },
  {
    name: "get_page_analyzer_reports",
    description: "Past Page Analyzer report runs (url, target keyword, status, date).",
    parameters: { type: "object", properties: { limit: { type: "number", description: "Max reports (default 20)" } }, additionalProperties: false },
    requiresConfirmation: false,
  },
  {
    name: "get_page_analyzer_report",
    description: "One Page Analyzer report's full stored result (crawl data, SERP comparison, fix-it findings, AI guidance).",
    parameters: { type: "object", properties: { reportId: { type: "string" } }, required: ["reportId"], additionalProperties: false },
    requiresConfirmation: false,
  },
  {
    name: "get_keyword_research_history",
    description: "Past keyword research searches for the project, plus their cached real metrics.",
    parameters: { type: "object", properties: { limit: { type: "number", description: "Max searches (default 20)" } }, additionalProperties: false },
    requiresConfirmation: false,
  },
  {
    name: "research_keywords",
    description: "Real, live DataForSEO keyword research for a seed term: ideas, related terms, and suggestions with search volume/difficulty/CPC.",
    parameters: {
      type: "object",
      properties: { seedKeyword: { type: "string" }, locationCode: { type: "number", description: "DataForSEO location code (default 2840 = United States)" }, limit: { type: "number" } },
      required: ["seedKeyword"],
      additionalProperties: false,
    },
    requiresConfirmation: false,
  },
  {
    name: "get_keyword_metrics",
    description: "Real search volume, difficulty, CPC, and intent for one exact keyword.",
    parameters: { type: "object", properties: { keyword: { type: "string" }, locationCode: { type: "number" } }, required: ["keyword"], additionalProperties: false },
    requiresConfirmation: false,
  },
  {
    name: "get_serp_results",
    description: "Real live top-10 Google SERP for a keyword.",
    parameters: { type: "object", properties: { keyword: { type: "string" }, location: { type: "string", description: 'Location name (default "United States")' } }, required: ["keyword"], additionalProperties: false },
    requiresConfirmation: false,
  },
  {
    name: "get_backlinks_overview",
    description: "Real backlink profile summary for a domain (total backlinks, referring domains, rank).",
    parameters: { type: "object", properties: { domain: { type: "string" } }, required: ["domain"], additionalProperties: false },
    requiresConfirmation: false,
  },
  {
    name: "get_domain_overview",
    description: "Real organic-traffic domain overview (estimated traffic, ranked keywords count, domain rank).",
    parameters: { type: "object", properties: { domain: { type: "string" }, locationCode: { type: "number" } }, required: ["domain"], additionalProperties: false },
    requiresConfirmation: false,
  },
  {
    name: "get_local_business_profile",
    description: "The current project's Local SEO business profile (name, address, coordinates).",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    requiresConfirmation: false,
  },
  {
    name: "get_local_grid_scans",
    description: "Local SEO grid-scan history, with per-point ranking results.",
    parameters: { type: "object", properties: { limit: { type: "number", description: "Max scans (default 10)" } }, additionalProperties: false },
    requiresConfirmation: false,
  },
  {
    name: "get_bing_performance",
    description: "Real Bing Webmaster Tools clicks/impressions/position for the project's connected site.",
    parameters: { type: "object", properties: { startDate: { type: "string", description: "YYYY-MM-DD" }, endDate: { type: "string", description: "YYYY-MM-DD" } }, additionalProperties: false },
    requiresConfirmation: false,
  },
  {
    name: "get_outreach_targets",
    description: "Backlink outreach targets for the current project (domain, contact email, draft status, sent status).",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    requiresConfirmation: false,
  },
  {
    name: "get_blog_connections",
    description: "Connected blog publishing platforms for the current project (Publish feature) - which platforms, their labels, and connection status.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    requiresConfirmation: false,
  },
  {
    name: "get_social_connections",
    description: "Connected social media platforms for the current project (Social feature) - which platforms, their labels, and connection status.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    requiresConfirmation: false,
  },

  // --- write tools: always pause for explicit user Approve/Deny ---
  {
    name: "add_tracked_keyword",
    description: "Start tracking a new keyword in Rank Tracking.",
    parameters: { type: "object", properties: { keyword: { type: "string" } }, required: ["keyword"], additionalProperties: false },
    requiresConfirmation: true,
  },
  {
    name: "add_competitor",
    description: "Start tracking a competitor domain.",
    parameters: { type: "object", properties: { domain: { type: "string" }, name: { type: "string", description: "Display name (optional)" } }, required: ["domain"], additionalProperties: false },
    requiresConfirmation: true,
  },
  {
    name: "track_ai_visibility_prompt",
    description: "Start tracking a new prompt for AI-visibility sampling.",
    parameters: { type: "object", properties: { promptText: { type: "string" } }, required: ["promptText"], additionalProperties: false },
    requiresConfirmation: true,
  },
  {
    name: "start_site_audit",
    description: "Launch a real Site Audit crawl for the current project's domain (or an override domain).",
    parameters: {
      type: "object",
      properties: { domain: { type: "string", description: "Overrides the project's own domain (optional)" }, customSitemapUrl: { type: "string" }, maxPages: { type: "number", description: "10-5000, default 5000" } },
      additionalProperties: false,
    },
    requiresConfirmation: true,
  },
  {
    name: "add_outreach_target",
    description: "Add a domain to Backlink Outreach - real-crawls for a contact email if one isn't given.",
    parameters: {
      type: "object",
      properties: { domain: { type: "string" }, sourceUrlFrom: { type: "string", description: "The specific backlink URL this came from, if any" }, contactEmail: { type: "string" } },
      required: ["domain"],
      additionalProperties: false,
    },
    requiresConfirmation: true,
  },
  {
    name: "generate_outreach_draft",
    description: "AI-draft (or regenerate) the outreach email for one existing outreach target - overwrites any existing draft.",
    parameters: { type: "object", properties: { outreachId: { type: "string" } }, required: ["outreachId"], additionalProperties: false },
    requiresConfirmation: true,
  },
  {
    name: "create_blog_post",
    description: "Write a blog post as a draft, targeted at one or more of the current project's connected platforms (Publish feature). This only creates the draft on the /publish page - it does NOT publish or send it; the user reviews/respins and clicks Publish themselves. platforms must be platform ids seen from get_blog_connections (e.g. \"wordpress\", \"devto\"), not connection labels or IDs.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string", description: "Markdown" },
        tags: { type: "array", items: { type: "string" } },
        platforms: { type: "array", items: { type: "string" }, description: "Platform ids from get_blog_connections" },
      },
      required: ["title", "body", "platforms"],
      additionalProperties: false,
    },
    requiresConfirmation: true,
  },
  {
    name: "create_social_post",
    description: "Write a social media update as a draft, targeted at one or more of the current project's connected social platforms. This only creates the draft on the /social page - it does NOT post it; the user reviews/respins and clicks Post themselves. platforms must be platform ids seen from get_social_connections (e.g. \"bluesky\", \"mastodon\"), not connection labels or IDs.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string" },
        platforms: { type: "array", items: { type: "string" }, description: "Platform ids from get_social_connections" },
      },
      required: ["text", "platforms"],
      additionalProperties: false,
    },
    requiresConfirmation: true,
  },
  {
    name: "update_project_notes",
    description: "Update Clay's own standing memory notes for this project - call this when you learn something worth remembering for future conversations.",
    parameters: { type: "object", properties: { summary: { type: "string", description: "The full replacement summary, not a diff" } }, required: ["summary"], additionalProperties: false },
    requiresConfirmation: false,
  },
];

const TOOLS_BY_NAME = new Map(CLAY_TOOLS.map((t) => [t.name, t]));

export function getClayTool(name: string): ClayToolSpec | undefined {
  return TOOLS_BY_NAME.get(name);
}

export type ClayToolExecutionResult = { ok: true; result: unknown } | { ok: false; error: string };

// Dispatches one already-approved tool call to its real implementation.
// Never throws - a real failure (bad args, a downstream error) comes back
// as {ok:false, error} so the agent loop can feed it back to the model as
// a real tool-result message instead of crashing the whole turn.
export async function executeClayTool(name: string, args: Record<string, unknown>, ctx: ClayToolContext, project: ClayProject): Promise<ClayToolExecutionResult> {
  try {
    const result = await dispatch(name, args, ctx, project);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function dispatch(name: string, args: Record<string, unknown>, ctx: ClayToolContext, project: ClayProject): Promise<unknown> {
  switch (name) {
    case "get_project_details":
      return read.readProjectDetails(ctx);
    case "get_tracked_keywords":
      return read.readTrackedKeywords(ctx);
    case "get_keyword_rankings":
      return read.readKeywordRankings(ctx, args as { keyword?: string; limit?: number });
    case "get_site_audits":
      return read.readSiteAudits(ctx, args as { limit?: number });
    case "get_site_audit_detail":
      return read.readSiteAuditDetail(ctx, args as { auditId: string });
    case "get_competitors":
      return read.readCompetitors(ctx);
    case "get_brand_visibility":
      return read.readBrandVisibility(ctx, args as { limit?: number });
    case "get_ai_visibility_opportunities":
      return read.readAiVisibilityOpportunities(ctx);
    case "get_page_analyzer_reports":
      return read.readPageAnalyzerReports(ctx, args as { limit?: number });
    case "get_page_analyzer_report":
      return read.readPageAnalyzerReport(ctx, args as { reportId: string });
    case "get_keyword_research_history":
      return read.readKeywordResearchHistory(ctx, args as { limit?: number });
    case "research_keywords":
      return read.readResearchKeywords(args as { seedKeyword: string; locationCode?: number; limit?: number });
    case "get_keyword_metrics":
      return read.readKeywordMetrics(args as { keyword: string; locationCode?: number });
    case "get_serp_results":
      return read.readSerpResults(args as { keyword: string; location?: string });
    case "get_backlinks_overview":
      return read.readBacklinksOverview(args as { domain: string });
    case "get_domain_overview":
      return read.readDomainOverview(args as { domain: string; locationCode?: number });
    case "get_local_business_profile":
      return read.readLocalBusinessProfile(ctx);
    case "get_local_grid_scans":
      return read.readLocalGridScans(ctx, args as { limit?: number });
    case "get_bing_performance":
      return read.readBingPerformance(ctx, args as { startDate?: string; endDate?: string });
    case "get_outreach_targets":
      return read.readOutreachTargets(ctx);
    case "get_blog_connections":
      return read.readBlogConnections(ctx);
    case "get_social_connections":
      return read.readSocialConnections(ctx);

    case "add_tracked_keyword":
      return write.writeAddTrackedKeyword(ctx, args as { keyword: string });
    case "add_competitor":
      return write.writeAddCompetitor(ctx, args as { domain: string; name?: string });
    case "track_ai_visibility_prompt":
      return write.writeTrackAiVisibilityPrompt(ctx, args as { promptText: string });
    case "start_site_audit":
      return write.writeStartSiteAudit(ctx, args as { domain?: string; customSitemapUrl?: string; maxPages?: number }, project);
    case "add_outreach_target":
      return write.writeAddOutreachTarget(ctx, args as { domain: string; sourceUrlFrom?: string; contactEmail?: string });
    case "generate_outreach_draft":
      return write.writeGenerateOutreachDraft(ctx, args as { outreachId: string }, project);
    case "create_blog_post":
      return write.writeCreateBlogPost(ctx, args as { title: string; body: string; tags?: string[]; platforms: string[] });
    case "create_social_post":
      return write.writeCreateSocialPost(ctx, args as { text: string; platforms: string[] });
    case "update_project_notes":
      return write.writeUpdateProjectNotes(ctx, args as { summary: string });

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
