import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StatItem } from "./stat-item";

export type BusinessProfileSummary = {
  name: string;
  category: string | null;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
  totalPhotos: number | null;
  lastSyncedAt: string | null;
};

export function BusinessProfileCard({ profile }: { profile: BusinessProfileSummary | null }) {
  const card = (
    <Card interactive={Boolean(profile)} className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Image src="/google-business.svg" alt="Google Business Profile" width={20} height={20} className="rounded-sm" />
          <CardTitle className="text-base font-semibold">Google Business Profile</CardTitle>
        </div>
        {profile ? (
          <ArrowRight className="size-4 text-muted-foreground transition-colors group-hover/card:text-primary" />
        ) : null}
      </CardHeader>
      <CardContent>
        {!profile ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">Set up your business on Local SEO &gt; Profile to see rank and listing data here.</p>
            <Link href="/local-seo" className={cn(buttonVariants({ size: "sm" }))}>
              Set up business profile
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <StatItem
                label="Rating"
                value={
                  profile.rating !== null ? (
                    <span className="flex items-center gap-1">
                      {profile.rating.toFixed(1)}
                      <Star className="size-4 fill-current text-amber-400" />
                    </span>
                  ) : (
                    "—"
                  )
                }
              />
              <StatItem label="Reviews" value={profile.reviewCount ?? "—"} />
              <StatItem label="Category" value={profile.category ?? "—"} />
              <StatItem label="Photos" value={profile.totalPhotos ?? "—"} />
            </div>
            <p className="text-xs text-muted-foreground">
              {profile.name}
              {profile.address ? ` · ${profile.address}` : ""}
              {profile.lastSyncedAt ? ` · synced ${new Date(profile.lastSyncedAt).toLocaleDateString()}` : ""}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return profile ? (
    <Link href="/local-seo" className="block h-full">
      {card}
    </Link>
  ) : (
    card
  );
}
