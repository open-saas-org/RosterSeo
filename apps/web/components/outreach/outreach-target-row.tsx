"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, Loader2, Save, Search, Send, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";
import type { EmailConnection } from "@/components/outreach/outreach-connections-panel";

export type OutreachTarget = {
  id: string;
  domain: string;
  sourceUrlFrom: string | null;
  contactEmail: string | null;
  contactEmailSource: string | null;
  subject: string | null;
  body: string | null;
  status: string;
  emailConnectionId: string | null;
  failureReason: string | null;
  sentAt: string | null;
  createdAt: string;
};

function StatusBadge({ status }: { status: string }) {
  if (status === "sent") return <Badge variant="success">Sent</Badge>;
  if (status === "queued") return <Badge variant="secondary">Queued</Badge>;
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  if (status === "drafted") return <Badge variant="outline">Drafted</Badge>;
  return <Badge variant="outline">New</Badge>;
}

export function OutreachTargetRow({
  target,
  connections,
  projectId,
  onUpdate,
  onRemove,
}: {
  target: OutreachTarget;
  connections: EmailConnection[];
  projectId: string;
  onUpdate: (next: OutreachTarget) => void;
  onRemove: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [contactEmail, setContactEmail] = useState(target.contactEmail ?? "");
  const [subject, setSubject] = useState(target.subject ?? "");
  const [body, setBody] = useState(target.body ?? "");
  const [connectionId, setConnectionId] = useState(target.emailConnectionId ?? "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isFindingEmail, setIsFindingEmail] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(updates: Record<string, unknown>) {
    const res = await fetch(`/api/projects/${projectId}/outreach/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Couldn't save.");
    onUpdate(data.target);
    return data.target as OutreachTarget;
  }

  async function handleGenerate() {
    setError(null);
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/outreach/${target.id}/draft`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't generate a draft.");
      setSubject(data.target.subject ?? "");
      setBody(data.target.body ?? "");
      onUpdate(data.target);
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate a draft.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSave() {
    setError(null);
    setIsSaving(true);
    try {
      await patch({ contactEmail, subject, body, emailConnectionId: connectionId || null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleFindEmail() {
    setError(null);
    setIsFindingEmail(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/outreach/find-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: target.domain }),
      });
      const data = await res.json();
      if (data.found) {
        setContactEmail(data.found.email);
        await patch({ contactEmail: data.found.email });
      } else {
        setError("No published email found on this domain's homepage/contact/about pages - enter one manually.");
      }
    } catch {
      setError("Couldn't crawl this domain for an email. Enter one manually.");
    } finally {
      setIsFindingEmail(false);
    }
  }

  async function handleSend() {
    setError(null);
    setIsSending(true);
    try {
      await patch({ contactEmail, subject, body, emailConnectionId: connectionId || null });
      const res = await fetch(`/api/projects/${projectId}/outreach/${target.id}/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't send.");
      onUpdate({ ...target, status: "queued", contactEmail, subject, body, emailConnectionId: connectionId || null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleRemove() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/outreach/${target.id}`, { method: "DELETE" });
      if (res.ok) onRemove(target.id);
    } finally {
      setIsDeleting(false);
    }
  }

  const canSend = !!contactEmail && !!subject && !!body && !!connectionId && target.status !== "sent" && target.status !== "queued";

  return (
    <div className="rounded-lg border">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/40">
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{target.domain}</span>
            <StatusBadge status={target.status} />
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {target.contactEmail ?? "No contact email yet"}
            {target.subject ? ` · ${target.subject}` : ""}
          </p>
        </div>
        <IconButton
          icon={isDeleting ? Loader2 : Trash2}
          label={`Remove ${target.domain}`}
          size="icon-sm"
          variant="ghost"
          disabled={isDeleting}
          onClick={(e) => {
            e.stopPropagation();
            void handleRemove();
          }}
          className={cn("shrink-0 text-destructive hover:text-destructive", isDeleting && "[&_svg]:animate-spin")}
        />
      </button>

      {expanded ? (
        <div className="flex flex-col gap-4 border-t p-3">
          {target.sourceUrlFrom ? (
            <p className="text-xs text-muted-foreground">
              From backlink: <a href={target.sourceUrlFrom} target="_blank" rel="noreferrer noopener" className="hover:underline">{target.sourceUrlFrom}</a>
            </p>
          ) : null}

          <div className="flex items-end gap-4">
            <div className="flex-1">
              <Label htmlFor={`email-${target.id}`} className="mb-1.5 block text-xs text-muted-foreground">
                Contact email
              </Label>
              <Input id={`email-${target.id}`} type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="contact@domain.com" />
            </div>
            <Button type="button" variant="outline" size="sm" disabled={isFindingEmail} onClick={handleFindEmail} className="gap-1.5">
              {isFindingEmail ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
              Find email
            </Button>
          </div>
          {target.contactEmailSource && target.contactEmailSource !== "manual" ? (
            <p className="text-xs text-muted-foreground">
              Found on <a href={target.contactEmailSource} target="_blank" rel="noreferrer noopener" className="hover:underline">{target.contactEmailSource}</a>
            </p>
          ) : null}

          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Draft</Label>
            <Button type="button" variant="outline" size="xs" disabled={isGenerating} onClick={handleGenerate} className="gap-1.5">
              {isGenerating ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
              {target.subject ? "Regenerate with AI" : "Generate with AI"}
            </Button>
          </div>
          <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Textarea placeholder="Email body" value={body} onChange={(e) => setBody(e.target.value)} rows={8} />

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Send from</Label>
            <Select
              value={connectionId}
              onValueChange={(v) => setConnectionId(v ?? "")}
              items={connections.map((c) => ({ value: c.id, label: c.fromEmail }))}
            >
              <SelectTrigger>
                <SelectValue placeholder={connections.length === 0 ? "Connect an email first" : "Choose a connected sender"} />
              </SelectTrigger>
              <SelectContent>
                {connections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.fromEmail}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {target.failureReason ? (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>{target.failureReason}</AlertTitle>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          ) : null}

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={isSaving} onClick={handleSave} className="gap-1.5">
              {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              Save
            </Button>
            <Button type="button" size="sm" disabled={!canSend || isSending} onClick={handleSend} className="gap-1.5">
              {isSending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              {target.status === "sent" ? "Sent" : target.status === "queued" ? "Sending…" : "Send"}
            </Button>
            {target.sentAt ? <span className="text-xs text-muted-foreground">Sent {new Date(target.sentAt).toLocaleString()}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
