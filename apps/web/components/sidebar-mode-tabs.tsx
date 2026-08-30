"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sprout, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// Switches the main sidebar between its two modes: Grow (the SEO/Publish/
// Social pillar switcher + nav groups from lib/nav.ts - see the segmented
// control app-sidebar.tsx renders in this mode) and Chat (Cappy's own
// thread list, rendered by CappySidebarNav) - one sidebar, not two
// side-by-side ones. Hidden when the sidebar is icon-collapsed, same as
// the rest of the header content.
export function SidebarModeTabs() {
  const pathname = usePathname();
  const isChat = pathname.startsWith("/cappy");

  return (
    <div className="flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground group-data-[collapsible=icon]:hidden">
      <Link
        href="/"
        className={cn(
          "inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          !isChat ? "bg-background text-foreground shadow-sm" : "",
        )}
      >
        <Sprout className="size-4" />
        Grow
      </Link>
      <Link
        href="/cappy"
        className={cn(
          "inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          isChat ? "bg-background text-foreground shadow-sm" : "",
        )}
      >
        <MessageCircle className="size-4" />
        Chat
      </Link>
    </div>
  );
}
