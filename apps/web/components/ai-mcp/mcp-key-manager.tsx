"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ListSkeleton } from "@/components/ui/loading-skeletons";
import { CopyCommandButton } from "@/components/ai-mcp/copy-command-button";

type McpKey = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function McpKeyManager() {
  const [keys, setKeys] = useState<McpKey[] | null>(null);
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/mcp-keys")
      .then((res) => res.json())
      .then((data) => setKeys(data.keys ?? []))
      .catch(() => setKeys([]));
  }, []);

  useEffect(() => load(), [load]);

  async function handleCreate() {
    setError(null);
    setIsCreating(true);
    try {
      const res = await fetch("/api/mcp-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't create a key.");
      setCreatedKey(data.key);
      setNewName("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create a key.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try {
      await fetch(`/api/mcp-keys/${id}`, { method: "DELETE" });
      load();
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>API keys</CardTitle>
        <CardDescription>
          The MCP server authenticates every tool call with one of these keys, scoped to your account - it can only
          ever see projects you have access to.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {createdKey ? (
          <Alert>
            <KeyRound />
            <AlertTitle>Your new API key</AlertTitle>
            <AlertDescription>
              <p className="mb-2">Copy this now - it won&apos;t be shown again.</p>
              <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2">
                <code className="overflow-x-auto text-sm">{createdKey}</code>
                <CopyCommandButton command={createdKey} />
              </div>
              <Button variant="ghost" size="xs" className="mt-2" onClick={() => setCreatedKey(null)}>
                Done
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="mcp-key-name" className="text-xs text-muted-foreground">
                Name (optional)
              </Label>
              <Input
                id="mcp-key-name"
                placeholder="e.g. Claude Desktop"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <Button size="sm" onClick={handleCreate} disabled={isCreating} className="gap-1.5">
              {isCreating ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
              Generate new key
            </Button>
          </div>
        )}
        {error ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        ) : null}

        {keys === null ? (
          <ListSkeleton rows={2} />
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API keys yet - generate one above to connect an MCP client.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{k.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    <code>{k.keyPrefix}…</code> · Created {formatDate(k.createdAt)} · Last used {formatDate(k.lastUsedAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={revokingId === k.id}
                  onClick={() => handleRevoke(k.id)}
                  className="shrink-0 text-destructive hover:text-destructive"
                  aria-label={`Revoke key "${k.name}"`}
                >
                  {revokingId === k.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  <span className="sr-only">Revoke key &ldquo;{k.name}&rdquo;</span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
