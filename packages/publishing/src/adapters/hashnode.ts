import type { BlogAdapter } from "../types";

// Hashnode's GraphQL API - Personal Access Token passed as the raw
// Authorization header (not "Bearer <token>", per Hashnode's own docs).
// siteIdentifier is the publicationId (from the publication's dashboard).
// Markdown-native, same as Dev.to.
async function hashnodeRequest<T>(pat: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch("https://gql.hashnode.com", {
    method: "POST",
    headers: { Authorization: pat, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Hashnode returned HTTP ${res.status}`);
  const data = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (data.errors?.length) throw new Error(data.errors[0]!.message);
  return data.data as T;
}

export const hashnodeAdapter: BlogAdapter = {
  platform: "hashnode",
  async verify(credentials, siteIdentifier) {
    await hashnodeRequest<{ publication: { id: string } | null }>(
      credentials.personalAccessToken!,
      "query($id: ObjectId!) { publication(id: $id) { id } }",
      { id: siteIdentifier },
    );
  },
  async publish(credentials, siteIdentifier, post) {
    const result = await hashnodeRequest<{ publishPost: { post: { id: string; url: string } } }>(
      credentials.personalAccessToken!,
      `mutation($input: PublishPostInput!) { publishPost(input: $input) { post { id url } } }`,
      { input: { title: post.title, contentMarkdown: post.markdown, publicationId: siteIdentifier, tags: post.tags.map((name) => ({ name, slug: name.toLowerCase().replace(/\s+/g, "-") })) } },
    );
    return { remoteId: result.publishPost.post.id, remoteUrl: result.publishPost.post.url };
  },
};
