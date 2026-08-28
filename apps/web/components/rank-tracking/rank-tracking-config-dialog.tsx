"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RankTrackingSettings } from "@/components/keywords/rank-tracking-types";

type GeoOption = { code: number; name: string };
type CountryGeoOption = { code: number; isoCode: string; name: string };

// Location/device/schedule config for the whole project - the cascading
// Country -> State -> City selects reuse the exact geo route and pattern
// already built for Local SEO's BusinessProfileForm (it's project-agnostic
// despite the URL path), just wired to rank_tracking_settings instead.
// "Weekly" is accepted and saved but stays inert this pass - no recurring
// job reads it yet, hence the note under the schedule select.
export function RankTrackingConfigDialog({
  projectId,
  open,
  onOpenChange,
  settings,
  onSaved,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: RankTrackingSettings;
  onSaved: (settings: RankTrackingSettings) => void;
}) {
  const [countries, setCountries] = useState<CountryGeoOption[] | null>(null);
  const [countryIso, setCountryIso] = useState<string | undefined>(undefined);
  const [states, setStates] = useState<GeoOption[] | null>(null);
  const [stateCode, setStateCode] = useState<string | undefined>(undefined);
  const [cities, setCities] = useState<GeoOption[] | null>(null);
  const [cityCode, setCityCode] = useState<string | undefined>(undefined);

  const [device, setDevice] = useState<"desktop" | "mobile">(settings.device);
  const [scheduleInterval, setScheduleInterval] = useState<"manual" | "weekly">(settings.scheduleInterval);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDevice(settings.device);
    setScheduleInterval(settings.scheduleInterval);
    setCountryIso(undefined);
    setStateCode(undefined);
    setCityCode(undefined);
    setError(null);
  }, [open, settings]);

  useEffect(() => {
    if (!open || countries !== null) return;
    let cancelled = false;
    fetch(`/api/projects/${projectId}/local-seo/business-profile/geo?level=country`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setCountries(data.options ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load countries.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, countries]);

  useEffect(() => {
    setStateCode(undefined);
    setCities(null);
    setCityCode(undefined);
    if (!countryIso) {
      setStates(null);
      return;
    }
    let cancelled = false;
    setStates(null);
    fetch(`/api/projects/${projectId}/local-seo/business-profile/geo?level=state&country=${encodeURIComponent(countryIso)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setStates(data.options ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load states/regions.");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, countryIso]);

  useEffect(() => {
    setCityCode(undefined);
    if (!countryIso || !stateCode) {
      setCities(null);
      return;
    }
    let cancelled = false;
    setCities(null);
    fetch(
      `/api/projects/${projectId}/local-seo/business-profile/geo?level=city&country=${encodeURIComponent(countryIso)}&state=${encodeURIComponent(stateCode)}`,
    )
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setCities(data.options ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load cities.");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, countryIso, stateCode]);

  const selectedCountry = countries?.find((c) => c.isoCode === countryIso);
  const selectedState = states?.find((s) => String(s.code) === stateCode);
  const selectedCity = cities?.find((c) => String(c.code) === cityCode);
  const pendingLocation = selectedCity ?? selectedState ?? selectedCountry ?? null;

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      const locationCode = pendingLocation ? pendingLocation.code : settings.locationCode;
      const locationName = pendingLocation ? pendingLocation.name : settings.locationName;
      const res = await fetch(`/api/projects/${projectId}/rank-tracking/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationCode, locationName, device, scheduleInterval }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      onSaved({
        locationCode: data.settings.locationCode,
        locationName: data.settings.locationName,
        device: data.settings.device,
        scheduleInterval: data.settings.scheduleInterval,
      });
    } catch {
      setError("Couldn't save settings. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure rank tracking</DialogTitle>
          <DialogDescription>
            Location and device apply to every tracked keyword the next time you fetch rankings.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Current location</Label>
            <p className="text-sm text-muted-foreground">{pendingLocation?.name ?? settings.locationName}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label>Country</Label>
              <Select
                value={countryIso}
                onValueChange={(v) => setCountryIso(String(v))}
                items={(countries ?? []).map((c) => ({ value: c.isoCode, label: c.name }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={countries === null ? "Loading…" : "Change country"} />
                </SelectTrigger>
                <SelectContent>
                  {(countries ?? []).map((c) => (
                    <SelectItem key={c.isoCode} value={c.isoCode}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>State / Region</Label>
              <Select
                value={stateCode}
                onValueChange={(v) => setStateCode(String(v))}
                disabled={!countryIso}
                items={(states ?? []).map((s) => ({ value: String(s.code), label: s.name }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={!countryIso ? "Pick a country" : states === null ? "Loading…" : "Optional"} />
                </SelectTrigger>
                <SelectContent>
                  {(states ?? []).map((s) => (
                    <SelectItem key={s.code} value={String(s.code)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>City</Label>
              <Select
                value={cityCode}
                onValueChange={(v) => setCityCode(String(v))}
                disabled={!stateCode}
                items={(cities ?? []).map((c) => ({ value: String(c.code), label: c.name }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={!stateCode ? "Pick a state" : cities === null ? "Loading…" : "Optional"} />
                </SelectTrigger>
                <SelectContent>
                  {(cities ?? []).map((c) => (
                    <SelectItem key={c.code} value={String(c.code)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Device</Label>
              <Select
                value={device}
                onValueChange={(v) => setDevice(v as "desktop" | "mobile")}
                items={[
                  { value: "desktop", label: "Desktop" },
                  { value: "mobile", label: "Mobile" },
                ]}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desktop">Desktop</SelectItem>
                  <SelectItem value="mobile">Mobile</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Schedule</Label>
              <Select
                value={scheduleInterval}
                onValueChange={(v) => setScheduleInterval(v as "manual" | "weekly")}
                items={[
                  { value: "manual", label: "Manual only" },
                  { value: "weekly", label: "Weekly" },
                ]}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual only</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
              {scheduleInterval === "weekly" ? (
                <p className="text-xs text-muted-foreground">
                  Saved for later - weekly runs aren&apos;t automatic yet. Use Fetch Rankings to check manually.
                </p>
              ) : null}
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
