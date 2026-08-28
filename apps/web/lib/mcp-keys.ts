import crypto from "node:crypto";

// Shared between the key-generation route and (indirectly, by convention -
// the MCP server has its own copy since it can't import from apps/web) the
// MCP server's auth resolver. High-entropy random token, SHA-256 hash at
// rest - this is a bearer secret, not a user-chosen password, so a fast
// hash is correct here (the threat model is "leaked hash is useless
// without the original 192 bits of randomness," not dictionary attacks).
const KEY_PREFIX = "seotool_";

export function generateMcpApiKey(): { key: string; hash: string; prefix: string } {
  const key = `${KEY_PREFIX}${crypto.randomBytes(24).toString("base64url")}`;
  const hash = hashMcpApiKey(key);
  const prefix = key.slice(0, KEY_PREFIX.length + 6);
  return { key, hash, prefix };
}

export function hashMcpApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}
