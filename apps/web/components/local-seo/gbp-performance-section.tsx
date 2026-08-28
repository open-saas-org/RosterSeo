"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Phone, MessageSquare, CalendarCheck, Navigation, MousePointerClick, UtensilsCrossed, Plug } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatItem } from "@/components/dashboard/stat-item";
import { StatGridSkeleton } from "@/components/ui/loading-skeletons";
import { cn } from "@/lib/utils";

type BusinessAccount = { name: string; accountName: string };
type BusinessLocation = { name: string; title: string; address: string | null };
type PerformanceRow = {
  date: string;
  views: number;
  calls: number;
  chats: number;
  bookings: number;
  directionRequests: number;
  websiteClicks: number;
  menuClicks: number;
};

type LinkState =
  | { kind: "loading" }
  | { kind: "not_connected" }
  | { kind: "needs_reconnect" }
  | { kind: "no_location" }
  | { kind: "linked"; locationName: string };

// Real Google Business Profile Performance metrics (calls, chats, bookings,
// direction requests, website clicks, menu clicks) - private, owner-only
// data that doesn't exist through DataForSEO or any public source, so this
// is the one part of Local SEO that genuinely needs the real GBP OAuth
// connection this session otherwise deliberately avoided requiring. Kept
// as its own section (not blocking the rest of the Profile page) since
// connecting is optional and gated by Google's separate manual approval
// for the Performance API - see business-profile.ts.
export function GbpPerformanceSection({ projectId }: { projectId: string }) {
  const [state, setState] = useState<LinkState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/local-seo/business-profile/gbp`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.connection?.status === "needs_reconnect") {
          setState({ kind: "needs_reconnect" });
        } else if (data.connection?.status !== "connected") {
          setState({ kind: "not_connected" });
        } else if (!data.gbpLocationId) {
          setState({ kind: "no_location" });
        } else {
          setState({ kind: "linked", locationName: data.gbpLocationName ?? data.gbpLocationId });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "not_connected" });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const connectHref = `/api/integrations/google/connect?projectId=${encodeURIComponent(projectId)}&service=gbp`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Business Profile performance</CardTitle>
        <CardDescription>
          Calls, chats, bookings, direction requests, website clicks, and menu views - private data only Google&apos;s own Performance API can provide, so this needs a real
          connection (unlike the rest of this page).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.kind === "loading" ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : state.kind === "not_connected" ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">Connect a real Google Business Profile account to see this.</p>
            <a href={connectHref} className={cn(buttonVariants({ size: "sm" }))}>
              <Plug className="size-3.5" />
              Connect Google Business Profile
            </a>
          </div>
        ) : state.kind === "needs_reconnect" ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">Your Business Profile connection needs reconnecting.</p>
            <Link href="/integrations" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
              Go to Integrations
            </Link>
          </div>
        ) : state.kind === "no_location" ? (
          <LocationPicker projectId={projectId} onLinked={(locationName) => setState({ kind: "linked", locationName })} />
        ) : (
          <PerformanceView projectId={projectId} locationName={state.locationName} onChangeLocation={() => setState({ kind: "no_location" })} />
        )}
      </CardContent>
    </Card>
  );
}

function LocationPicker({ projectId, onLinked }: { projectId: string; onLinked: (locationName: string) => void }) {
  const [accounts, setAccounts] = useState<BusinessAccount[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | undefined>(undefined);

  const [locations, setLocations] = useState<BusinessLocation[] | null>(null);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | undefined>(undefined);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/local-seo/business-profile/accounts`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) throw new Error(data.error === "gbp_not_approved" ? "Pending Google's approval for the Business Profile APIs." : "Couldn't load accounts.");
        setAccounts(data.accounts ?? []);
      })
      .catch((err) => {
        if (!cancelled) setAccountsError(err instanceof Error ? err.message : "Couldn't load accounts.");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    setLocationId(undefined);
    setLocations(null);
    if (!accountId) return;
    let cancelled = false;
    setLocationsError(null);
    fetch(`/api/projects/${projectId}/local-seo/business-profile/locations?accountId=${encodeURIComponent(accountId)}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) throw new Error("Couldn't load locations.");
        setLocations(data.locations ?? []);
      })
      .catch((err) => {
        if (!cancelled) setLocationsError(err instanceof Error ? err.message : "Couldn't load locations.");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, accountId]);

  async function handleLink() {
    if (!accountId || !locationId) return;
    const location = locations?.find((l) => l.name === locationId);
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/local-seo/business-profile/gbp`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, locationId, locationName: location?.title ?? locationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't link that location.");
      onLinked(data.gbpLocationName ?? locationId);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't link that location. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          value={accountId}
          onValueChange={(v) => setAccountId(v ?? undefined)}
          items={(accounts ?? []).map((a) => ({ value: a.name, label: a.accountName }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={accounts === null ? "Loading accounts…" : "Choose an account"} />
          </SelectTrigger>
          <SelectContent>
            {(accounts ?? []).map((a) => (
              <SelectItem key={a.name} value={a.name}>
                {a.accountName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={locationId}
          onValueChange={(v) => setLocationId(v ?? undefined)}
          disabled={!accountId}
          items={(locations ?? []).map((l) => ({ value: l.name, label: `${l.title}${l.address ? ` — ${l.address}` : ""}` }))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={!accountId ? "Pick an account first" : locations === null ? "Loading locations…" : "Choose a location"} />
          </SelectTrigger>
          <SelectContent>
            {(locations ?? []).map((l) => (
              <SelectItem key={l.name} value={l.name}>
                {l.title}
                {l.address ? ` — ${l.address}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {accountsError ? <p className="text-sm text-destructive">{accountsError}</p> : null}
      {locationsError ? <p className="text-sm text-destructive">{locationsError}</p> : null}
      {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
      <div>
        <Button size="sm" onClick={handleLink} disabled={!locationId || isSaving}>
          {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Link this location
        </Button>
      </div>
    </div>
  );
}

function PerformanceView({ projectId, locationName, onChangeLocation }: { projectId: string; locationName: string; onChangeLocation: () => void }) {
  const [rows, setRows] = useState<PerformanceRow[] | null>(null);
  const [error, setError] = useState<{ kind: string; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/local-seo/business-profile/performance?days=30`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) {
          setError({ kind: data.error ?? "unknown", message: data.message ?? "" });
          return;
        }
        setRows(data.rows ?? []);
      })
      .catch(() => {
        if (!cancelled) setError({ kind: "unknown", message: "" });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (error?.kind === "gbp_not_approved") {
    return (
      <Alert>
        <AlertTitle>Pending Google&apos;s approval</AlertTitle>
        <AlertDescription>
          This Google Cloud project hasn&apos;t been approved for Business Profile API access yet - Google requires a one-time manual review (see the{" "}
          <a href="https://developers.google.com/my-business/content/prereqs" target="_blank" rel="noreferrer" className="underline underline-offset-4">
            access-request form
          </a>
          ). The connection itself is real and working - these numbers will appear automatically once Google approves the project.
        </AlertDescription>
      </Alert>
    );
  }

  if (error?.kind === "api_not_enabled") {
    const url = error.message.match(/https:\/\/\S+/)?.[0]?.replace(/[.,]+$/, "");
    return (
      <Alert>
        <AlertTitle>Performance API isn&apos;t enabled yet</AlertTitle>
        <AlertDescription>
          A one-time Google Cloud Console setup step.{" "}
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              Enable it in Google Cloud Console
            </a>
          ) : (
            "Enable the Business Profile Performance API in Google Cloud Console"
          )}
          , then reload this page.
        </AlertDescription>
      </Alert>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">Couldn&apos;t load performance data. Try reloading.</p>;
  }

  if (!rows) {
    return <StatGridSkeleton items={6} />;
  }

  const totals = rows.reduce(
    (acc, r) => ({
      views: acc.views + r.views,
      calls: acc.calls + r.calls,
      chats: acc.chats + r.chats,
      bookings: acc.bookings + r.bookings,
      directionRequests: acc.directionRequests + r.directionRequests,
      websiteClicks: acc.websiteClicks + r.websiteClicks,
      menuClicks: acc.menuClicks + r.menuClicks,
    }),
    { views: 0, calls: 0, chats: 0, bookings: 0, directionRequests: 0, websiteClicks: 0, menuClicks: 0 },
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{locationName} · last 30 days</p>
        <Button variant="ghost" size="sm" onClick={onChangeLocation}>
          Change location
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No performance data yet - Google reports insights with a short delay for new locations.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatItemWithIcon icon={Phone} label="Calls" value={totals.calls} />
          <StatItemWithIcon icon={MessageSquare} label="Chats" value={totals.chats} />
          <StatItemWithIcon icon={CalendarCheck} label="Bookings" value={totals.bookings} />
          <StatItemWithIcon icon={Navigation} label="Directions" value={totals.directionRequests} />
          <StatItemWithIcon icon={MousePointerClick} label="Website clicks" value={totals.websiteClicks} />
          <StatItemWithIcon icon={UtensilsCrossed} label="Menu views" value={totals.menuClicks} />
        </div>
      )}
    </div>
  );
}

function StatItemWithIcon({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: number }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <StatItem label={label} value={value.toLocaleString()} />
    </div>
  );
}
