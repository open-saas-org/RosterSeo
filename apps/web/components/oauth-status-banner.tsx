"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: "That platform's OAuth isn't set up on this deployment yet - ask whoever runs it to add the client id/secret, or connect manually with a token below.",
  missing_code: "The connect attempt didn't complete - try again.",
  invalid_state: "That connect link expired or was tampered with - try again.",
  unauthorized: "You need to be signed in to connect an account.",
  project_not_found: "Couldn't find that project.",
  token_exchange_failed: "That platform rejected the connection - try again, or connect manually with a token below.",
  connect_failed: "Couldn't start that connection - try again.",
  no_accounts_found: "That account has nothing connectable (e.g. no Pages, no boards) - create one on the platform first, then try again.",
  access_denied: "You declined the connection request.",
};

function OAuthStatusBannerInner({ platformNames }: { platformNames: Record<string, string> }) {
  const searchParams = useSearchParams();
  const connected = searchParams.get("connected");
  const error = searchParams.get("error");

  if (connected) {
    return (
      <Alert className="border-success/30 bg-success/5 text-success">
        <CheckCircle2 />
        <AlertTitle>{platformNames[connected] ?? connected} connected.</AlertTitle>
      </Alert>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>{ERROR_MESSAGES[error] ?? "Couldn't connect that platform."}</AlertTitle>
      </Alert>
    );
  }
  return null;
}

// Reads ?connected=/?error= left by the OAuth callback redirects (Publish's
// and Social's both share this shape) and shows a real message instead of
// silently landing back on the page - wrapped in Suspense because
// useSearchParams requires it for a component rendered inside a page that
// isn't itself already forced dynamic by something else.
export function OAuthStatusBanner({ platformNames }: { platformNames: Record<string, string> }) {
  return (
    <Suspense fallback={null}>
      <OAuthStatusBannerInner platformNames={platformNames} />
    </Suspense>
  );
}
