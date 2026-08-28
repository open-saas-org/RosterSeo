"use client";

import { useState } from "react";
import Image from "next/image";
import { AlertTriangle, Check, Info, Loader2, Plus, Trash2, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconButton } from "@/components/ui/icon-button";
import type { SocialConnectionView, SocialPlatformDefView } from "./types";

export function SocialConnectCard({
  projectId,
  platform,
  connections,
  onConnectionsChange,
}: {
  projectId: string;
  platform: SocialPlatformDefView;
  connections: SocialConnectionView[];
  onConnectionsChange: (next: SocialConnectionView[]) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [instanceUrl, setInstanceUrl] = useState("");
  const [label, setLabel] = useState("");
  const [accountIdentifier, setAccountIdentifier] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/social/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: platform.id, label: label || platform.name, accountIdentifier, credentials }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Couldn't connect ${platform.name}.`);
      onConnectionsChange([data.connection, ...connections]);
      setLabel("");
      setAccountIdentifier("");
      setCredentials({});
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Couldn't connect ${platform.name}.`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/projects/${projectId}/social/connections?id=${id}`, { method: "DELETE" });
      if (res.ok) onConnectionsChange(connections.filter((c) => c.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  const oauthHref = `/api/integrations/social/connect?projectId=${projectId}&platform=${platform.id}${platform.requiresInstanceUrl && instanceUrl ? `&instanceUrl=${encodeURIComponent(instanceUrl)}` : ""}`;

  const howToConnect = platform.oauthCapable
    ? platform.requiresInstanceUrl
      ? `Enter your Mastodon instance below (the server your account lives on, e.g. mastodon.social), then click Connect - you'll log in there and approve access.`
      : `Click Connect - you'll log into ${platform.name} and approve access. We only request permission to post; we never see your password.`
    : `Enter your ${platform.name} credentials below.`;

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-sky/20 bg-sky/5">
          <Image src={platform.logo} alt="" width={20} height={20} className="rounded-sm" />
        </div>
        <CardTitle className="flex-1 text-base">{platform.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3 shrink-0" />
          {howToConnect}
        </p>
        {platform.accessNote ? (
          <p className="flex items-start gap-1.5 rounded-md bg-warning/5 px-2 py-1.5 text-xs text-warning">
            <Info className="mt-0.5 size-3 shrink-0" />
            {platform.accessNote}
          </p>
        ) : null}

        {connections.length > 0 ? (
          <div className="flex flex-col gap-2">
            {connections.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    <Check className="size-3.5 text-success" />
                    {c.label}
                  </p>
                  {c.status !== "connected" ? <p className="mt-0.5 text-xs text-destructive">{c.lastError ?? "Needs reconnecting"}</p> : null}
                </div>
                <IconButton
                  icon={deletingId === c.id ? Loader2 : Trash2}
                  label={`Disconnect ${c.label}`}
                  disabled={deletingId === c.id}
                  onClick={() => handleDelete(c.id)}
                  className="shrink-0 text-destructive hover:text-destructive"
                />
              </div>
            ))}
          </div>
        ) : null}

        {error ? (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="size-3.5" />
            {error}
          </p>
        ) : null}

        {platform.oauthCapable ? (
          platform.requiresInstanceUrl ? (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Instance URL</Label>
              <div className="flex gap-2">
                <Input placeholder="https://mastodon.social" value={instanceUrl} onChange={(e) => setInstanceUrl(e.target.value)} className="flex-1" />
                <a href={oauthHref} className={instanceUrl.trim() ? "inline-flex" : "pointer-events-none inline-flex opacity-50"}>
                  <Button type="button" size="sm" className="gap-1.5">
                    <Zap className="size-3.5" />
                    Connect
                  </Button>
                </a>
              </div>
            </div>
          ) : (
            <a href={oauthHref} className="inline-flex w-fit">
              <Button type="button" size="sm" className="gap-1.5">
                <Zap className="size-3.5" />
                Connect {platform.name} - one click
              </Button>
            </a>
          )
        ) : null}

        {!showForm ? (
          <Button type="button" variant={platform.oauthCapable ? "ghost" : "outline"} size="sm" onClick={() => setShowForm(true)} className="w-fit gap-1.5">
            <Plus className="size-3.5" />
            {platform.oauthCapable ? "Or connect manually with a token" : `Connect ${platform.name}`}
          </Button>
        ) : (
          <form onSubmit={handleConnect} className="flex flex-col gap-4 rounded-lg border p-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Label</Label>
              <Input required placeholder={platform.name} value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">{platform.accountIdentifierLabel}</Label>
              <Input required value={accountIdentifier} onChange={(e) => setAccountIdentifier(e.target.value)} />
            </div>
            {platform.credentialFields.map((field) => (
              <div key={field.key} className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">{field.label}</Label>
                <Input
                  required
                  type={field.type === "password" ? "password" : "text"}
                  value={credentials[field.key] ?? ""}
                  onChange={(e) => setCredentials((prev) => ({ ...prev, [field.key]: e.target.value }))}
                />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={isSaving} className="gap-1.5">
                {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Connect
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
