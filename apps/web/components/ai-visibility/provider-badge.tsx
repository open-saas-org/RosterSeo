import { Badge } from "@/components/ui/badge";
import { getModelDisplayLabel } from "@rosterseo/ai-visibility";

// Distinct outline color per AI *model family* (not just backend provider),
// so ChatGPT/Gemini/Claude/etc. stay visually distinguishable at a glance
// even when several route through the same backend (BrightData, OpenRouter).
const FAMILY_VARIANT_CLASS: Record<string, string> = {
  openai: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  chatgpt: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  anthropic: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  claude: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  google: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  gemini: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "google-ai-overview": "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  perplexity: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  sonar: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  copilot: "border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  llama: "border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  grok: "border-pink-500/30 bg-pink-500/10 text-pink-600 dark:text-pink-400",
};
const PROVIDER_FALLBACK_CLASS: Record<string, string> = {
  brightdata: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  openrouter: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
};
const DEFAULT_VARIANT_CLASS = "border-muted-foreground/30 bg-muted text-muted-foreground";

function variantClassFor(provider: string, model?: string | null): string {
  const haystack = (model ?? provider).toLowerCase();
  for (const [family, cls] of Object.entries(FAMILY_VARIANT_CLASS)) {
    if (haystack.includes(family)) return cls;
  }
  return PROVIDER_FALLBACK_CLASS[provider] ?? DEFAULT_VARIANT_CLASS;
}

const FAMILY_ICON: Record<string, string> = {
  openai: "openai/10b981",
  chatgpt: "openai/10b981",
  anthropic: "anthropic/f97316",
  claude: "anthropic/f97316",
  google: "google/3b82f6",
  gemini: "googlegemini/3b82f6",
  "google-ai-overview": "google/3b82f6",
  perplexity: "perplexity/8b5cf6",
  sonar: "perplexity/8b5cf6",
  copilot: "microsoftcopilot/06b6d4",
  llama: "meta/6366f1",
  grok: "x/ec4899",
};

export function ProviderIcon({ provider, model, className = "size-3" }: { provider: string; model?: string | null; className?: string }) {
  const haystack = (model ?? provider).toLowerCase();
  let iconUrl = null;
  for (const [family, icon] of Object.entries(FAMILY_ICON)) {
    if (haystack.includes(family)) {
      iconUrl = `https://cdn.simpleicons.org/${icon}`;
      break;
    }
  }
  
  if (!iconUrl) return null;
  return <img src={iconUrl} alt="" className={`${className} object-contain`} />;
}

// Shows the real AI model/surface name (e.g. "ChatGPT", "Gemini", "Claude
// Sonnet 5") rather than the backend routing detail ("BrightData",
// "OpenRouter") - those are implementation details, not something a user
// needs to see when what they care about is *which AI* was sampled.
export function ProviderBadge({ provider, model, iconOnly }: { provider: string; model?: string | null; iconOnly?: boolean }) {
  if (iconOnly) {
    return (
      <div className={`flex items-center justify-center p-1.5 rounded-md border ${variantClassFor(provider, model)}`} title={getModelDisplayLabel(provider, model)}>
        <ProviderIcon provider={provider} model={model} className="size-4" />
      </div>
    );
  }

  return (
    <Badge variant="outline" className={variantClassFor(provider, model)}>
      <ProviderIcon provider={provider} model={model} className="size-3 mr-1.5" />
      {getModelDisplayLabel(provider, model)}
    </Badge>
  );
}
