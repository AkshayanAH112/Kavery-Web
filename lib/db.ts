import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";

/** Cloudflare bindings (D1 as `DB`, R2 as `MEDIA`). Only valid inside a request. */
export function getEnv() {
  return getCloudflareContext().env;
}

/**
 * Secrets and vars. Read them through the Worker bindings, not `process.env`:
 * under `next dev` the values in .dev.vars only exist on the bindings.
 */
export type SecretName = "AUTH_SECRET" | "VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_KEY" | "VAPID_SUBJECT" | "APP_URL" | "CRON_SECRET";
export function getSecret(name: SecretName): string | undefined {
  return (getEnv() as unknown as Record<string, string | undefined>)[name] || process.env[name] || undefined;
}

export function getDb() {
  return drizzle(getEnv().DB, { schema });
}

export type Db = ReturnType<typeof getDb>;
export { schema };
