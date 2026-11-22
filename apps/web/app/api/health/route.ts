import { NextResponse } from "next/server";

// GET /api/health - plain liveness probe for Docker HEALTHCHECK, Railway's
// healthcheckPath, and any other platform/load-balancer that needs a cheap
// "is the process up and serving HTTP" signal. Deliberately no DB query:
// a liveness check that depends on a downstream service (Postgres) turns a
// transient DB blip into a cascading container restart, which is the
// opposite of what a liveness probe is for. No auth - this must be
// reachable before a session exists.
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
