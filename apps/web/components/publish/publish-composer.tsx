"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Loader2, Newspaper, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import type { BlogConnectionView } from "./types";

export function PublishComposer({ projectId, connections }: { projectId: string; connections: BlogConnectionView[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleConnection(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/blog/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
          connectionIds: selectedIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't create that post.");
      router.push(`/publish/posts/${data.post.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create that post.");
      setIsCreating(false);
    }
  }

  if (connections.length === 0) {
    return (
      <EmptyState
        icon={Newspaper}
        title="No blog platforms connected yet"
        description="Connect at least one blogging platform before you can compose a post."
        action={
          <Button render={<Link href="/publish/connections" />} size="sm">
            Connect a platform
          </Button>
        }
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New post</CardTitle>
        <CardDescription>
          Write it once here, in Markdown - on the next screen you can have AI adapt it per platform before you
          publish or schedule it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="publish-title" className="text-xs text-muted-foreground">
              Title
            </Label>
            <Input id="publish-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="publish-body" className="text-xs text-muted-foreground">
              Body (Markdown)
            </Label>
            <Textarea id="publish-body" required rows={14} className="font-mono text-sm" value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="publish-tags" className="text-xs text-muted-foreground">
              Tags (comma-separated, optional)
            </Label>
            <Input id="publish-tags" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="seo, marketing" />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Publish to</Label>
            <div className="flex flex-wrap gap-2">
              {connections.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-publish has-[:checked]:bg-publish/5"
                >
                  <input type="checkbox" className="accent-publish" checked={selectedIds.includes(c.id)} onChange={() => toggleConnection(c.id)} />
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
