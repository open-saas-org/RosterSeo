"use client";

import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { ProjectSwitcher, type SwitcherProject } from "@/components/project-switcher";
import { SidebarModeTabs } from "@/components/sidebar-mode-tabs";
import { ClaySidebarNav } from "@/components/clay/clay-sidebar-nav";
import { NavUser } from "@/components/nav-user";
import { navPillars, type NavPillar } from "@/lib/nav";

// Publish/Social have their own route prefixes; SEO is everything else -
// no shared prefix across its own hrefs (/, /site-audit, /page-analyzer,
// ...), so it's the fallback rather than a prefix match.
function getActivePillarId(pathname: string): NavPillar["id"] {
  if (pathname.startsWith("/publish")) return "publish";
  if (pathname.startsWith("/social")) return "social";
  return "seo";
}

// The three pillar brand colors (globals.css) - SEO green, Publish purple,
// Social sky blue - not just one flat active-state color for all three.
const PILLAR_ACTIVE_STYLES: Record<NavPillar["id"], string> = {
  seo: "bg-gradient-to-br from-seo to-seo/80 text-seo-foreground shadow-sm",
  publish: "bg-gradient-to-br from-publish to-publish/80 text-publish-foreground shadow-sm",
  social: "bg-gradient-to-br from-sky to-sky/80 text-sky-foreground shadow-sm",
};

export function AppSidebar({
  user,
  projects,
  archivedProjects,
  activeProjectId,
}: {
  user: { name: string; email: string };
  projects: SwitcherProject[];
  archivedProjects?: SwitcherProject[];
  activeProjectId: string;
}) {
  const pathname = usePathname();
  const isChat = pathname.startsWith("/clay");
  const activePillarId = getActivePillarId(pathname);
  const activePillar = navPillars.find((p) => p.id === activePillarId)!;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <ProjectSwitcher projects={projects} archivedProjects={archivedProjects} />
        <SidebarModeTabs />
      </SidebarHeader>
      <SidebarContent>
        {isChat ? (
          <Suspense fallback={null}>
            <ClaySidebarNav projectId={activeProjectId} />
          </Suspense>
        ) : (
          <>
            <div className="flex items-center gap-1 px-2 pt-1 pb-0.5 group-data-[collapsible=icon]:hidden">
              {navPillars.map((pillar) => {
                const isActive = pillar.id === activePillarId;

                return (
                  <Link
                    key={pillar.id}
                    href={pillar.groups[0]!.items[0]!.href}
                    className={cn(
                      "flex-1 rounded-md px-2 py-1 text-center text-xs font-medium transition-all duration-200",
                      isActive
                        ? PILLAR_ACTIVE_STYLES[pillar.id]
                        : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    {pillar.label}
                  </Link>
                );
              })}
            </div>
            {activePillar.groups.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={pathname === item.href}
                        tooltip={item.title}
                      >
                        {item.imageIcon ? (
                          <Image src={item.imageIcon} alt="" width={16} height={16} className="shrink-0" />
                        ) : item.icon ? (
                          <item.icon />
                        ) : null}
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                      {item.badge ? <SidebarMenuBadge>{item.badge}</SidebarMenuBadge> : null}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        <NavUser name={user.name} email={user.email} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
