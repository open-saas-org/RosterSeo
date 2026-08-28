"use client";

import { Zap, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function PageSpeedIntegrationCard({ configured }: { configured: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4.5">
            <Zap />
          </div>
          <div>
            <CardTitle className="text-base">Google PageSpeed Insights</CardTitle>
            <CardDescription>Real Core Web Vitals (LCP, CLS, INP) for Site Audits.</CardDescription>
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
              Set <code>GOOGLE_PAGESPEED_API_KEY</code> in your <code>.env</code> to fetch live Lighthouse and CrUX data.
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
        <Button variant="outline" size="sm" disabled>
          Global Integration
        </Button>
      </CardFooter>
    </Card>
  );
}
