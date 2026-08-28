// IndexNow: a free, keyless-registration protocol backed by Bing, Yandex,
// Seznam, and Naver (indexnow.org). No account, no API key - you generate a
// random key yourself, host a file that returns it at `keyLocation`, and
// POST { host, key, keyLocation, urlList } to the shared endpoint below,
// which fans the notification out to every participating engine.

export function generateIndexNowKey(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

export async function submitUrlsToIndexNow(host: string, key: string, keyLocation: string, urls: string[]): Promise<void> {
  if (urls.length === 0) return;

  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key, keyLocation, urlList: urls }),
    signal: AbortSignal.timeout(20_000),
  });

  // IndexNow's real success codes are 200 (processed) and 202 (accepted,
  // queued) - anything else means the submission was rejected.
  if (res.status !== 200 && res.status !== 202) {
    throw new Error(`IndexNow submission returned HTTP ${res.status}`);
  }
}
