import { Badge } from "@/components/ui/badge";

// A single "how good/bad does this backlink look" read, combining the two
// real signals DataForSEO actually gives per row (spam_score, domain_from
// rank) into one glance - same success/warning/destructive token
// convention as KeywordDifficulty, not a bespoke color scheme.
export function BacklinkQualityBadge({ spamScore, domainFromRank }: { spamScore: number; domainFromRank: number }) {
  if (spamScore >= 30) return <Badge variant="destructive">High spam risk</Badge>;
  if (spamScore >= 10 || domainFromRank < 100) return <Badge variant="warning">Low authority</Badge>;
  return <Badge variant="success">Good</Badge>;
}
