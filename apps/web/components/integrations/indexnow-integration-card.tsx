import Link from "next/link";
import { Rocket, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// No account, no API key, nothing to configure - IndexNow is keyless
// registration (see packages/indexnow). Always "Ready", unlike every other
// card on this page.
export function IndexNowIntegrationCard() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4.5">
            <Rocket />
          </div>
          <div>
            <CardTitle className="text-base">IndexNow</CardTitle>
            <CardDescription>Instantly notify Bing, Yandex, Seznam, and Naver of URL changes.</CardDescription>
          </div>
        </div>
        <Badge className="shrink-0">Ready</Badge>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CheckCircle2 className="size-3.5 text-success" />
          <span>No setup required - a key is generated automatically on first submission.</span>
        </div>
      </CardContent>
      <CardFooter>
        <Link href="/site-audit" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Submit URLs from Site Audit
        </Link>
      </CardFooter>
    </Card>
  );
}
