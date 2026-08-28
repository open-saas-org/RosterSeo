import Link from "next/link";
import Image from "next/image";
import { Compass, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

// Same shape as PageSpeedIntegrationCard - one global workspace API key, no
// per-project connect/disconnect (Bing Webmaster Tools auth isn't OAuth).
export function BingIntegrationCard({ configured }: { configured: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4.5">
            <Image src="/bing.svg" alt="Bing" width={18} height={18} className="object-contain" />
          </div>
          <div>
            <CardTitle className="text-base">Bing Webmaster Tools</CardTitle>
            <CardDescription>Clicks, impressions, and average position from Bing search.</CardDescription>
          </div>
        </div>
        <Badge variant={configured ? "default" : "outline"} className="shrink-0">
          {configured ? "Connected" : "Not connected"}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!configured ? (
          <Alert>
            <AlertTriangle />
            <AlertTitle>Not configured</AlertTitle>
            <AlertDescription>
              Set <code>BING_WEBMASTER_API_KEY</code> in your <code>.env</code> (Bing Webmaster Tools &rarr;
              Settings &rarr; API access) to fetch live Bing search performance.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckCircle2 className="size-3.5 text-success" />
            <span>Workspace API Key Configured</span>
          </div>
        )}
      </CardContent>
      <CardFooter>
        {configured ? (
          <Link href="/bing-insights" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            View Bing Insights
          </Link>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Global Integration
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
