import Link from "next/link";
import { Bot } from "lucide-react";
import { getAllProviders } from "@seo-tool/ai-visibility";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LlmProvidersIntegrationCard() {
  const providers = getAllProviders();
  const connectedCount = providers.filter((p) => p.isConfigured()).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4.5">
            <Bot />
          </div>
          <div>
            <CardTitle className="text-base">LLM Providers</CardTitle>
            <CardDescription>Powers AI Visibility — direct APIs, real scraping, and pass-through routing.</CardDescription>
          </div>
        </div>
        <Badge variant={connectedCount > 0 ? "default" : "outline"} className="shrink-0 tabular-nums">
          {connectedCount}/{providers.length} connected
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-md border bg-muted/30 p-3">
          {providers.map((provider) => {
            const configured = provider.isConfigured();
            return (
              <div key={provider.id} className="flex items-center gap-2 text-sm">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    configured ? "bg-success" : "bg-muted-foreground/30",
                  )}
                />
                <span className={cn("truncate", configured ? "font-medium" : "text-muted-foreground")}>{provider.name}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
      <CardFooter>
        <Link href="/ai-visibility/settings/providers" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Manage providers
        </Link>
      </CardFooter>
    </Card>
  );
}
