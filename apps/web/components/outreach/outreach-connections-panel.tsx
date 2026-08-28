"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Mail, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

export type EmailConnection = {
  id: string;
  type: "smtp" | "gmail_oauth";
  label: string;
  fromEmail: string;
  fromName: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  dailySendLimit: number;
  gmailNeedsReconnect: boolean;
  createdAt: string;
};

const emptySmtpForm = { label: "", fromEmail: "", fromName: "", smtpHost: "", smtpPort: "587", smtpUsername: "", smtpPassword: "" };

export function OutreachConnectionsPanel({
  projectId,
  connections,
  onConnectionsChange,
}: {
  projectId: string;
  connections: EmailConnection[];
  onConnectionsChange: (next: EmailConnection[]) => void;
}) {
  const [showSmtpForm, setShowSmtpForm] = useState(false);
  const [form, setForm] = useState(emptySmtpForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAddSmtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/email-connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, smtpPort: Number(form.smtpPort) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't connect that email.");
      onConnectionsChange([data.connection, ...connections]);
      setForm(emptySmtpForm);
      setShowSmtpForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't connect that email.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/projects/${projectId}/email-connections?id=${id}`, { method: "DELETE" });
      if (res.ok) onConnectionsChange(connections.filter((c) => c.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected senders</CardTitle>
        <CardDescription>
          Emails send from your own real inbox - one or several per project. SMTP works with any provider (Gmail App
          Password, Outlook, a custom domain); Gmail can also connect with one click.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No connected senders yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {connections.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Mail className="size-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.fromName ? `${c.fromName} <${c.fromEmail}>` : c.fromEmail}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.type === "gmail_oauth" ? "Gmail" : `SMTP · ${c.smtpHost}`} · up to {c.dailySendLimit}/day
                    </p>
                  </div>
                  {c.gmailNeedsReconnect ? <Badge variant="destructive">Reconnect needed</Badge> : null}
                </div>
                <IconButton
                  icon={deletingId === c.id ? Loader2 : Trash2}
                  variant="ghost"
                  size="icon-sm"
                  disabled={deletingId === c.id}
                  onClick={() => handleDelete(c.id)}
                  className={cn("shrink-0 text-destructive hover:text-destructive", deletingId === c.id && "[&_svg]:animate-spin")}
                  label={`Remove ${c.fromEmail}`}
                />
              </div>
            ))}
          </div>
        )}

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <a href={`/api/integrations/google/connect?projectId=${projectId}&service=gmail`} className="inline-flex">
            <Button type="button" variant="outline" size="sm" className="gap-1.5">
              <Mail className="size-3.5" />
              Connect Gmail
            </Button>
          </a>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setShowSmtpForm((v) => !v)}>
            <Plus className="size-3.5" />
            Add SMTP connection
          </Button>
        </div>

        {showSmtpForm ? (
          <form onSubmit={handleAddSmtp} className="flex flex-col gap-3 rounded-lg border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="smtp-from-email" className="text-xs text-muted-foreground">
                  From email
                </Label>
                <Input id="smtp-from-email" type="email" required placeholder="you@yourdomain.com" value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="smtp-from-name" className="text-xs text-muted-foreground">
                  From name (optional)
                </Label>
                <Input id="smtp-from-name" placeholder="Your Name" value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="smtp-host" className="text-xs text-muted-foreground">
                  SMTP host
                </Label>
                <Input id="smtp-host" required placeholder="smtp.gmail.com" value={form.smtpHost} onChange={(e) => setForm({ ...form, smtpHost: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="smtp-port" className="text-xs text-muted-foreground">
                  Port
                </Label>
                <Input id="smtp-port" type="number" required value={form.smtpPort} onChange={(e) => setForm({ ...form, smtpPort: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="smtp-username" className="text-xs text-muted-foreground">
                  Username
                </Label>
                <Input id="smtp-username" required value={form.smtpUsername} onChange={(e) => setForm({ ...form, smtpUsername: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="smtp-password" className="text-xs text-muted-foreground">
                  Password (an app password, for Gmail/Outlook)
                </Label>
                <Input id="smtp-password" type="password" required value={form.smtpPassword} onChange={(e) => setForm({ ...form, smtpPassword: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={isSaving} className="gap-1.5">
                {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Connect
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowSmtpForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
