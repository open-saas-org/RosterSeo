import { describe, expect, it } from "vitest";
import { assertPublicHost, SsrfBlockedError } from "./ssrf-guard";

describe("assertPublicHost (SSRF guard)", () => {
  it("blocks cloud-metadata and other link-local IPv4 addresses", async () => {
    await expect(assertPublicHost("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(SsrfBlockedError);
  });

  it("blocks loopback IPv4 addresses", async () => {
    await expect(assertPublicHost("http://127.0.0.1/")).rejects.toThrow(SsrfBlockedError);
    await expect(assertPublicHost("http://127.0.0.1:8080/admin")).rejects.toThrow(SsrfBlockedError);
  });

  it("blocks RFC1918 private IPv4 ranges", async () => {
    await expect(assertPublicHost("http://10.0.0.1/")).rejects.toThrow(SsrfBlockedError);
    await expect(assertPublicHost("http://172.16.5.1/")).rejects.toThrow(SsrfBlockedError);
    await expect(assertPublicHost("http://192.168.1.1/")).rejects.toThrow(SsrfBlockedError);
  });

  it("blocks the literal hostname localhost and its subdomains", async () => {
    await expect(assertPublicHost("http://localhost/")).rejects.toThrow(SsrfBlockedError);
    await expect(assertPublicHost("http://anything.localhost/")).rejects.toThrow(SsrfBlockedError);
  });

  it("blocks loopback and unique-local IPv6 addresses", async () => {
    await expect(assertPublicHost("http://[::1]/")).rejects.toThrow(SsrfBlockedError);
    await expect(assertPublicHost("http://[fd00::1]/")).rejects.toThrow(SsrfBlockedError);
  });

  it("blocks non-http(s) protocols", async () => {
    await expect(assertPublicHost("file:///etc/passwd")).rejects.toThrow(SsrfBlockedError);
    await expect(assertPublicHost("ftp://example.com/")).rejects.toThrow(SsrfBlockedError);
  });

  it("blocks a malformed URL instead of throwing an unhandled TypeError", async () => {
    await expect(assertPublicHost("not a url")).rejects.toThrow(SsrfBlockedError);
  });

  it("allows a public IPv4 literal straight through", async () => {
    await expect(assertPublicHost("http://8.8.8.8/")).resolves.toBeUndefined();
  });

  it("allows a public IPv6 literal straight through", async () => {
    await expect(assertPublicHost("http://[2001:4860:4860::8888]/")).resolves.toBeUndefined();
  });
});
