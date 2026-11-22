// The one seam between the free, self-hosted product and hosted SaaS mode.
// Defaults to true (self-hosted) because that's the only mode that has
// ever actually run in production for this app - a hosted deploy has to
// explicitly opt out by setting SELF_HOSTED=false, rather than every
// existing self-host install silently flipping into "needs a Stripe key"
// mode the moment this code ships. See ROADMAP.md's Phase 2.
export function isSelfHosted(): boolean {
  return process.env.SELF_HOSTED !== "false";
}
