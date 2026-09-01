import { and, eq, gt } from "drizzle-orm";
import { blogPosts, socialPosts, withUserContext } from "@rosterseo/db";
import type { CalendarEvent } from "@/components/posts/post-calendar";

// Cross-pillar "what's coming up" for the Up Next widget - Publish and
// Social are separate tables/pillars everywhere else in the app, but a
// self-hoster planning their week wants one answer to "what's scheduled
// next," not two separate lists to mentally merge. Only real `scheduled`
// rows with a future `scheduledFor` count as "upcoming" - a post
// mid-flight (`publishing`) or already resolved (`published`/`failed`)
// isn't something to plan around.
export async function getUpcomingPosts(userId: string, projectId: string, limit = 8): Promise<CalendarEvent[]> {
  const now = new Date();

  const [social, blog] = await Promise.all([
    withUserContext(userId, (tx) =>
      tx
        .select({ id: socialPosts.id, body: socialPosts.body, scheduledFor: socialPosts.scheduledFor })
        .from(socialPosts)
        .where(and(eq(socialPosts.projectId, projectId), eq(socialPosts.status, "scheduled"), gt(socialPosts.scheduledFor, now))),
    ),
    withUserContext(userId, (tx) =>
      tx
        .select({ id: blogPosts.id, title: blogPosts.title, scheduledFor: blogPosts.scheduledFor })
        .from(blogPosts)
        .where(and(eq(blogPosts.projectId, projectId), eq(blogPosts.status, "scheduled"), gt(blogPosts.scheduledFor, now))),
    ),
  ]);

  const events: CalendarEvent[] = [
    ...social.map((p) => ({ id: p.id, href: `/social/posts/${p.id}`, title: p.body, date: p.scheduledFor!, status: "scheduled" as const })),
    ...blog.map((p) => ({ id: p.id, href: `/publish/posts/${p.id}`, title: p.title, date: p.scheduledFor!, status: "scheduled" as const })),
  ];

  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  return events.slice(0, limit);
}
