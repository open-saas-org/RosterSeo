import { Skeleton } from "@/components/ui/skeleton";
import { StatGridSkeleton, ListSkeleton } from "@/components/ui/loading-skeletons";

// Automatic Next.js loading UI for every route under (dashboard) - wraps
// {children} in the group layout in a Suspense boundary with this as the
// fallback, so a page's async data fetches (several of these pages await 3-5
// external calls before rendering anything) show a real skeleton instead of
// a blank content area while the sidebar/header chrome stays put. Generic on
// purpose - shared across every dashboard route, not tailored to any one
// page's exact layout.
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>
      <StatGridSkeleton items={4} />
      <ListSkeleton rows={6} />
    </div>
  );
}
