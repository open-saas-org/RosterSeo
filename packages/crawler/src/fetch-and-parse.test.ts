import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAndParse } from "./fetch-and-parse";

// A literal public IPv4 address as the test "URL" - assertPublicHost's
// net.isIP() branch returns immediately for a literal IP, so these tests
// never touch real DNS or the network (global fetch is mocked below).
const TEST_URL = "http://93.184.216.34/";

function htmlResponse(html: string): Response {
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

describe("fetchAndParse", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("excludes <script>/<style>/<noscript> content from bodyText and wordCount", async () => {
    const html = `<!DOCTYPE html><html><head><title>Real Page</title>
      <style>.hero { color: red; font-weight: bold; }</style>
      </head><body>
      <script>var reallyLongFakeWordListThatWouldDominateWordCount = ${JSON.stringify(Array.from({ length: 200 }, (_, i) => `token${i}`))};</script>
      <h1>Real visible heading</h1>
      <p>Just three real words here.</p>
      <noscript>Enable JavaScript to use this site please.</noscript>
      </body></html>`;

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse(html)));

    const result = await fetchAndParse(TEST_URL, { captureContent: true });

    expect(result.bodyText).not.toContain("token0");
    expect(result.bodyText).not.toContain("reallyLongFakeWordListThatWouldDominateWordCount");
    expect(result.bodyText).not.toContain("color: red");
    expect(result.bodyText).not.toContain("Enable JavaScript");
    expect(result.bodyText).toContain("Real visible heading");
    expect(result.bodyText).toContain("Just three real words here.");
    // Real visible word count only (heading + paragraph) - nowhere near
    // the 200 fake script-only tokens that used to leak in.
    expect(result.wordCount).toBeLessThan(15);
  });

  it("still extracts JSON-LD even though <script> tags are removed for body text", async () => {
    const html = `<!DOCTYPE html><html><head><title>Product Page</title>
      <script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "Widget", offers: { price: "9.99", priceCurrency: "USD" } })}</script>
      </head><body><h1>Widget</h1><p>A fine widget.</p></body></html>`;

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(htmlResponse(html)));

    const result = await fetchAndParse(TEST_URL, { captureContent: true });

    expect(result.jsonLdTypes).toContain("Product");
    expect(result.jsonLdProduct?.name).toBe("Widget");
    expect(result.bodyText).not.toContain("priceCurrency");
  });
});
