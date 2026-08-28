"use client";

import { useState } from "react";
import { Loader2, Mail, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { OutreachConnectionsPanel, type EmailConnection } from "@/components/outreach/outreach-connections-panel";
import { OutreachTargetRow, type OutreachTarget } from "@/components/outreach/outreach-target-row";

export function OutreachWorkspace({
  projectId,
  initialTargets,
  initialConnections,
}: {
  projectId: string;
  initialTargets: OutreachTarget[];
  initialConnections: EmailConnection[];
}) {
  const [targets, setTargets] = useState(initialTargets);
  const [connections, setConnections] = useState(initialConnections);
  const [newDomain, setNewDomain] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAddTarget(e: React.FormEvent) {
    e.preventDefault();
    if (!newDomain.trim()) return;
    setError(null);
    setIsAdding(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/outreach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: newDomain.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't add that domain.");
      setTargets((prev) => [{ ...data.target, createdAt: data.target.createdAt, sentAt: data.target.sentAt }, ...prev]);
      setNewDomain("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that domain.");
    } finally {
      setIsAdding(false);
    }
  }

  function handleUpdateTarget(next: OutreachTarget) {
    setTargets((prev) => prev.map((t) => (t.id === next.id ? next : t)));
  }

  function handleRemoveTarget(id: string) {
    setTargets((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="flex flex-col gap-6">
      <OutreachConnectionsPanel projectId={projectId} connections={connections} onConnectionsChange={setConnections} />

      <Card>
        <CardHeader>
          <CardTitle>Add a target</CardTitle>
          <CardDescription>
            Add a domain directly, or add one straight from a real backlink row on the Backlinks page. We'll try to
            find a real contact email automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddTarget} className="flex flex-col gap-2 sm:flex-row">
            <Input placeholder="e.g. example.com" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} className="flex-1" />
            <Button type="submit" disabled={isAdding} className="gap-1.5">
              {isAdding ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Add target
            </Button>
          </form>
          {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      {targets.length === 0 ? (
        <EmptyState icon={Mail} title="No outreach targets yet" description="Add a domain above, or add one from a real backlink row on the Backlinks page." />
      ) : (
        <div className="flex flex-col gap-2">
          {targets.map((t) => (
            <OutreachTargetRow key={t.id} target={t} connections={connections} projectId={projectId} onUpdate={handleUpdateTarget} onRemove={handleRemoveTarget} />
          ))}
        </div>
      )}
    </div>
  );
}
