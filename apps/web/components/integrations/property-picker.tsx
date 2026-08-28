"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Property = { id: string; label: string };
type LoadError = { kind: "needs_reconnect" | "api_not_enabled" | "merchant_not_registered" | "load_failed"; message?: string };

// Google's "API not enabled" error message always contains the exact
// console URL to fix it, project number and all - simplest to just extract
// and link that rather than re-deriving a generic one ourselves.
function extractUrl(message: string): string | null {
  const match = message.match(/https:\/\/\S+/);
  return match ? match[0].replace(/[.,]+$/, "") : null;
}

// Real picker for "which Search Console site / GA4 property should this
// project sync" - replaces typing the exact property string in blind. Each
// project has its own google_connections row per service, so this is
// always scoped to one project + one service at a time; switching projects
// (ProjectSwitcher) shows that project's own independent picker/selection.
export function PropertyPicker({
  projectId,
  service,
  label,
}: {
  projectId: string;
  service: "gsc" | "ga4" | "merchant";
  label: string;
}) {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[] | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [merchantAccountIdInput, setMerchantAccountIdInput] = useState("");

  const loadProperties = useCallback(() => {
    let cancelled = false;
    setLoadError(null);
    setProperties(null);
    fetch(`/api/projects/${projectId}/integrations/properties?service=${service}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          if (body?.error === "api_not_enabled") {
            throw { kind: "api_not_enabled", message: body.message } satisfies LoadError;
          }
          if (body?.error === "merchant_not_registered") {
            throw { kind: "merchant_not_registered", message: body.message } satisfies LoadError;
          }
          throw { kind: body?.error === "needs_reconnect" ? "needs_reconnect" : "load_failed" } satisfies LoadError;
        }
        return res.json();
      })
      .then((body) => {
        if (cancelled) return;
        setProperties(body.properties ?? []);
      })
      .catch((err: LoadError) => {
        if (cancelled) return;
        setLoadError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, service]);

  useEffect(() => loadProperties(), [loadProperties]);

  async function handleRegister() {
    if (!merchantAccountIdInput.trim()) {
      setRegisterError("Enter your Merchant Center account ID first.");
      return;
    }
    setIsRegistering(true);
    setRegisterError(null);
    try {
      const res = await fetch(`/api/integrations/merchant/register?projectId=${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantAccountId: merchantAccountIdInput }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? "Registration failed.");
      setRegisterSuccess(true);
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : "Registration failed. Try again.");
    } finally {
      setIsRegistering(false);
    }
  }

  function handleSave() {
    if (!selected) {
      setSaveError("Choose a property first.");
      return;
    }
    setSaveError(null);
    startTransition(async () => {
      const res = await fetch(`/api/projects/${projectId}/integrations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, propertyId: selected }),
      });
      if (!res.ok) {
        setSaveError("Couldn't save that property. Try again.");
        return;
      }
      router.refresh();
    });
  }

  if (loadError?.kind === "api_not_enabled") {
    const url = loadError.message ? extractUrl(loadError.message) : null;
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          The {label} API isn&apos;t enabled on your Google Cloud project yet - reconnecting won&apos;t fix this,
          it&apos;s a one-time setup step.{" "}
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              Enable it in Google Cloud Console
            </a>
          ) : (
            "Enable it in Google Cloud Console"
          )}
          , then retry below - no need to reconnect.
        </p>
        <Button variant="outline" size="sm" className="w-fit" onClick={loadProperties}>
          Retry
        </Button>
      </div>
    );
  }
  if (loadError?.kind === "merchant_not_registered") {
    const url = loadError.message ? extractUrl(loadError.message) : null;
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          This Google Cloud project isn&apos;t registered as an API developer with your Merchant Center account
          yet - there&apos;s no Merchant Center settings page for this, it&apos;s a one-time API call. Enter your
          Merchant Center account ID (the number in the Merchant Center URL,{" "}
          <code className="text-xs">merchants.google.com/mc/overview?a=&lt;id&gt;</code>, or the account switcher)
          to register directly.
        </p>
        {registerSuccess ? (
          <>
            <p className="text-sm text-success">
              Registered. Google says this can take a few minutes to propagate - retry below; if it still fails,
              wait a bit longer and try again.
            </p>
            <Button variant="outline" size="sm" className="w-fit" onClick={loadProperties}>
              Retry
            </Button>
          </>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Input
              value={merchantAccountIdInput}
              onChange={(e) => setMerchantAccountIdInput(e.target.value)}
              placeholder="e.g. 1234567890"
              className="sm:w-48"
            />
            <Button size="sm" onClick={handleRegister} disabled={isRegistering}>
              {isRegistering ? <Loader2 className="animate-spin" /> : null}
              Register with Merchant API
            </Button>
          </div>
        )}
        {registerError ? <p className="text-sm text-destructive">{registerError}</p> : null}
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline underline-offset-4 w-fit">
            See Google&apos;s docs
          </a>
        ) : null}
      </div>
    );
  }
  if (loadError?.kind === "needs_reconnect") {
    return (
      <p className="text-sm text-muted-foreground">
        Access was likely revoked.{" "}
        <Link href="/integrations" className="underline underline-offset-4">
          Reconnect {label}
        </Link>{" "}
        to pick a property.
      </p>
    );
  }
  if (loadError) {
    return <p className="text-sm text-destructive">Couldn't load {label} properties. Try again.</p>;
  }
  if (properties === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Loading {label} properties…
      </div>
    );
  }
  if (properties.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No verified {label} properties found for this Google account.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <Select
        value={selected}
        onValueChange={(v) => setSelected(v as string)}
        items={properties.map((property) => ({ value: property.id, label: property.label }))}
      >
        <SelectTrigger className="sm:w-72">
          <SelectValue placeholder={`Choose a ${label} property`} />
        </SelectTrigger>
        <SelectContent>
          {properties.map((property) => (
            <SelectItem key={property.id} value={property.id}>
              {property.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={handleSave} disabled={isPending} size="sm">
        {isPending ? <Loader2 className="animate-spin" /> : null}
        Save
      </Button>
      {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
    </div>
  );
}
