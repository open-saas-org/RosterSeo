"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Archive, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ACTIVE_PROJECT_COOKIE } from "@/lib/project-cookie";

type ProjectDetails = {
  id: string;
  name: string;
  domain: string;
  targetLocation: string | null;
  createdAt: string;
};

function clearActiveProjectCookie() {
  document.cookie = `${ACTIVE_PROJECT_COOKIE}=; path=/; max-age=0`;
}

export function ProjectSettingsDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setConfirmingArchive(false);
      setConfirmingDelete(false);
      setConfirmText("");
      setDeleteError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    fetch(`/api/projects/${projectId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Couldn't load project details.");
        return res.json();
      })
      .then((data) => setProject(data.project))
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load project details."))
      .finally(() => setIsLoading(false));
  }, [open, projectId]);

  async function handleArchive() {
    setIsArchiving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivedAt: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error("Couldn't archive this project.");
      clearActiveProjectCookie();
      onOpenChange(false);
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't archive this project.");
      setIsArchiving(false);
    }
  }

  async function handleDelete() {
    if (!project) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmDomain: project.domain }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't delete this project.");
      clearActiveProjectCookie();
      onOpenChange(false);
      router.push("/");
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Couldn't delete this project.");
      setIsDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Project settings</DialogTitle>
          <DialogDescription>Details and danger-zone actions for this project.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ) : error && !project ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Couldn&apos;t load this project</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : project ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{project.name}</span>
              <span className="text-muted-foreground">Domain</span>
              <span className="font-medium">{project.domain}</span>
              <span className="text-muted-foreground">Target location</span>
              <span className="font-medium">{project.targetLocation ?? "Not set"}</span>
              <span className="text-muted-foreground">Created</span>
              <span className="font-medium">{new Date(project.createdAt).toLocaleDateString()}</span>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 p-3">
              <div>
                <p className="text-sm font-medium">Danger zone</p>
                <p className="text-xs text-muted-foreground">Remove this project from your active list.</p>
              </div>

              {confirmingArchive ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">
                    This archives <span className="font-medium text-foreground">{project.domain}</span> - it disappears from
                    your active project list, but all its data is kept and you can restore it later.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5" disabled={isArchiving} onClick={handleArchive}>
                      {isArchiving ? <Loader2 className="size-3.5 animate-spin" /> : <Archive className="size-3.5" />}
                      Yes, archive
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmingArchive(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : !confirmingDelete ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setConfirmingArchive(true)}>
                    <Archive className="size-3.5" />
                    Delete but keep the data
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setConfirmingDelete(true)}>
                    Delete permanently
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">
                    This permanently deletes <span className="font-medium text-foreground">{project.domain}</span> and every
                    real record under it (rank tracking, reports, audits, AI visibility data) - it cannot be undone. Type the
                    domain to confirm.
                  </p>
                  <Label htmlFor="confirm-delete-domain" className="sr-only">
                    Confirm domain
                  </Label>
                  <Input
                    id="confirm-delete-domain"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={project.domain}
                    autoComplete="off"
                  />
                  {deleteError ? <p className="text-xs text-destructive">{deleteError}</p> : null}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={confirmText !== project.domain || isDeleting}
                      onClick={handleDelete}
                      className="gap-1.5"
                    >
                      {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                      Permanently delete
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
