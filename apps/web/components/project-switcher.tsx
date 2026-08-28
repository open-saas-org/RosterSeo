"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Globe, Plus, Settings, ArchiveRestore, Loader2 } from "lucide-react";
import { ACTIVE_PROJECT_COOKIE } from "@/lib/project-cookie";
import { ProjectSettingsDialog } from "@/components/project-settings-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export type SwitcherProject = { id: string; name: string; domain: string };

function readActiveProjectCookie(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${ACTIVE_PROJECT_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : undefined;
}

export function ProjectSwitcher({
  projects,
  archivedProjects = [],
}: {
  projects: SwitcherProject[];
  archivedProjects?: SwitcherProject[];
}) {
  const router = useRouter();
  const [activeId, setActiveId] = useState(() => readActiveProjectCookie() ?? projects[0]?.id);
  const active = projects.find((p) => p.id === activeId) ?? projects[0];
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // A server refresh (after archive/delete) can hand this same mounted
  // component a `projects` list that no longer contains `activeId` (e.g.
  // the project just archived was the active one) - keep the state in sync
  // with reality instead of leaning on the `?? projects[0]` fallback alone,
  // so `activeId` never quietly points at a project that's gone.
  useEffect(() => {
    if (active && active.id !== activeId) setActiveId(active.id);
  }, [active, activeId]);

  function selectProject(id: string) {
    setActiveId(id);
    document.cookie = `${ACTIVE_PROJECT_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 365}`;
    router.refresh();
  }

  async function restoreProject(id: string) {
    setRestoringId(id);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivedAt: null }),
      });
      if (res.ok) {
        selectProject(id);
      }
    } finally {
      setRestoringId(null);
    }
  }

  if (!active) return null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground border border-border"
              />
            }
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Globe className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-medium">{active.name}</span>
              <span className="truncate text-xs text-muted-foreground">{active.domain}</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--anchor-width)"
            align="start"
            side="bottom"
            sideOffset={4}
          >
            {/* Base UI requires Menu.GroupLabel to be inside a Menu.Group. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">Projects</DropdownMenuLabel>
              {projects.map((project) => (
                <DropdownMenuItem key={project.id} onClick={() => selectProject(project.id)}>
                  <Globe className="size-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{project.name}</span>
                    <span className="text-xs text-muted-foreground">{project.domain}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
              <Settings className="size-4" />
              Project settings
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/onboarding?additional=1" />}>
              <Plus className="size-4" />
              Add project
            </DropdownMenuItem>
            {archivedProjects.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Archived - click to restore</DropdownMenuLabel>
                  {archivedProjects.map((project) => (
                    <DropdownMenuItem key={project.id} onClick={() => restoreProject(project.id)} disabled={restoringId === project.id}>
                      {restoringId === project.id ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : (
                        <ArchiveRestore className="size-4 text-muted-foreground" />
                      )}
                      <div className="flex flex-col">
                        <span>{project.name}</span>
                        <span className="text-xs text-muted-foreground">{project.domain}</span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
      <ProjectSettingsDialog projectId={active.id} open={settingsOpen} onOpenChange={setSettingsOpen} />
    </SidebarMenu>
  );
}
