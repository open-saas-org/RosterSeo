"use client";

import { useState, useTransition, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Unplug } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { GoogleConnectionStatus } from "@/lib/google-connection-status";

const STATUS_LABEL: Record<GoogleConnectionStatus, string> = {
  not_connected: "Not connected",
  connected: "Connected",
  needs_reconnect: "Needs reconnect",
};

function formatConnectedAt(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

export function IntegrationConnectionCard({
  service,
  projectId,
  title,
  description,
  icon,
  status,
  connectedAt,
  configured,
  children,
}: {
  service: "gsc" | "ga4" | "gbp" | "merchant";
  projectId: string;
  title: string;
  description: string;
  // A rendered element, not a component reference - component references
  // (e.g. the LucideIcon type) aren't serializable across the Server ->
  // Client Component boundary, since this card is a Client Component and
  // its parent page is a Server Component.
  icon: ReactNode;
  status: GoogleConnectionStatus;
  connectedAt: string | null;
  /** Whether GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are set - see isGoogleOAuthConfigured() in @rosterseo/google. */
  configured: boolean;
  /** PropertyPicker, rendered when connected but this project hasn't picked a property yet - the connection itself has no property, that's a per-project choice. */
  children?: ReactNode;
}) {
  const [isDisconnecting, startDisconnect] = useTransition();
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState(status);

  const connectHref = `/api/integrations/google/connect?projectId=${encodeURIComponent(projectId)}&service=${service}`;

  function handleDisconnect() {
    setDisconnectError(null);
    startDisconnect(async () => {
      try {
        // Real call against the route this module builds
        // (apps/web/app/api/projects/[projectId]/integrations/route.ts),
        // auth-gated by the real session cookie.
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/integrations?service=${service}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Disconnect failed (${res.status})`);
        }
        setLocalStatus("not_connected");
      } catch (err) {
        setDisconnectError(err instanceof Error ? err.message : "Disconnect failed");
      }
    });
  }

  const badgeVariant = localStatus === "connected" ? "default" : localStatus === "needs_reconnect" ? "destructive" : "outline";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4.5">
            {icon}
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
        <Badge variant={badgeVariant} className="shrink-0">
          {STATUS_LABEL[localStatus]}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!configured ? (
          <Alert>
            <AlertTriangle />
            <AlertTitle>Not configured</AlertTitle>
            <AlertDescription>
              Set <code>GOOGLE_OAUTH_CLIENT_ID</code> and <code>GOOGLE_OAUTH_CLIENT_SECRET</code> to enable connecting.
            </AlertDescription>
          </Alert>
        ) : localStatus === "needs_reconnect" ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Reconnect required</AlertTitle>
            <AlertDescription>
              Access was likely revoked from the connected Google account. Reconnect to resume syncing.
            </AlertDescription>
          </Alert>
        ) : localStatus === "connected" ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-success" />
              <span>Connected as of {formatConnectedAt(connectedAt)}</span>
            </div>
            {children}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Not connected.</p>
        )}
        {disconnectError ? <p className="text-xs text-destructive">{disconnectError}</p> : null}
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-1.5">
        {localStatus === "connected" ? (
          <>
            <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={isDisconnecting}>
              {isDisconnecting ? <Loader2 className="size-3.5 animate-spin" /> : <Unplug className="size-3.5" />}
              Disconnect
            </Button>
          </>
        ) : configured ? (
          // Base UI's Button enforces button semantics and explicitly
          // shouldn't be used for links (its own docs: "should not be used
          // for links... style the <a> element directly"). This needs to
          // navigate to a real route (the OAuth connect redirect), so it's
          // a plain anchor styled with the same variant classes instead.
          <a href={connectHref} className={cn(buttonVariants({ size: "sm" }))}>
            {localStatus === "needs_reconnect" ? "Reconnect" : "Connect"}
          </a>
        ) : (
          <span
            aria-disabled="true"
            className={cn(buttonVariants({ size: "sm" }), "pointer-events-none opacity-50")}
          >
            {localStatus === "needs_reconnect" ? "Reconnect" : "Connect"}
          </span>
        )}
      </CardFooter>
    </Card>
  );
}
