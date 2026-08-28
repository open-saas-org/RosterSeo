import { Cpu, FileText, LayoutGrid, PartyPopper, ShieldAlert, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { ImpactBadge, type Impact } from "@/components/impact-badge";
import type { Finding, FindingCategory } from "@/components/page-analyzer/analysis";

const CATEGORY_ICONS: Record<FindingCategory, LucideIcon> = {
  Technical: Cpu,
  Content: FileText,
  Structure: LayoutGrid,
  Indexability: ShieldAlert,
};

export function FixItList({ findings }: { findings: Finding[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fix-it plan</CardTitle>
        <CardDescription>
          Prioritized by expected impact, generated from the crawl and competitor findings above.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {findings.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <PartyPopper className="size-6" />
            <p className="text-sm">No issues found by the rule-based checks. Nice work.</p>
          </div>
        ) : (
          <Accordion multiple defaultValue={[findings[0]!.id]}>
            {findings.map((finding) => {
              const CategoryIcon = CATEGORY_ICONS[finding.category];
              return (
                <AccordionItem key={finding.id} value={finding.id}>
                  <AccordionTrigger>
                    <span className="flex flex-1 flex-wrap items-center gap-2 pr-4">
                      <ImpactBadge impact={finding.impact as Impact} />
                      <span>{finding.title}</span>
                      <Badge variant="outline" className="ml-auto gap-1">
                        <CategoryIcon className="size-3" />
                        {finding.category}
                      </Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-muted-foreground">{finding.description}</p>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
