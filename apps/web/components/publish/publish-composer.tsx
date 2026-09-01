"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, Check, Loader2, Newspaper, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import { EmptyState } from "@/components/empty-state";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { cn } from "@/lib/utils";
import type { BlogConnectionView, BlogPlatformDefView, BlogPlatformTemplateView } from "./types";

export function PublishComposer({
  projectId,
  connections,
  platforms,
  templates: initialTemplates,
}: {
  projectId: string;
  connections: BlogConnectionView[];
  platforms: BlogPlatformDefView[];
  templates: BlogPlatformTemplateView[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [templates, setTemplates] = useState(initialTemplates);
  const [templateId, setTemplateId] = useState<string | undefined>();
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [editPerPlatform, setEditPerPlatform] = useState(false);
  const [scheduledFor, setScheduledFor] = useState(""); // "YYYY-MM-DDTHH:mm", same shape a datetime-local input produces
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const platformById = new Map(platforms.map((p) => [p.id, p]));

  const [scheduledDatePart, scheduledTimePart] = scheduledFor ? scheduledFor.split("T") : [undefined, undefined];
  const scheduledDate = scheduledDatePart ? new Date(`${scheduledDatePart}T00:00:00`) : undefined;
  const scheduledTime = scheduledTimePart ?? "09:00";

  function setScheduleDate(nextDate: Date | undefined) {
    if (!nextDate) {
      setScheduledFor("");
      return;
    }
    const y = nextDate.getFullYear();
    const m = String(nextDate.getMonth() + 1).padStart(2, "0");
    const d = String(nextDate.getDate()).padStart(2, "0");
    setScheduledFor(`${y}-${m}-${d}T${scheduledTime}`);
  }

  function setScheduleTime(nextTime: string) {
    if (!scheduledDatePart) return;
    setScheduledFor(`${scheduledDatePart}T${nextTime}`);
  }

  function toggleConnection(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setTemplateId(undefined); // a manual edit no longer matches whichever template was selected
  }

  function applyTemplate(id: string | null) {
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    setTemplateId(id ?? undefined);
    setSelectedIds(template.connectionIds.filter((cid) => connections.some((c) => c.id === cid)));
  }

  async function saveTemplate() {
    const name = window.prompt("Name this platform combination");
    if (!name?.trim()) return;
    setIsSavingTemplate(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/blog/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), connectionIds: selectedIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save that selection.");
      setTemplates((prev) => [data.template, ...prev]);
      setTemplateId(data.template.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that selection.");
    } finally {
      setIsSavingTemplate(false);
    }
  }

  function validationError(): string | null {
    if (selectedIds.length === 0) return "Select at least one platform.";
    if (!title.trim()) return "Give the post a title.";
    if (!body.trim()) return "Write something first.";
    return null;
  }

  async function handleSubmit(schedule: boolean) {
    const validation = validationError();
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const createRes = await fetch(`/api/projects/${projectId}/blog/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          excerpt: excerpt.trim() || undefined,
          coverImageUrl: coverImageUrl.trim() || undefined,
          tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
          connectionIds: selectedIds,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error ?? "Couldn't create that post.");

      if (editPerPlatform) {
        // Same title/body was just saved to every target - land on the
        // review screen so each one can still be AI-adapted before
        // anything actually publishes, instead of publishing it unadapted.
        router.push(`/publish/posts/${createData.post.id}`);
        return;
      }

      const publishRes = await fetch(`/api/projects/${projectId}/blog/posts/${createData.post.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedule && scheduledFor ? { scheduledFor: new Date(scheduledFor).toISOString() } : {}),
      });
      const publishData = await publishRes.json();
      if (!publishRes.ok) throw new Error(publishData.error ?? "Couldn't publish that post.");
      router.push(`/publish/posts/${createData.post.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't publish that post.");
      setIsSubmitting(false);
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
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Publish to</Label>
            <div className="flex items-center gap-2">
              <Select value={templateId} onValueChange={applyTemplate}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="No preselected platforms" />
                </SelectTrigger>
                <SelectContent>
                  {templates.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No saved combinations yet</div>
                  ) : (
                    templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm" disabled={selectedIds.length === 0 || isSavingTemplate} onClick={saveTemplate} className="gap-1.5">
                {isSavingTemplate ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Save selection
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {connections.map((c) => {
              const def = platformById.get(c.platform);
              const selected = selectedIds.includes(c.id);
              return (
                <Tooltip key={c.id}>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={() => toggleConnection(c.id)}
                        aria-pressed={selected}
                        className={cn(
                          "relative flex size-10 items-center justify-center rounded-full border transition-colors",
                          selected ? "border-publish bg-publish/10 ring-2 ring-publish/40" : "border-border hover:bg-muted/50",
                        )}
                      />
                    }
                  >
                    {def ? <Image src={def.logo} alt="" width={18} height={18} /> : <Newspaper className="size-4 text-muted-foreground" />}
                    {selected ? (
                      <span className="absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-full bg-publish text-white">
                        <Check className="size-2.5" />
                      </span>
                    ) : null}
                  </TooltipTrigger>
                  <TooltipContent>{c.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>New post</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="publish-title" className="text-xs text-muted-foreground">
                Title
              </Label>
              <Input id="publish-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Body</Label>
              <RichTextEditor value={body} onChange={setBody} placeholder="Write your post…" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="publish-excerpt" className="text-xs text-muted-foreground">
                  Excerpt (optional)
                </Label>
                <Textarea id="publish-excerpt" rows={2} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="A short summary shown in previews and feeds" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="publish-cover" className="text-xs text-muted-foreground">
                  Cover image URL (optional)
                </Label>
                <Input id="publish-cover" type="url" placeholder="https://..." value={coverImageUrl} onChange={(e) => setCoverImageUrl(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="publish-tags" className="text-xs text-muted-foreground">
                Tags (comma-separated, optional)
              </Label>
              <Input id="publish-tags" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="seo, marketing" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Edit content/image per platform</span>
              <Switch checked={editPerPlatform} onCheckedChange={setEditPerPlatform} />
            </label>

            {error ? (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertTitle>{error}</AlertTitle>
              </Alert>
            ) : null}

            {editPerPlatform ? (
              <Button type="button" disabled={isSubmitting} onClick={() => handleSubmit(false)} className="w-full gap-1.5 bg-publish text-publish-foreground hover:bg-publish/80">
                {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                Continue to per-platform editing
              </Button>
            ) : (
              <>
                <Button type="button" disabled={isSubmitting} onClick={() => handleSubmit(false)} className="w-full gap-1.5 bg-publish text-publish-foreground hover:bg-publish/80">
                  {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  Publish now
                </Button>
                <div className="flex flex-col gap-2 border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground">Or schedule for later</p>
                  <Calendar mode="single" selected={scheduledDate} onSelect={setScheduleDate} disabled={{ before: new Date(new Date().toDateString()) }} className="w-full rounded-lg border p-2" />
                  <Input type="time" value={scheduledTime} onChange={(e) => setScheduleTime(e.target.value)} className="h-8" />
                  <Button type="button" variant="outline" disabled={isSubmitting || !scheduledFor} onClick={() => handleSubmit(true)} className="w-full">
                    Schedule
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
