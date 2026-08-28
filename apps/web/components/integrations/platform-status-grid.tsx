import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

// A read-only status summary, not a connect form - the real connect flow
// (OAuth, manual credentials, instructions) lives on the owning feature's
// own connections page (Publish/Social), which this whole grid links out
// to. This page's job is just "what's connected, at a glance."
export function PlatformStatusGrid({
  platforms,
  connectedIds,
  manageHref,
}: {
  platforms: { id: string; name: string; logo: string }[];
  connectedIds: Set<string>;
  manageHref: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {platforms.map((p) => {
        const connected = connectedIds.has(p.id);
        return (
          <Link
            key={p.id}
            href={manageHref}
            className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
              <Image src={p.logo} alt="" width={18} height={18} className="size-[18px] object-contain" />
            </div>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
            <Badge variant={connected ? "success" : "outline"} className="shrink-0 text-xs">
              {connected ? "Connected" : "Not connected"}
            </Badge>
          </Link>
        );
      })}
    </div>
  );
}
