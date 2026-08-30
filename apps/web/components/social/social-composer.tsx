"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Loader2, Send, Share2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import type { SocialConnectionView, SocialPlatformDefView } from "./types";

export function SocialComposer({
  projectId,
  connections,
  platforms,
}: {
  projectId: string;
  connections: SocialConnectionView[];
  platforms: SocialPlatformDefView[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const platformById = new Map(platforms.map((p) => [p.id, p]));
  const selectedNeedsMedia = connections.some((c) => selectedIds.includes(c.id) && platformById.get(c.platform)?.requiresMedia);

  function toggleConnection(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (selectedNeedsMedia && !mediaUrl.trim()) {
      setError("At least one selected platform needs an image - add an image URL.");
      return;
    }
    setIsCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/social/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mediaUrls: mediaUrl.trim() ? [mediaUrl.trim()] : [], connectionIds: selectedIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't create that post.");
      router.push(`/social/posts/${data.post.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create that post.");
      setIsCreating(false);
    }
  }

  if (connections.length === 0) {
    return (
      <EmptyState
        icon={Share2}
        title="No social platforms connected yet"
        description="Connect at least one social platform before you can compose a post."
        action={
          <Button render={<Link href="/social/connections" />} size="sm">
            Connect a platform
          </Button>
        }
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Share2 className="size-4 text-sky" />
          New post
        </CardTitle>
        <CardDescription>Write it once here - on the next screen you can have AI adapt it per platform (respecting each one&apos;s character limit) before you post or schedule it.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="social-text" className="text-xs text-muted-foreground">
              Text
            </Label>
            <Textarea id="social-text" required rows={5} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="social-media" className="text-xs text-muted-foreground">
              Image URL {selectedNeedsMedia ? "(required for one or more selected platforms)" : "(optional)"}
            </Label>
            <Input id="social-media" type="url" placeholder="https://..." value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Post to</Label>
            <div className="flex flex-wrap gap-2">
              {connections.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-sky has-[:checked]:bg-sky/10 has-[:checked]:text-sky"
                >
                  <input type="checkbox" className="accent-sky" checked={selectedIds.includes(c.id)} onChange={() => toggleConnection(c.id)} />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          ) : null}
          <Button type="submit" disabled={isCreating || selectedIds.length === 0} className="w-fit gap-1.5">
            {isCreating ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Continue
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
