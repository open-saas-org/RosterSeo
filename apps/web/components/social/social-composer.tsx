"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, Check, Loader2, Send, Share2, Smile } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import { EmptyState } from "@/components/empty-state";
import { SocialCharCounter } from "./social-char-counter";
import { cn } from "@/lib/utils";
import type { SocialConnectionView, SocialPlatformDefView, SocialPlatformTemplateView } from "./types";

// No API-key-requiring GIF/emoji service here on purpose - a small curated
// grid covers the common case (reactions, common objects) without adding
// a dependency or a key just for this.
const EMOJI = [
  "🎉", "🚀", "🔥", "✨", "💡", "📈", "✅", "👀", "❤️", "😄", "🙌", "👏",
  "📝", "📌", "🔗", "📣", "💬", "🎯", "⚡", "🌟", "🙏", "😅", "🤔", "👋",
];

export function SocialComposer({
  projectId,
  connections,
  platforms,
  templates: initialTemplates,
}: {
  projectId: string;
  connections: SocialConnectionView[];
  platforms: SocialPlatformDefView[];
  templates: SocialPlatformTemplateView[];
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [templates, setTemplates] = useState(initialTemplates);
  const [templateId, setTemplateId] = useState<string | undefined>();
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [editPerPlatform, setEditPerPlatform] = useState(false);
  const [scheduledFor, setScheduledFor] = useState(""); // "YYYY-MM-DDTHH:mm", same shape a datetime-local input produces
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const platformById = new Map(platforms.map((p) => [p.id, p]));
  const selectedConnections = connections.filter((c) => selectedIds.includes(c.id));
  const selectedNeedsMedia = selectedConnections.some((c) => platformById.get(c.platform)?.requiresMedia);

  const selectedLimits = selectedConnections
    .map((c) => platformById.get(c.platform)?.charLimit)
    .filter((n): n is number => typeof n === "number");
  const tightestLimit = selectedLimits.length > 0 ? Math.min(...selectedLimits) : undefined;
  const overPlatforms = selectedConnections.filter((c) => {
    const limit = platformById.get(c.platform)?.charLimit;
    return limit !== undefined && text.length > limit;
  });

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
      const res = await fetch(`/api/projects/${projectId}/social/templates`, {
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

  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    if (!el) {
      setText((prev) => prev + emoji);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  function validationError(): string | null {
    if (selectedIds.length === 0) return "Select at least one platform.";
    if (!text.trim()) return "Write something first.";
    if (selectedNeedsMedia && !mediaUrl.trim()) return "At least one selected platform needs an image - add an image URL.";
    if (overPlatforms.length > 0) return `Over the character limit for ${overPlatforms.map((c) => c.label).join(", ")}.`;
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
      const createRes = await fetch(`/api/projects/${projectId}/social/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mediaUrls: mediaUrl.trim() ? [mediaUrl.trim()] : [], connectionIds: selectedIds }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error ?? "Couldn't create that post.");

      if (editPerPlatform) {
        // Same body was just saved to every target - land on the review
        // screen so each one can still be AI-adapted/edited before anything
        // actually sends, instead of posting the unadapted version.
        router.push(`/social/posts/${createData.post.id}`);
        return;
      }

      const publishRes = await fetch(`/api/projects/${projectId}/social/posts/${createData.post.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedule && scheduledFor ? { scheduledFor: new Date(scheduledFor).toISOString() } : {}),
      });
      const publishData = await publishRes.json();
      if (!publishRes.ok) throw new Error(publishData.error ?? "Couldn't post that.");
      router.push(`/social/posts/${createData.post.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post that.");
      setIsSubmitting(false);
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
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Select platforms</Label>
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
                          selected ? "border-sky bg-sky/10 ring-2 ring-sky/40" : "border-border hover:bg-muted/50",
                        )}
                      />
                    }
                  >
                    {def ? <Image src={def.logo} alt="" width={18} height={18} /> : <Share2 className="size-4 text-muted-foreground" />}
                    {selected ? (
                      <span className="absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-full bg-sky text-white">
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
            <CardTitle className="flex items-center gap-1.5">
              <Share2 className="size-4 text-sky" />
              New post
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="social-text" className="text-xs text-muted-foreground">
                  Text
                </Label>
                {tightestLimit ? <SocialCharCounter length={text.length} limit={tightestLimit} /> : null}
              </div>
              <Textarea id="social-text" ref={textareaRef} rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="What's on your mind?" />
              <div className="flex items-center justify-between gap-3">
                <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                  <PopoverTrigger render={<Button type="button" variant="ghost" size="icon-sm" />}>
                    <Smile className="size-4" />
                  </PopoverTrigger>
                  <PopoverContent className="w-64">
                    <div className="grid grid-cols-8 gap-0.5">
                      {EMOJI.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => insertEmoji(emoji)}
                          className="flex size-7 items-center justify-center rounded-md text-base hover:bg-muted"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                {overPlatforms.length > 0 ? (
                  <p className="text-xs font-medium text-destructive">Over the limit for {overPlatforms.map((c) => c.label).join(", ")}.</p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="social-media" className="text-xs text-muted-foreground">
                Image URL {selectedNeedsMedia ? "(required for one or more selected platforms)" : "(optional)"}
              </Label>
              <Input id="social-media" type="url" placeholder="https://..." value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} />
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
              <Button type="button" disabled={isSubmitting} onClick={() => handleSubmit(false)} className="w-full gap-1.5">
                {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                Continue to per-platform editing
              </Button>
            ) : (
              <>
                <Button type="button" disabled={isSubmitting} onClick={() => handleSubmit(false)} className="w-full gap-1.5">
                  {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  Post now
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
