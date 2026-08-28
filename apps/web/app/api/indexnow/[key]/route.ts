import { NextResponse } from "next/server";

// GET /api/indexnow/:key - the `keyLocation` IndexNow's crawlers fetch to
// verify a submission's key, per the protocol: this must return exactly the
// key itself as plain text (same contract as hosting a static `<key>.txt`
// file). Deliberately public (no auth, no DB lookup) - the key is a random,
// self-generated value with no confidential meaning on its own, so this
// route just echoes back whatever key segment it's given, matching what a
// static file at this path would contain. It doesn't need to confirm the
// key belongs to a real project: an unmatched key here is harmless (no
// data disclosed), and the real authorization already happened when our
// own backend POSTed the submission to IndexNow's endpoint in the first
// place - this route only ever gets hit by IndexNow's own crawlers
// verifying that submission, not by anyone probing for project data.

type RouteParams = { key: string };

export async function GET(_req: Request, ctx: { params: Promise<RouteParams> }) {
  const { key } = await ctx.params;
  return new NextResponse(key, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
