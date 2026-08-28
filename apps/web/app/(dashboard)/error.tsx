"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

// Next.js error boundary for every route under (dashboard) - catches a
// render-time throw (a failed fetch a page didn't handle, a bad response
// shape, etc.) instead of the whole app going to Next's default unstyled
// error screen. `reset()` re-renders the segment without a full page
// reload, matching this app's "retry" pattern used elsewhere (site audit,
// competitor snapshots).
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Dashboard route error:", error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Alert variant="destructive" className="max-w-md">
        <AlertTriangle />
        <AlertTitle>Something went wrong loading this page</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <p>{error.message || "An unexpected error occurred."}</p>
          <Button size="sm" variant="outline" onClick={reset} className="w-fit gap-1.5">
            <RotateCcw className="size-3.5" />
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
