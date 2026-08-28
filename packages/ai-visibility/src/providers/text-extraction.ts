import type { Citation, TokenUsage } from "./types";

// Shared citation helpers used by multiple providers' run() implementations
// (write-time extraction only - see Phase A's plan note: we don't keep raw
// payloads, so there's no second read-time re-extraction layer).

// Parses a URL, strips a leading "www." from the hostname for `domain`, and
// stamps the running index. Every provider's citation extraction should
// route through this so the shape is identical regardless of source.
export function parseCitationUrl(url: string, title: string | undefined, citationIndex: number): Citation | null {
  if (typeof url !== "string" || !url.startsWith("http")) return null;
  try {
    const parsed = new URL(url);
    return {
      url,
      title: title || undefined,
      domain: parsed.hostname.replace(/^www\./, ""),
      citationIndex,
    };
  } catch {
    return null;
  }
}

// OpenAI's chat-completions `usage` shape (prompt_tokens/completion_tokens)
// is shared verbatim by every OpenAI-compatible endpoint this project calls
// (OpenAI itself, Perplexity, and OpenRouter's pass-through) - one real
// extraction instead of three copies. Returns undefined rather than a
// zeroed usage object when the field is missing, so the spend-tracking
// wrapper in providers/index.ts can tell "no usage reported" apart from "a
// real, legitimately empty response."
export function extractOpenAiStyleUsage(data: any): TokenUsage | undefined {
  const usage = data?.usage;
  if (typeof usage?.prompt_tokens !== "number" || typeof usage?.completion_tokens !== "number") return undefined;
  return { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens };
}

// De-dupes a raw list of {url, title?} candidates into Citation[] via
// parseCitationUrl, preserving first-seen order and skipping non-http/invalid
// URLs. Used by every provider that extracts citations from an array field.
export function dedupeCitations(items: Array<{ url: unknown; title?: unknown }>): Citation[] {
  const citations: Citation[] = [];
  const seen = new Set<string>();
  let idx = 0;
  for (const item of items) {
    const url = typeof item.url === "string" ? item.url : undefined;
    if (!url || seen.has(url)) continue;
    const citation = parseCitationUrl(url, typeof item.title === "string" ? item.title : undefined, idx);
    if (!citation) continue;
    seen.add(url);
    citations.push(citation);
    idx++;
  }
  return citations;
}

// Recursive depth-first walker for BrightData's Google AI Overview payload,
// which nests paragraph/list blocks arbitrarily.
// Collects every text-bearing leaf up to a depth cap so a deeply nested
// overview still extracts fully without risking infinite recursion on
// malformed data.
export function collectAioSnippets(node: unknown, depth = 0, out: string[] = []): string[] {
  if (depth > 8 || node == null) return out;
  if (typeof node === "string") {
    if (node.trim()) out.push(node.trim());
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectAioSnippets(item, depth + 1, out);
    return out;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    for (const key of ["text", "snippet", "title"]) {
      if (typeof obj[key] === "string" && obj[key].trim()) out.push((obj[key] as string).trim());
    }
    for (const key of ["paragraphs", "list", "items", "children", "content", "sections"]) {
      if (obj[key] !== undefined) collectAioSnippets(obj[key], depth + 1, out);
    }
    return out;
  }
  return out;
}

// BrightData's AI Overview UI appends this suffix to citation titles; strip
// it so it doesn't leak into our stored title field.
export function stripAioTitleNoise(title: string | undefined): string | undefined {
  return title?.replace(/\s*Opens in new tab\.?\s*$/i, "").trim() || undefined;
}
