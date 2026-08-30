import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { CopyCommandButton } from "@/components/ai-mcp/copy-command-button";
import { McpKeyManager } from "@/components/ai-mcp/mcp-key-manager";

const RUN_COMMAND = "pnpm --filter @seo-tool/mcp-server dev";

const CLAUDE_DESKTOP_CONFIG = `{
  "mcpServers": {
    "seo-tool": {
      "command": "pnpm",
      "args": [
        "--filter",
        "@seo-tool/mcp-server",
        "dev"
      ],
      "env": {
        "DATABASE_URL": "postgresql://postgres:postgres@localhost:5432/seo_tool",
        "SEO_TOOL_API_KEY": "paste your generated key here"
      }
    }
  }
}`;

// Transcribed directly from apps/mcp-server/src/index.ts's TOOLS array -
// keep this in sync with that file rather than describing tools that
// aren't actually registered there.
const TOOL_GROUPS: { group: string; tools: { name: string; description: string }[] }[] = [
  {
    group: "Projects",
    tools: [
      { name: "list_projects", description: "List every project the caller's API key can access." },
      { name: "get_project_details", description: "Full details for one project." },
    ],
  },
  {
    group: "Rank Tracking",
    tools: [
      { name: "get_keywords", description: "Tracked keywords for a project." },
      { name: "add_tracked_keyword", description: "Start tracking a new keyword." },
      { name: "get_rankings", description: "Real position-check history for tracked keywords." },
    ],
  },
  {
    group: "Site Audit",
    tools: [
      { name: "get_site_audits", description: "Audit run history for a project." },
      { name: "get_site_audit_detail", description: "One audit's full issue list and crawled pages." },
    ],
  },
  {
    group: "Competitors",
    tools: [
      { name: "get_competitors", description: "Tracked competitor domains for a project." },
      { name: "add_competitor", description: "Start tracking a competitor domain." },
    ],
  },
  {
    group: "AI Visibility",
    tools: [
      { name: "get_brand_visibility", description: "Tracked prompts, real sample results, and visibility percent." },
      { name: "get_ai_visibility_opportunities", description: "Latest content/outreach opportunity report." },
      { name: "track_ai_visibility_prompt", description: "Start tracking a new prompt." },
    ],
  },
  {
    group: "Page Analyzer",
    tools: [
      { name: "get_page_analyzer_reports", description: "Past report runs for a project." },
      { name: "get_page_analyzer_report", description: "One report's full stored result." },
    ],
  },
  {
    group: "Keyword Research",
    tools: [
      { name: "get_keyword_research_history", description: "Past searches for a project, plus cached real metrics." },
      { name: "research_keywords", description: "Live DataForSEO keyword ideas, related terms, and suggestions." },
      { name: "get_keyword_metrics", description: "Real search volume, difficulty, CPC, and intent for one keyword." },
      { name: "get_serp_results", description: "Real live top-10 Google SERP for a keyword." },
    ],
  },
  {
    group: "Backlinks & Domain Research",
    tools: [
      { name: "get_backlinks_overview", description: "Real backlink profile summary for a domain." },
      { name: "get_domain_overview", description: "Real organic-traffic domain overview." },
    ],
  },
  {
    group: "Local SEO",
    tools: [
      { name: "get_local_business_profile", description: "A project's Local SEO business profile." },
      { name: "get_local_grid_scans", description: "Grid-scan history with per-point ranking results." },
    ],
  },
  {
    group: "Bing & Indexing",
    tools: [
      { name: "get_bing_performance", description: "Real Bing Webmaster Tools clicks/impressions/position." },
      { name: "submit_urls_to_indexnow", description: "Notify Bing/Yandex/Seznam/Naver that URLs changed." },
    ],
  },
];

const EXAMPLE_PROMPTS = [
  "Find content gaps compared to my top competitor.",
  "Summarize the latest site audit and give me the top 3 priorities.",
  "What's the average position trend for my top 5 keywords this month?",
  "Research keywords related to 'best running shoes' and show me the top opportunities by volume.",
  "Am I visible when people ask AI assistants about my product category?",
];

export default function AiMcpPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="AI & MCP"
        description="Connect external AI tools (Claude Desktop, other MCP clients) to your SEO Tool data over the Model Context Protocol."
      />

      <McpKeyManager />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What is MCP?</CardTitle>
            <CardDescription>
              The Model Context Protocol is an open standard that lets AI assistants call into an
              application&apos;s data and tools through a well-defined server, rather than through
              screen-scraping or one-off integrations.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="border-lavender/30 bg-lavender/5">
          <CardHeader>
            <CardTitle>Bring Your Own Key (BYOK)</CardTitle>
            <CardDescription>
              Generate an API key above, connect it via MCP, and query your real SEO data directly - no manual CSV
              exports, no separate AI subscription markup.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How to connect Claude Desktop</CardTitle>
          <CardDescription>
            SEO Tool ships an MCP server (<code>@seo-tool/mcp-server</code>) that talks over stdio transport.
            Generate an API key above, then add the following to your <code>claude_desktop_config.json</code>{" "}
            (replacing the placeholder <code>SEO_TOOL_API_KEY</code> value with your real key):
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative rounded-lg bg-muted px-4 py-4">
            <pre className="text-sm overflow-x-auto text-foreground font-mono">
              <code>{CLAUDE_DESKTOP_CONFIG}</code>
            </pre>
            <div className="absolute top-2 right-2">
              <CopyCommandButton command={CLAUDE_DESKTOP_CONFIG} />
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Alternatively, test it directly from the repo root using (set <code>SEO_TOOL_API_KEY</code> in your
            shell or <code>.env</code> first):
          </p>
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2">
            <code className="text-sm">{RUN_COMMAND}</code>
            <CopyCommandButton command={RUN_COMMAND} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Every tool call is scoped to whichever account the <code>SEO_TOOL_API_KEY</code> belongs to - it can
            only ever read or act on projects that account has access to, enforced the same way as every browser
            request in this app.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Example prompts</CardTitle>
          <CardDescription>What to ask Claude once connected:</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
            {EXAMPLE_PROMPTS.map((prompt, i) => (
              <li key={i}>{prompt}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Available tools</CardTitle>
          <CardDescription>Every tool currently registered in the MCP server, grouped by module.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {TOOL_GROUPS.map((g) => (
            <div key={g.group} className="flex flex-col gap-2">
              <h4 className="text-sm font-medium">{g.group}</h4>
              <div className="flex flex-col gap-2">
                {g.tools.map((tool) => (
                  <div key={tool.name} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                    <div>
                      <code className="text-sm font-medium">{tool.name}</code>
                      <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
                    </div>
                    <Badge variant="success" className="shrink-0">
                      Available
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
