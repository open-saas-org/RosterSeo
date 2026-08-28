"use client";

import { useEffect, useState } from "react";
import { Loader2, MapPin, Search, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LocalBusinessProfile } from "./business-profile-listing";

type GeoOption = { code: number; name: string };
type CountryGeoOption = { code: number; isoCode: string; name: string };

type SearchResult = {
  title: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  reviewCount: number;
  category: string | null;
  placeId: string | null;
};

// Real search-and-pick flow for Local SEO's Profile page that needs NO
// Google OAuth and none of the Business Profile API's manual approval
// process: a real Country -> State -> City selector (DataForSEO's own
// location hierarchy, .../business-profile/geo) feeds a real
// location_code into DataForSEO's Maps search (.../business-profile/search
// -> searchMapsBusinesses), returning real candidate listings for the user
// to pick from. Picking one triggers a further real enrichment call
// server-side (getBusinessListingDetails, via PATCH .../business-profile)
// that pulls the full listing - category, hours, phone, attributes, etc.
// A collapsed manual lat/lng fallback underneath handles the rare case a
// business isn't indexed yet (skips enrichment entirely, since there's no
// query/location to look it up by).
export function BusinessProfileForm({
  projectId,
  onSaved,
}: {
  projectId: string;
  onSaved: (profile: LocalBusinessProfile) => void;
}) {
  const [countries, setCountries] = useState<CountryGeoOption[] | null>(null);
  const [countriesError, setCountriesError] = useState<string | null>(null);
  // Drives the Select + the state/city fetch effects below. This must be
  // the ISO code ("US"), not the country's numeric location_code - the
  // per-country locations endpoint is keyed by ISO code in its URL path,
  // and those two identifiers are unrelated for a given country.
  const [countryIso, setCountryIso] = useState<string | undefined>(undefined);
  const selectedCountry = countries?.find((c) => c.isoCode === countryIso);

  const [states, setStates] = useState<GeoOption[] | null>(null);
  const [statesError, setStatesError] = useState<string | null>(null);
  const [stateCode, setStateCode] = useState<string | undefined>(undefined);

  const [cities, setCities] = useState<GeoOption[] | null>(null);
  const [citiesError, setCitiesError] = useState<string | null>(null);
  const [cityCode, setCityCode] = useState<string | undefined>(undefined);

  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);

  const [showManual, setShowManual] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [isSavingManual, setIsSavingManual] = useState(false);

  // Real countries, loaded once.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/local-seo/business-profile/geo?level=country`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setCountries(data.options ?? []);
      })
      .catch(() => {
        if (!cancelled) setCountriesError("Couldn't load countries.");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Real states for the picked country.
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
    setStatesError(null);
    fetch(`/api/projects/${projectId}/local-seo/business-profile/geo?level=state&country=${encodeURIComponent(countryIso)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setStates(data.options ?? []);
      })
      .catch(() => {
        if (!cancelled) setStatesError("Couldn't load states/regions.");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, countryIso]);

  // Real cities for the picked state.
  useEffect(() => {
    setCityCode(undefined);
    if (!countryIso || !stateCode) {
      setCities(null);
      return;
    }
    let cancelled = false;
    setCities(null);
    setCitiesError(null);
    fetch(
      `/api/projects/${projectId}/local-seo/business-profile/geo?level=city&country=${encodeURIComponent(countryIso)}&state=${encodeURIComponent(stateCode)}`,
    )
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setCities(data.options ?? []);
      })
      .catch(() => {
        if (!cancelled) setCitiesError("Couldn't load cities.");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, countryIso, stateCode]);

  async function saveProfile(body: Record<string, unknown>) {
    const res = await fetch(`/api/projects/${projectId}/local-seo/business-profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Save failed");
    onSaved(data.profile);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const locationCode = cityCode ?? stateCode ?? (selectedCountry ? String(selectedCountry.code) : undefined);
    if (!query.trim() || !locationCode || isSearching) return;
    setIsSearching(true);
    setSearchError(null);
    setResults(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/local-seo/business-profile/search?query=${encodeURIComponent(query.trim())}&locationCode=${encodeURIComponent(locationCode)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setResults(data.results ?? []);
    } catch (err) {
      // Surfaces the real, specific server message instead of a generic
      // string - the whole point is telling the user exactly what to fix.
      setSearchError(err instanceof Error ? err.message : "Couldn't search right now. Try again.");
    } finally {
      setIsSearching(false);
    }
  }

  async function handlePick(result: SearchResult, index: number) {
    if (result.lat === null || result.lng === null) {
      setSaveError("That result has no coordinates - try another, or enter your location manually below.");
      return;
    }
    const locationCode = cityCode ?? stateCode ?? (selectedCountry ? String(selectedCountry.code) : undefined);
    setSaveError(null);
    setSavingIndex(index);
    try {
      await saveProfile({
        name: result.title,
        lat: result.lat,
        lng: result.lng,
        address: result.address,
        category: result.category,
        rating: result.rating,
        reviewCount: result.reviewCount,
        placeId: result.placeId,
        searchQuery: query.trim(),
        locationCode: locationCode ? Number(locationCode) : null,
      });
    } catch {
      setSaveError("Couldn't save that location. Try again.");
    } finally {
      setSavingIndex(null);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualName.trim() || manualLat.trim() === "" || manualLng.trim() === "" || isSavingManual) return;
    setIsSavingManual(true);
    setSaveError(null);
    try {
      await saveProfile({ name: manualName.trim(), lat: Number(manualLat), lng: Number(manualLng) });
    } catch {
      setSaveError("Couldn't save that location. Try again.");
    } finally {
      setIsSavingManual(false);
    }
  }

  const canSearch = query.trim().length > 0 && Boolean(countryIso) && !isSearching;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSearch} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-1.5 sm:col-span-1">
            <Label htmlFor="biz-search-name">Business name</Label>
            <Input id="biz-search-name" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Acme Plumbing" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Country</Label>
            <Select
              value={countryIso}
              onValueChange={(v) => setCountryIso(String(v))}
              items={(countries ?? []).map((c) => ({ value: c.isoCode, label: c.name }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={countries === null ? "Loading…" : "Choose a country"} />
              </SelectTrigger>
              <SelectContent>
                {(countries ?? []).map((c) => (
                  <SelectItem key={c.isoCode} value={c.isoCode}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {countriesError ? <p className="text-xs text-destructive">{countriesError}</p> : null}
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
                <SelectValue placeholder={!countryIso ? "Pick a country first" : states === null ? "Loading…" : "Choose a state (optional)"} />
              </SelectTrigger>
              <SelectContent>
                {(states ?? []).map((s) => (
                  <SelectItem key={s.code} value={String(s.code)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {statesError ? <p className="text-xs text-destructive">{statesError}</p> : null}
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
                <SelectValue placeholder={!stateCode ? "Pick a state first" : cities === null ? "Loading…" : "Choose a city (optional)"} />
              </SelectTrigger>
              <SelectContent>
                {(cities ?? []).map((c) => (
                  <SelectItem key={c.code} value={String(c.code)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {citiesError ? <p className="text-xs text-destructive">{citiesError}</p> : null}
          </div>
        </div>
        <div>
          <Button type="submit" disabled={!canSearch}>
            {isSearching ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            Search
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            State and city narrow the search but aren&apos;t required - country alone works too.
          </p>
        </div>
      </form>

      {searchError ? <p className="text-sm text-destructive">{searchError}</p> : null}
      {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}

      {results !== null ? (
        results.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matches found. Try narrowing/widening the location, or enter it manually below.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {results.map((result, i) => (
              <li key={i}>
                <Card className="flex flex-row items-center justify-between gap-3 p-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{result.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {result.address ?? "No address"}
                      {result.category ? ` · ${result.category}` : ""}
                    </span>
                    {result.rating !== null ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Star className="size-3 fill-current" />
                        {result.rating.toFixed(1)} ({result.reviewCount})
                      </span>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePick(result, i)}
                    disabled={savingIndex !== null || result.lat === null}
                  >
                    {savingIndex === i ? <Loader2 className="size-3.5 animate-spin" /> : <MapPin className="size-3.5" />}
                    Use this
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )
      ) : null}

      <div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowManual((v) => !v)}>
          {showManual ? "Hide manual entry" : "Can't find it? Enter coordinates manually"}
        </Button>
      </div>

      {showManual ? (
        <form onSubmit={handleManualSubmit} className="flex flex-col gap-4 rounded-lg border p-3">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="manual-loc-name">Business name</Label>
              <Input id="manual-loc-name" value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Acme Plumbing" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="manual-loc-lat">Latitude</Label>
              <Input id="manual-loc-lat" type="number" step="any" value={manualLat} onChange={(e) => setManualLat(e.target.value)} placeholder="30.2672" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="manual-loc-lng">Longitude</Label>
              <Input id="manual-loc-lng" type="number" step="any" value={manualLng} onChange={(e) => setManualLng(e.target.value)} placeholder="-97.7431" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!manualName.trim() || !manualLat.trim() || !manualLng.trim() || isSavingManual} size="sm">
              {isSavingManual ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Save location
            </Button>
            <p className="text-xs text-muted-foreground">
              Right-click your business on{" "}
              <a href="https://maps.google.com" target="_blank" rel="noreferrer" className="underline underline-offset-4">
                Google Maps
              </a>{" "}
              to copy its lat/lng.
            </p>
          </div>
        </form>
      ) : null}
    </div>
  );
}
