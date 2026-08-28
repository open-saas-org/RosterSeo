import type { BlogAdapter } from "../types";

// Shopify Admin GraphQL API - a per-store custom-app access token (not the
// public App Store OAuth flow, see the plan's platform tiering).
// siteIdentifier is the shop domain (my-store.myshopify.com); credentials
// also carries blogId (a Shopify store can have several blogs - the user
// picks which one when connecting).
interface ShopifyGraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function shopifyRequest<T>(shopDomain: string, accessToken: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://${shopDomain}/admin/api/2025-01/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify returned HTTP ${res.status}`);
  const data = (await res.json()) as ShopifyGraphQLResponse<T>;
  if (data.errors?.length) throw new Error(data.errors[0]!.message);
  return data.data as T;
}

export const shopifyAdapter: BlogAdapter = {
  platform: "shopify",
  async verify(credentials, siteIdentifier) {
    // If shopDomain exists in credentials, it's an OAuth connection where siteIdentifier is the blogId
    // If not, it's a manual connection where siteIdentifier is the shop domain
    const shopDomain = credentials.shopDomain || siteIdentifier;
    await shopifyRequest<{ shop: { name: string } }>(shopDomain, credentials.accessToken!, "{ shop { name } }", {});
  },
  async publish(credentials, siteIdentifier, post) {
    const shopDomain = credentials.shopDomain || siteIdentifier;
    const blogId = credentials.shopDomain ? siteIdentifier : credentials.blogId;
    
    const result = await shopifyRequest<{ articleCreate: { article: { id: string } | null; userErrors: { message: string }[] } }>(
      shopDomain,
      credentials.accessToken!,
      `mutation($article: ArticleCreateInput!) { articleCreate(article: $article) { article { id } userErrors { message } } }`,
      { article: { blogId: `gid://shopify/Blog/${blogId}`, title: post.title, body: post.html, tags: post.tags, isPublished: true } },
    );
    if (result.articleCreate.userErrors.length > 0) throw new Error(result.articleCreate.userErrors[0]!.message);
    const gid = result.articleCreate.article!.id;
    const id = gid.split("/").pop()!;
    return { remoteId: id, remoteUrl: `https://${shopDomain}/blogs/${blogId}/${id}` };
  },
};
