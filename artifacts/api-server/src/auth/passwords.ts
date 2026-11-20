import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// scrypt is built into Node (no extra package) and is designed to be slow and memory-hungry,
// so stolen hashes are expensive to guess. N=2^15 takes roughly 50-100 ms per check.
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, length, PARAMS, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Returns "scrypt$<salt>$<hash>" (both base64url). The password itself is never stored. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

/** Constant-time comparison, so response timing reveals nothing about the hash. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltText, hashText] = stored.split("$");
  if (scheme !== "scrypt" || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64url");
  const actual = await derive(password, Buffer.from(saltText, "base64url"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Checked against when an email doesn't exist, so "no such account" takes as long as "wrong password". */
export const DUMMY_HASH = await hashPassword(randomBytes(16).toString("hex"));
