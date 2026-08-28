"use client";

import { useState, type FormEvent } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type AnalyzerFormInput = {
  url: string;
  targetKeyword: string;
  targetLocation?: string;
};

export function AnalyzerForm({
  onAnalyze,
  isLoading,
}: {
  onAnalyze: (input: AnalyzerFormInput) => void;
  isLoading: boolean;
}) {
  const [url, setUrl] = useState("");
  const [targetKeyword, setTargetKeyword] = useState("");
  const [targetLocation, setTargetLocation] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim() || !targetKeyword.trim() || isLoading) return;
    onAnalyze({
      url: url.trim(),
      targetKeyword: targetKeyword.trim(),
      targetLocation: targetLocation.trim() || undefined,
    });
  }

  return (
    // sm:grid-cols-2 as a tablet-width middle step (was jumping straight
    // from 1 column to a cramped 4-column row at md/768px) - URL takes the
    // full first row there, keyword+location share the second, button full
    // width; the 4-column layout only kicks in at lg/1024px where there's
    // actually room for it.
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1.2fr_1fr_auto] lg:items-end">
      <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
        <Label htmlFor="page-analyzer-url">Page URL</Label>
        <Input
          id="page-analyzer-url"
          type="url"
          inputMode="url"
          placeholder="https://example.com/blog/best-running-shoes"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          disabled={isLoading}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="page-analyzer-keyword">Target keyword</Label>
        <Input
          id="page-analyzer-keyword"
          placeholder="best running shoes"
          value={targetKeyword}
          onChange={(e) => setTargetKeyword(e.target.value)}
          required
          disabled={isLoading}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="page-analyzer-location">Location (optional)</Label>
        <Input
          id="page-analyzer-location"
          placeholder="United States"
          value={targetLocation}
          onChange={(e) => setTargetLocation(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <Button
        type="submit"
        variant="default"
        disabled={isLoading || !url.trim() || !targetKeyword.trim()}
        className="w-full sm:col-span-2 lg:col-span-1 lg:w-auto"
      >
        {isLoading ? <Loader2 className="animate-spin" /> : <Wand2 />}
        {isLoading ? "Analyzing…" : "Analyze"}
      </Button>
    </form>
  );
}
