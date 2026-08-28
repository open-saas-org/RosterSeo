import { marked } from "marked";

// The canonical post body is Markdown (see blog_posts.body's own schema
// comment for why); platforms whose editors/APIs expect HTML get it
// converted here rather than each adapter reimplementing this.
export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}
