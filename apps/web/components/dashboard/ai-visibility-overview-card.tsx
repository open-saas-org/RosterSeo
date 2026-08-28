import Link from "next/link";
import { Eye, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StatItem } from "./stat-item";

export function AiVisibilityOverviewCard({
  hasPrompts,
  visibilityPercent,
  shareOfVoicePercent,
  promptsTracked,
}: {
  hasPrompts: boolean;
  visibilityPercent: number;
  shareOfVoicePercent: number;
  promptsTracked: number;
}) {
  const card = (
    <Card interactive={hasPrompts} className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="size-5 text-muted-foreground" />
          <CardTitle className="text-base font-semibold">AI Visibility</CardTitle>
        </div>
        {hasPrompts ? <ArrowRight className="size-4 text-muted-foreground transition-colors group-hover/card:text-primary" /> : null}
      </CardHeader>
      <CardContent>
        {!hasPrompts ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">Track prompts to see how often AI answers mention your brand.</p>
            <Link href="/ai-visibility/settings/prompts" className={cn(buttonVariants({ size: "sm" }))}>
              Add prompts
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-4">
              <StatItem label="Visibility" value={<span className="text-primary">{visibilityPercent}%</span>} />
              <StatItem label="Share of Voice" value={<span className="text-ai-accent">{shareOfVoicePercent}%</span>} />
              <StatItem label="Prompts" value={promptsTracked} />
            </div>
            <p className="text-xs text-muted-foreground">AI Visibility · last 30 days</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return hasPrompts ? (
    <Link href="/ai-visibility/overview" className="block h-full">
      {card}
    </Link>
  ) : (
    card
  );
}
