"use client";

import { useState } from "react";
import Image from "next/image";
import { AlertTriangle, Check, ExternalLink, Info, Loader2, Plus, Trash2, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { IconButton } from "@/components/ui/icon-button";
import type { BlogConnectionView, BlogPlatformDefView } from "./types";

export function PublishConnectCard({
  projectId,
  platform,
  connections,
  onConnectionsChange,
}: {
  projectId: string;
  platform: BlogPlatformDefView;
  connections: BlogConnectionView[];
  onConnectionsChange: (next: BlogConnectionView[]) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [showShopifyDomainForm, setShowShopifyDomainForm] = useState(false);
  const [shopifyDomain, setShopifyDomain] = useState("");
  const [label, setLabel] = useState("");
  const [siteIdentifier, setSiteIdentifier] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/blog/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: platform.id, label: label || platform.name, siteIdentifier, credentials }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Couldn't connect ${platform.name}.`);
      onConnectionsChange([data.connection, ...connections]);
      setLabel("");
      setSiteIdentifier("");
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
      const res = await fetch(`/api/projects/${projectId}/blog/connections?id=${id}`, { method: "DELETE" });
      if (res.ok) onConnectionsChange(connections.filter((c) => c.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-publish/20 bg-publish/10">
          <Image src={platform.logo} alt="" width={20} height={20} className="rounded" />
        </div>
        <CardTitle className="flex-1 text-base">{platform.name}</CardTitle>
        {platform.gated ? (
          <Badge variant="secondary" className="text-xs font-normal">
            Pending approval
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* How to connect - always visible, so you know what you need before clicking anything */}
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3 shrink-0" />
          {platform.gated
            ? platform.gatedNote
            : platform.oauthCapable
              ? `Click Connect - you'll log into ${platform.name} and approve access, then we automatically detect every real site on that account. Nothing is asked for manually.`
              : platform.helpText
                ? platform.helpText
                : `Enter your ${platform.name} credentials below.`}
          {!platform.gated && platform.helpUrl ? (
            <a href={platform.helpUrl} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 whitespace-nowrap text-primary hover:underline">
              Open settings <ExternalLink className="size-3" />
            </a>
          ) : null}
        </p>

        {connections.length > 0 ? (
          <div className="flex flex-col gap-4">
            {connections.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    <Check className="size-3.5 text-success" />
                    {c.label}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{c.siteIdentifier}</p>
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
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        ) : null}

        {platform.oauthCapable ? (
          platform.id === "shopify" ? (
            showShopifyDomainForm ? (
              <form className="flex flex-col gap-4 rounded-lg border p-3 mt-2" onSubmit={(e) => {
                e.preventDefault();
                if (shopifyDomain) window.location.href = `/api/integrations/blog/connect?projectId=${projectId}&platform=${platform.id}&shopDomain=${encodeURIComponent(shopifyDomain)}`;
              }}>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">Shopify Domain (e.g., your-store.myshopify.com)</Label>
                  <Input required placeholder="your-store.myshopify.com" value={shopifyDomain} onChange={(e) => setShopifyDomain(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <Button type="submit" size="sm" className="gap-1.5">Continue to Shopify</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowShopifyDomainForm(false)}>Cancel</Button>
                </div>
              </form>
            ) : (
              <Button type="button" size="sm" className="w-fit gap-1.5" onClick={() => setShowShopifyDomainForm(true)}>
                <Zap className="size-3.5" />
                Connect {platform.name} - one click
              </Button>
            )
          ) : (
            <a href={`/api/integrations/blog/connect?projectId=${projectId}&platform=${platform.id}`} className="inline-flex w-fit">
              <Button type="button" size="sm" className="gap-1.5">
                <Zap className="size-3.5" />
                Connect {platform.name} - one click
              </Button>
            </a>
          )
        ) : null}

        {!showForm ? (
          <Button type="button" variant={platform.oauthCapable ? "ghost" : "outline"} size="sm" disabled={platform.gated} onClick={() => setShowForm(true)} className="w-fit gap-1.5">
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
              <Label className="text-xs text-muted-foreground">{platform.siteIdentifierLabel}</Label>
              <Input required value={siteIdentifier} onChange={(e) => setSiteIdentifier(e.target.value)} />
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
