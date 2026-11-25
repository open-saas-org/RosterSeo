import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, AlertTriangle, Globe, Link2, Sparkles, MapPin } from "lucide-react";

export type EmptyStateGraphicVariant =
  | "rank-tracking"
  | "keyword-research"
  | "site-audit"
  | "page-analyzer"
  | "backlinks"
  | "outreach"
  | "competitors"
  | "brand-lookup"
  | "ai-visibility"
  | "citations"
  | "opportunities"
  | "insights"
  | "local-seo"
  | "publish"
  | "social";

function GraphicFrame({ children }: { children: ReactNode }) {
  return <div className="w-full max-w-[300px] select-none" aria-hidden="true">{children}</div>;
}

function SkeletonRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/40 px-3.5 py-2.5">
      {children}
    </div>
  );
}

function Bar({ className }: { className: string }) {
  return <div className={`h-2 rounded-full bg-muted-foreground/25 ${className}`} />;
}

export function EmptyStateGraphic({ variant }: { variant: EmptyStateGraphicVariant }) {
  switch (variant) {
    case "rank-tracking":
      return (
        <GraphicFrame>
          <div className="space-y-2">
            {[
              { width: "w-28", delta: 3, up: true, pos: 2 },
              { width: "w-36", delta: 1, up: true, pos: 5 },
              { width: "w-24", delta: 2, up: false, pos: 11 },
            ].map((row, idx) => (
              <SkeletonRow key={idx}>
                <Bar className={row.width} />
                <div className="flex items-center gap-2.5 text-xs font-medium tabular-nums">
                  <span className={`inline-flex items-center gap-0.5 ${row.up ? "text-emerald-500" : "text-rose-500"}`}>
                    {row.up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                    {row.delta}
                  </span>
                  <span className="inline-flex min-w-6 items-center justify-center rounded bg-muted px-1.5 py-0.5 text-foreground/80">
                    {row.pos}
                  </span>
                </div>
              </SkeletonRow>
            ))}
          </div>
        </GraphicFrame>
      );

    case "keyword-research":
      return (
        <GraphicFrame>
          <div className="space-y-2">
            {[
              { width: "w-32", vol: "12.4k", kd: 34, tone: "bg-emerald-500/15 text-emerald-500" },
              { width: "w-24", vol: "4.8k", kd: 21, tone: "bg-emerald-500/15 text-emerald-500" },
              { width: "w-28", vol: "1.9k", kd: 52, tone: "bg-amber-500/15 text-amber-500" },
            ].map((row, idx) => (
              <SkeletonRow key={idx}>
                <Bar className={row.width} />
                <div className="flex items-center gap-2 text-[11px] font-medium tabular-nums">
                  <span className="text-muted-foreground">{row.vol}</span>
                  <span className={`rounded px-1.5 py-0.5 ${row.tone}`}>{row.kd}</span>
                </div>
              </SkeletonRow>
            ))}
          </div>
        </GraphicFrame>
      );

    case "site-audit":
      return (
        <GraphicFrame>
          <div className="space-y-2">
            <SkeletonRow>
              <div className="flex items-center gap-2.5">
                <span className="inline-flex size-7 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-semibold text-emerald-500">
                  92
                </span>
                <Bar className="w-24" />
              </div>
              <CheckCircle2 className="size-4 text-emerald-500" />
            </SkeletonRow>
            <SkeletonRow>
              <Bar className="w-36" />
              <AlertTriangle className="size-4 text-amber-500" />
            </SkeletonRow>
            <SkeletonRow>
              <Bar className="w-28" />
              <CheckCircle2 className="size-4 text-emerald-500" />
            </SkeletonRow>
          </div>
        </GraphicFrame>
      );

    case "page-analyzer":
      return (
        <GraphicFrame>
          <div className="rounded-xl border border-border/60 bg-muted/40 p-3.5 text-left">
            <div className="flex items-center justify-between gap-2">
              <Bar className="w-32" />
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-500">
                94 / 100
              </span>
            </div>
            <div className="mt-3 space-y-2">
              <Bar className="w-full" />
              <Bar className="w-3/4" />
            </div>
            <div className="mt-3 flex gap-2">
              <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Title OK</span>
              <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">H1 OK</span>
              <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">CWV</span>
            </div>
          </div>
        </GraphicFrame>
      );

    case "backlinks":
      return (
        <GraphicFrame>
          <div className="space-y-2">
            {[
              { width: "w-32", dr: 78 },
              { width: "w-28", dr: 64 },
              { width: "w-36", dr: 51 },
            ].map((row, idx) => (
              <SkeletonRow key={idx}>
                <div className="flex items-center gap-2">
                  <Link2 className="size-3.5 text-muted-foreground/70" />
                  <Bar className={row.width} />
                </div>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-foreground/80">
                  DR {row.dr}
                </span>
              </SkeletonRow>
            ))}
          </div>
        </GraphicFrame>
      );

    case "outreach":
      return (
        <GraphicFrame>
          <div className="space-y-2">
            {[
              { width: "w-28", status: "Replied", tone: "bg-emerald-500/15 text-emerald-500" },
              { width: "w-32", status: "Sent", tone: "bg-primary/15 text-primary" },
              { width: "w-24", status: "Queued", tone: "bg-muted text-muted-foreground" },
            ].map((row, idx) => (
              <SkeletonRow key={idx}>
                <Bar className={row.width} />
                <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${row.tone}`}>{row.status}</span>
              </SkeletonRow>
            ))}
          </div>
        </GraphicFrame>
      );

    case "competitors":
      return (
        <GraphicFrame>
          <div className="space-y-2">
            {[
              { width: "w-36", label: "You", pct: "w-20 bg-primary/60" },
              { width: "w-28", label: "Comp A", pct: "w-14 bg-muted-foreground/30" },
              { width: "w-32", label: "Comp B", pct: "w-10 bg-muted-foreground/20" },
            ].map((row, idx) => (
              <SkeletonRow key={idx}>
                <span className="text-[11px] font-medium text-muted-foreground">{row.label}</span>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${row.pct}`} />
                  </div>
                </div>
              </SkeletonRow>
            ))}
          </div>
        </GraphicFrame>
      );

    case "brand-lookup":
      return (
        <GraphicFrame>
          <div className="rounded-xl border border-border/60 bg-muted/40 p-3.5">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
                <Globe className="size-4 text-muted-foreground" />
              </div>
              <div className="flex-1 space-y-1.5">
                <Bar className="w-28" />
                <Bar className="w-20" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground">
              <div className="rounded bg-muted px-2 py-1">Traffic</div>
              <div className="rounded bg-muted px-2 py-1">Keywords</div>
              <div className="rounded bg-muted px-2 py-1">Links</div>
            </div>
          </div>
        </GraphicFrame>
      );

    case "ai-visibility":
      return (
        <GraphicFrame>
          <div className="space-y-2">
            {[
              { width: "w-32", status: "Cited", tone: "bg-emerald-500/15 text-emerald-500" },
              { width: "w-28", status: "Mentioned", tone: "bg-primary/15 text-primary" },
              { width: "w-24", status: "Missed", tone: "bg-muted text-muted-foreground" },
            ].map((row, idx) => (
              <SkeletonRow key={idx}>
                <div className="flex items-center gap-2">
                  <Sparkles className="size-3.5 text-muted-foreground/70" />
                  <Bar className={row.width} />
                </div>
                <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${row.tone}`}>{row.status}</span>
              </SkeletonRow>
            ))}
          </div>
        </GraphicFrame>
      );

    case "citations":
      return (
        <GraphicFrame>
          <div className="space-y-2">
            {[
              { width: "w-36", count: 14 },
              { width: "w-28", count: 9 },
              { width: "w-32", count: 5 },
            ].map((row, idx) => (
              <SkeletonRow key={idx}>
                <Bar className={row.width} />
                <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-foreground/80">
                  {row.count}
                </span>
              </SkeletonRow>
            ))}
          </div>
        </GraphicFrame>
      );

    case "opportunities":
      return (
        <GraphicFrame>
          <div className="space-y-2">
            {[
              { width: "w-28", tag: "High", tone: "bg-emerald-500/15 text-emerald-500" },
              { width: "w-36", tag: "Medium", tone: "bg-amber-500/15 text-amber-500" },
              { width: "w-24", tag: "Quick win", tone: "bg-primary/15 text-primary" },
            ].map((row, idx) => (
              <SkeletonRow key={idx}>
                <Bar className={row.width} />
                <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${row.tone}`}>{row.tag}</span>
              </SkeletonRow>
            ))}
          </div>
        </GraphicFrame>
      );

    case "insights":
      return (
        <GraphicFrame>
          <div className="rounded-xl border border-border/60 bg-muted/40 p-3.5">
            <div className="flex items-center justify-between">
              <Bar className="w-24" />
              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-500">
                <ArrowUp className="size-3" />
                24%
              </span>
            </div>
            <div className="mt-4 flex h-12 items-end gap-2">
              {["h-4", "h-6", "h-5", "h-8", "h-9", "h-12"].map((height, idx) => (
                <div
                  key={idx}
                  className={`flex-1 rounded-t ${idx === 5 ? "bg-primary/70" : "bg-muted-foreground/25"} ${height}`}
                />
              ))}
            </div>
          </div>
        </GraphicFrame>
      );

    case "local-seo":
      return (
        <GraphicFrame>
          <div className="mx-auto grid w-44 grid-cols-3 gap-2 rounded-xl border border-border/60 bg-muted/40 p-3">
            {[
              { rank: 1, tone: "bg-emerald-500/20 text-emerald-500" },
              { rank: 2, tone: "bg-emerald-500/20 text-emerald-500" },
              { rank: 4, tone: "bg-amber-500/20 text-amber-500" },
              { rank: 1, tone: "bg-emerald-500/20 text-emerald-500" },
              { rank: 3, tone: "bg-emerald-500/20 text-emerald-500" },
              { rank: 6, tone: "bg-amber-500/20 text-amber-500" },
              { rank: 2, tone: "bg-emerald-500/20 text-emerald-500" },
              { rank: 5, tone: "bg-amber-500/20 text-amber-500" },
              { rank: 11, tone: "bg-rose-500/20 text-rose-500" },
            ].map((cell, idx) => (
              <div
                key={idx}
                className={`flex h-8 items-center justify-center rounded-md text-xs font-semibold tabular-nums ${cell.tone}`}
              >
                {idx === 4 ? <MapPin className="size-3.5" /> : cell.rank}
              </div>
            ))}
          </div>
        </GraphicFrame>
      );

    case "publish":
      return (
        <GraphicFrame>
          <div className="rounded-xl border border-border/60 bg-muted/40 p-3.5 text-left">
            <div className="flex items-center justify-between gap-2">
              <Bar className="w-32" />
              <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
                Published
              </span>
            </div>
            <div className="mt-3 space-y-2">
              <Bar className="w-full" />
              <Bar className="w-4/5" />
            </div>
          </div>
        </GraphicFrame>
      );

    case "social":
      return (
        <GraphicFrame>
          <div className="rounded-xl border border-border/60 bg-muted/40 p-3.5 text-left">
            <div className="flex items-center gap-2.5">
              <div className="size-7 rounded-full bg-muted-foreground/25" />
              <div className="flex-1 space-y-1.5">
                <Bar className="w-24" />
                <Bar className="w-16" />
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              <Bar className="w-full" />
              <Bar className="w-2/3" />
            </div>
          </div>
        </GraphicFrame>
      );
  }
}
