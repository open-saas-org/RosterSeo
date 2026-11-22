import Stripe from "stripe";

// Lazy-constructed, never at module import time - this file gets imported
// transitively by code that also runs in SELF_HOSTED mode (where
// STRIPE_SECRET_KEY is never set), and `new Stripe("")` throws immediately
// in its constructor. Every real caller here is already behind an
// isSelfHosted() check (billing routes, webhook handler), so this only
// ever actually runs in hosted mode with a real key - but it must not
// crash the whole module graph for self-hosted installs that never call
// any of it.
let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set - billing routes are only reachable in hosted mode (SELF_HOSTED=false) with Stripe configured.");
    }
    // No explicit apiVersion - uses this SDK version's own pinned default
    // rather than a hand-typed literal that would drift out of sync with
    // whatever `stripe` version is actually installed.
    client = new Stripe(key);
  }
  return client;
}
