import { CheckCircle2, XCircle, CircleSlash } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProviderBadge } from "@/components/ai-visibility/provider-badge";
import { SentimentBadge } from "@/components/ai-visibility/sentiment-badge";
import type { AiVisibilityProvider, PromptSampleResult } from "@rosterseo/ai-visibility";

// Simple pass/fail-style verdict per provider for a single ad-hoc sample -
// deliberately lighter-weight than the mention-rate breakdown table in AI
// Visibility, since Brand Lookup only ever draws one sample per provider.
// `result` is null when that provider isn't configured or the real call
// failed - rendered as an honest "Not configured" state, never treated the
// same as a real "not mentioned" verdict.
export function BrandLookupResultCard({
  provider,
  result,
}: {
  provider: AiVisibilityProvider;
  result: PromptSampleResult | null;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <ProviderBadge provider={provider} />
        {result === null ? (
          <Badge variant="outline" className="text-muted-foreground">
            <CircleSlash className="size-3" />
            Not configured
          </Badge>
        ) : result.mentioned ? (
          <Badge variant="success">
            <CheckCircle2 className="size-3" />
            Mentioned
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            <XCircle className="size-3" />
            Not mentioned
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {result === null ? (
          <p className="text-muted-foreground">
            Set this provider&apos;s API key to sample it — see the LLM Providers card on{" "}
            <a href="/integrations" className="underline">
              Integrations
            </a>
            .
          </p>
        ) : result.mentioned ? (
          <>
            <div className="flex items-center gap-3 text-muted-foreground">
              <span>
                Position <span className="font-medium text-foreground">#{result.position}</span>
              </span>
              <SentimentBadge sentiment={result.sentiment} />
            </div>
            {result.responseSnippet ? (
              <p className="text-muted-foreground">{result.responseSnippet}</p>
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground">
            The brand did not come up in this sampled answer.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
