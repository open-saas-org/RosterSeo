import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TEST_KEY_HEX = "0".repeat(63) + "1"; // 32 bytes, arbitrary but fixed

describe("crypto (credential encryption at rest)", () => {
  const originalEnv = process.env.CREDENTIAL_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    else process.env.CREDENTIAL_ENCRYPTION_KEY = originalEnv;
  });

  describe("with no key configured (self-hosted default)", () => {
    beforeEach(() => {
      delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    });

    it("encryptSecret passes a value through unchanged", async () => {
      const { encryptSecret } = await import("./crypto");
      expect(encryptSecret("super-secret-token")).toBe("super-secret-token");
    });

    it("decryptSecret passes a non-prefixed value through unchanged", async () => {
      const { decryptSecret } = await import("./crypto");
      expect(decryptSecret("plain-old-token")).toBe("plain-old-token");
    });
  });

  describe("with a key configured", () => {
    beforeEach(() => {
      process.env.CREDENTIAL_ENCRYPTION_KEY = TEST_KEY_HEX;
    });

    it("round-trips a value through encrypt then decrypt", async () => {
      const { encryptSecret, decryptSecret } = await import("./crypto");
      const secret = "ya29.a0AfH6SMC_real_looking_oauth_token";
      const encrypted = encryptSecret(secret);
      expect(encrypted).not.toBe(secret);
      expect(encrypted.startsWith("enc:v1:")).toBe(true);
      expect(decryptSecret(encrypted)).toBe(secret);
    });

    it("produces a different ciphertext each time (random IV)", async () => {
      const { encryptSecret } = await import("./crypto");
      const a = encryptSecret("same-input");
      const b = encryptSecret("same-input");
      expect(a).not.toBe(b);
    });

    it("still passes through an existing plaintext value on read (backward compatibility)", async () => {
      const { decryptSecret } = await import("./crypto");
      expect(decryptSecret("a-row-written-before-encryption-was-enabled")).toBe(
        "a-row-written-before-encryption-was-enabled",
      );
    });

    it("throws rather than returning garbage if the ciphertext was tampered with", async () => {
      const { encryptSecret, decryptSecret } = await import("./crypto");
      const encrypted = encryptSecret("a-real-secret");
      const tampered = encrypted.slice(0, -4) + "AAAA";
      expect(() => decryptSecret(tampered)).toThrow();
    });

    it("rejects a key that isn't 32 bytes", async () => {
      process.env.CREDENTIAL_ENCRYPTION_KEY = "too-short";
      const { encryptSecret } = await import("./crypto");
      expect(() => encryptSecret("x")).toThrow(/32 bytes/);
    });

    it("isEncrypted distinguishes encrypted from plaintext values", async () => {
      const { encryptSecret, isEncrypted } = await import("./crypto");
      expect(isEncrypted(encryptSecret("x"))).toBe(true);
      expect(isEncrypted("plain-value")).toBe(false);
    });
  });

  it("encryptSecret and decryptSecret never choke on an empty string", async () => {
    const { encryptSecret, decryptSecret } = await import("./crypto");
    expect(encryptSecret("")).toBe("");
    expect(decryptSecret("")).toBe("");
  });

  describe("encryptRecord / decryptRecord (jsonb credential blobs)", () => {
    beforeEach(() => {
      process.env.CREDENTIAL_ENCRYPTION_KEY = TEST_KEY_HEX;
    });

    it("round-trips every value in a record while preserving its keys", async () => {
      const { encryptRecord, decryptRecord } = await import("./crypto");
      const creds = { apiKey: "key-123", apiSecret: "secret-456" };
      const encrypted = encryptRecord(creds);
      expect(Object.keys(encrypted)).toEqual(Object.keys(creds));
      expect(encrypted.apiKey).not.toBe(creds.apiKey);
      expect(decryptRecord(encrypted)).toEqual(creds);
    });
  });
});
