"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { navPillars, navTopBar } from "@/lib/nav";

// Under $0.01 still renders as "<$0.01" rather than "$0.00" - real spend
// rounds to zero at 2 decimals surprisingly often (a single DataForSEO
// call can cost a fraction of a cent), and "$0.00" reads as "nothing was
// spent," which would be false.
function formatSpend(usd: number): string {
  if (usd > 0 && usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

export function SiteHeader({ totalSpendUsd }: { totalSpendUsd: number }) {
  const pathname = usePathname();
  const allGroups = navPillars.flatMap((pillar) => pillar.groups);
  const allItems = [...allGroups.flatMap((group) => group.items), ...navTopBar];
  const current = allItems.find((item) => item.href === pathname);
  const currentGroup = allGroups.find((group) => group.items.some((item) => item.href === pathname));

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4 !self-center" />
      <div className="flex items-center gap-1.5 text-sm">
        {currentGroup ? (
          <>
            <span className="text-muted-foreground">{currentGroup.label}</span>
            <span className="text-muted-foreground/50">/</span>
          </>
        ) : null}
        <span className="font-medium">{current?.title ?? "Dashboard"}</span>
      </div>
      <div className="ml-auto flex items-center gap-1">
        {navTopBar.map((item) => {
          const linkClassName = cn(
            buttonVariants({ variant: "ghost", size: item.iconOnly ? "icon-sm" : "sm" }),
            pathname === item.href && "bg-muted text-foreground",
          );
          // Every navTopBar entry sets a real Lucide icon (none use imageIcon) -
          // fall back to a no-op component only to satisfy the shared NavItem
          // type, which allows either.
          const Icon = item.icon ?? (() => null);

          if (!item.iconOnly) {
            return (
              <Link key={item.href} href={item.href} className={linkClassName}>
                <Icon className="size-4" />
                {item.href === "/spend" ? formatSpend(totalSpendUsd) : item.title}
              </Link>
            );
          }

          return (
            <Tooltip key={item.href}>
              <TooltipTrigger
                render={
                  <Link href={item.href} className={linkClassName}>
                    <Icon className="size-4" />
                    <span className="sr-only">{item.title}</span>
                  </Link>
                }
              />
              <TooltipContent>{item.title}</TooltipContent>
            </Tooltip>
          );
        })}
        <Separator orientation="vertical" className="mx-1 h-4 !self-center" />
        <ThemeToggle />
      </div>
    </header>
  );
}

