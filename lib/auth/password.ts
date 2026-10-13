/**
 * PBKDF2 through Web Crypto rather than bcrypt: it runs natively on Workers, so
 * a login costs a few milliseconds of CPU instead of blowing the request budget.
 * 100,000 is the highest iteration count the Workers runtime accepts.
 */
const ITERATIONS = 100_000;
const SEP = ":";

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** Stored as "pbkdf2:<iterations>:<salt>:<hash>", base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return ["pbkdf2", ITERATIONS, b64(salt), b64(hash)].join(SEP);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, expected] = stored.split(SEP);
  if (scheme !== "pbkdf2" || !iterations || !salt || !expected) return false;
  const actual = await derive(password, unb64(salt), Number(iterations));
  const want = unb64(expected);
  if (actual.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ want[i];
  return diff === 0;
}

/** Shared by the staff forms and the API so the rule cannot drift between them. */
export const MIN_PASSWORD_LENGTH = 10;
