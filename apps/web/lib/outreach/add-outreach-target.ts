import { outreachTargets, withUserContext } from "@seo-tool/db";
import { findContactEmail } from "@seo-tool/crawler";
import { normalizeDomain, isValidDomain } from "@/components/competitors/domain-utils";

// Real shared logic behind POST /api/projects/:projectId/outreach -
// extracted so Clay's add_outreach_target tool
// (apps/web/lib/clay/tools/write.ts) runs the exact same real
// crawl-for-contact-email + insert the Outreach page's "Add target" form
// already does.
export async function addOutreachTarget(
  userId: string,
  projectId: string,
  opts: { domain: string; sourceUrlFrom?: string; contactEmail?: string },
) {
  const domain = normalizeDomain(opts.domain);
  if (!isValidDomain(domain)) throw new Error("Enter a valid domain, e.g. example.com");

  const sourceUrlFrom = opts.sourceUrlFrom?.trim() || null;
  const manualEmail = opts.contactEmail?.trim() || null;

  let contactEmail = manualEmail;
  let contactEmailSource: string | null = manualEmail ? "manual" : null;

  if (!contactEmail) {
    try {
      const found = await findContactEmail(domain);
      if (found) {
        contactEmail = found.email;
        contactEmailSource = found.sourceUrl;
      }
    } catch (err) {
      console.error(`[outreach] contact-email crawl failed for ${domain}`, err);
    }
  }

  const [target] = await withUserContext(userId, (tx) =>
    tx.insert(outreachTargets).values({ projectId, domain, sourceUrlFrom, contactEmail, contactEmailSource }).returning(),
  );

  return target;
}
