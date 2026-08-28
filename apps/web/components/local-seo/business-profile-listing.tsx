"use client";

import { useState } from "react";
import { Globe, Loader2, Phone, RefreshCw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export type LocalBusinessProfile = {
  projectId: string;
  name: string;
  lat: number;
  lng: number;
  placeId: string | null;
  cid: string | null;
  searchQuery: string | null;
  locationCode: number | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  domain: string | null;
  category: string | null;
  additionalCategories: string[] | null;
  description: string | null;
  rating: number | null;
  reviewCount: number | null;
  totalPhotos: number | null;
  isClaimed: boolean | null;
  workTime: unknown;
  attributes: unknown;
  lastSyncedAt: string | null;
  trackedKeyword: string | null;
  gridSize: number;
  radiusKm: number;
  autoTrackEnabled: boolean;
};

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function formatHour(t: { hour?: number; minute?: number }): string {
  const hour = t.hour ?? 0;
  const minute = t.minute ?? 0;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

// DataForSEO's real work_time shape:
// { work_hours: { timetable: { monday: [{ open: {hour,minute}, close: {hour,minute} }], ... } } }
// Rendered defensively - anything unexpected just falls back to null (no
// hours shown) rather than throwing.
function formatWorkTime(workTime: unknown): { day: string; hours: string }[] | null {
  const timetable = (workTime as { work_hours?: { timetable?: Record<string, unknown> } } | null)?.work_hours?.timetable;
  if (!timetable || typeof timetable !== "object") return null;

  const rows: { day: string; hours: string }[] = [];
  for (const day of DAY_ORDER) {
    const periods = timetable[day as keyof typeof timetable] as { open?: { hour?: number; minute?: number }; close?: { hour?: number; minute?: number } }[] | undefined;
    const label = day[0]!.toUpperCase() + day.slice(1);
    if (!periods || periods.length === 0) {
      rows.push({ day: label, hours: "Closed" });
      continue;
    }
    rows.push({
      day: label,
      hours: periods.map((p) => (p.open && p.close ? `${formatHour(p.open)} – ${formatHour(p.close)}` : "—")).join(", "),
    });
  }
  return rows;
}

export function BusinessProfileListing({
  projectId,
  profile,
  onResynced,
  onChangeBusiness,
}: {
  projectId: string;
  profile: LocalBusinessProfile;
  onResynced: (profile: LocalBusinessProfile) => void;
  onChangeBusiness: () => void;
}) {
  const [isResyncing, setIsResyncing] = useState(false);
  const [resyncError, setResyncError] = useState<string | null>(null);

  async function handleResync() {
    setIsResyncing(true);
    setResyncError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/local-seo/business-profile/resync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Re-sync failed");
      onResynced(data.profile);
    } catch (err) {
      setResyncError(err instanceof Error ? err.message : "Re-sync failed. Try again.");
    } finally {
      setIsResyncing(false);
    }
  }

  const hours = formatWorkTime(profile.workTime);
  const canResync = Boolean(profile.searchQuery && profile.locationCode);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle>{profile.name}</CardTitle>
          <CardDescription>
            {profile.address ?? `${profile.lat.toFixed(5)}, ${profile.lng.toFixed(5)}`}
            {profile.lastSyncedAt ? ` · synced ${new Date(profile.lastSyncedAt).toLocaleDateString()}` : " · manually entered"}
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canResync ? (
            <Button variant="outline" size="sm" onClick={handleResync} disabled={isResyncing}>
              {isResyncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Re-sync
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onChangeBusiness}>
            Change business
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {resyncError ? <p className="text-sm text-destructive">{resyncError}</p> : null}

        {profile.category || (profile.additionalCategories?.length ?? 0) > 0 || profile.isClaimed !== null ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {profile.category ? <Badge variant="seo">{profile.category}</Badge> : null}
            {(profile.additionalCategories ?? []).map((c) => (
              <Badge key={c} variant="outline">
                {c}
              </Badge>
            ))}
            {profile.isClaimed !== null ? (
              <Badge variant={profile.isClaimed ? "secondary" : "outline"}>{profile.isClaimed ? "Claimed" : "Unclaimed"}</Badge>
            ) : null}
          </div>
        ) : null}

        {profile.description ? <p className="text-sm text-muted-foreground">{profile.description}</p> : null}

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {profile.phone ? (
            <a href={`tel:${profile.phone}`} className="flex items-center gap-1.5 hover:underline">
              <Phone className="size-3.5 text-muted-foreground" />
              {profile.phone}
            </a>
          ) : null}
          {profile.website ? (
            <a href={profile.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:underline">
              <Globe className="size-3.5 text-muted-foreground" />
              {profile.domain ?? profile.website}
            </a>
          ) : null}
          {profile.rating !== null ? (
            <span className="flex items-center gap-1.5">
              <Star className="size-3.5 fill-current text-muted-foreground" />
              {profile.rating.toFixed(1)} ({profile.reviewCount ?? 0} reviews)
            </span>
          ) : null}
          {profile.totalPhotos ? <span className="text-muted-foreground">{profile.totalPhotos} photos</span> : null}
        </div>

        {hours ? (
          <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {hours.map((row) => (
              <div key={row.day} className="flex items-center justify-between gap-3 text-muted-foreground">
                <span className="font-medium text-foreground">{row.day}</span>
                <span>{row.hours}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Hours not available.</p>
        )}
      </CardContent>
    </Card>
  );
}
