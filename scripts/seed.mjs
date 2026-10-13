// Creates the first administrator from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in
// .dev.vars. Safe to re-run: an existing account with that email is left alone.
//
//   npm run db:seed            local D1
//   npm run db:seed -- --remote  the deployed database
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { webcrypto as crypto } from "node:crypto";

const remote = process.argv.includes("--remote");
const vars = Object.fromEntries(
  readFileSync(".dev.vars", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const email = (vars.SEED_ADMIN_EMAIL || "").trim().toLowerCase();
const password = vars.SEED_ADMIN_PASSWORD || "";
if (!email || password.length < 10) {
  console.error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (10+ characters) in .dev.vars first.");
  process.exit(1);
}

// Must match lib/auth/password.ts.
const b64 = (bytes) => Buffer.from(bytes).toString("base64url");
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100_000 }, key, 256);
const hash = ["pbkdf2", 100_000, b64(salt), b64(new Uint8Array(bits))].join(":");

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const now = Date.now();
const sql = `INSERT OR IGNORE INTO users (id, email, name, password_hash, role, is_active, created_at, updated_at)
VALUES (${q(crypto.randomUUID())}, ${q(email)}, 'Club Administrator', ${q(hash)}, 'admin', 1, ${now}, ${now});`;

const dir = mkdtempSync(join(tmpdir(), "kavery-seed-"));
const file = join(dir, "seed.sql");
writeFileSync(file, sql);
try {
  execFileSync("npx", ["wrangler", "d1", "execute", "kavery-db", remote ? "--remote" : "--local", "--file", file, "--yes"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  console.log(`Administrator ready: ${email} (${remote ? "remote" : "local"} database).`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
