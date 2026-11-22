import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

// At-rest encryption for secret columns (OAuth access/refresh tokens,
// WordPress Application Passwords, SMTP passwords) stored in Postgres.
//
// Self-hosted (the only mode that exists when this file was added) stores
// these plaintext today - defensible when the operator is the only tenant
// and the only person who can ever read their own database. That stops
// being true the moment this app hosts OTHER people's Google/social
// credentials in multi-tenant SaaS mode: a DB leak then becomes a mass
// account-takeover across every connected customer, not just the
// operator's own accounts. This module exists to close that gap without
// breaking the self-hosted path that doesn't need it.
//
// Deliberately opt-in, not forced: if CREDENTIAL_ENCRYPTION_KEY is unset,
// encryptSecret() is a no-op passthrough (same "inert until configured"
// convention this codebase already uses for every other optional
// integration - see README.md). Once an operator sets the key (required
// for hosted SaaS deploys, optional for self-host), every NEW write gets
// encrypted automatically; existing plaintext rows keep working on read
// (decryptSecret() passes through anything that isn't in the "enc:v1:"
// format untouched) until they're next written, at which point they get
// encrypted too. No backfill migration needed, no flag day, no risk of
// locking an existing self-hosted install out of its own data by adding
// this.
const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:v1:";
const IV_LENGTH = 12; // 96-bit nonce, the GCM-recommended size.

let warnedNoKey = false;

function getKey(): Buffer | null {
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!raw) {
    if (!warnedNoKey) {
      warnedNoKey = true;
      console.warn(
        "[@rosterseo/db] CREDENTIAL_ENCRYPTION_KEY is not set - connected-account secrets " +
          "(OAuth tokens, app passwords, SMTP credentials) are being stored PLAINTEXT. " +
          "Fine for a single-operator self-hosted install; set this before taking real " +
          "hosted-SaaS signups. Generate one with: openssl rand -hex 32",
      );
    }
    return null;
  }
  // Accept hex (64 chars) or base64 (44 chars) - either decodes to 32
  // bytes for AES-256. Reject anything else loudly rather than silently
  // deriving a weaker key from a short/wrong-length value.
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes (a 64-char hex string, " +
        "or standard base64 of 32 bytes). Generate one with: openssl rand -hex 32",
    );
  }
  return buf;
}

// Encrypts a secret for storage. Passthrough (returns `plaintext`
// unchanged) when no key is configured - see getKey() above. Never throws
// on an empty string (some columns are legitimately `""` before a real
// connection exists); returns it unchanged either way.
export function encryptSecret(plaintext: string): string {
  if (plaintext === "") return plaintext;
  const key = getKey();
  if (!key) return plaintext;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

// Decrypts a value produced by encryptSecret(). Anything NOT carrying the
// "enc:v1:" prefix is assumed to be a pre-existing plaintext value (either
// no key was ever configured, or this row predates the key being set) and
// is returned as-is - this is the backward-compatibility seam that lets
// encryption be turned on for an existing database with zero downtime and
// no backfill step.
export function decryptSecret(value: string): string {
  if (!value.startsWith(PREFIX)) return value;
  const key = getKey();
  if (!key) {
    // A value that looks encrypted but no key is configured to read it -
    // this is a real misconfiguration (e.g. the key was rotated out from
    // under existing data), not a "feature not configured yet" state like
    // every other inert-until-configured integration in this app. Fail
    // loudly rather than returning ciphertext as if it were the real
    // secret.
    throw new Error(
      "Encountered an encrypted credential but CREDENTIAL_ENCRYPTION_KEY is not set - " +
        "cannot decrypt. Set the same key that was used to encrypt this data.",
    );
  }
  const raw = Buffer.from(value.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = raw.subarray(IV_LENGTH + 16);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// Constant-time check for whether a value is in encrypted form, useful in
// tests/migrations - exported mainly so callers never need to duplicate
// the "enc:v1:" prefix check themselves.
export function isEncrypted(value: string): boolean {
  if (value.length < PREFIX.length) return false;
  return timingSafeEqual(Buffer.from(value.slice(0, PREFIX.length)), Buffer.from(PREFIX));
}
