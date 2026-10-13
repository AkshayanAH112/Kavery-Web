import { defineConfig } from "drizzle-kit";

// Only used to generate SQL migrations from db/schema.ts (`npm run db:generate`).
// Applying them is Wrangler's job: `npm run db:migrate` (local) / `db:migrate:remote`.
export default defineConfig({
  dialect: "sqlite",
  schema: "./db/schema.ts",
  out: "./drizzle",
});
