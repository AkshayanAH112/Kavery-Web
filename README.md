# Kavery Sports Club

Website, staff console and installable app for Kavery Sports Club, Periyaneelavanai, and its education
wing, the Kavery Education Development Association (KEDA).

Next.js 16 on Cloudflare Workers · D1 (database) · R2 (files) · Web Push · English and Tamil.

## Run it locally

```bash
npm install
cp .dev.vars.example .dev.vars   # then fill in the values (see the comments in the file)
npm run db:migrate               # create the local database
npm run db:seed                  # create the first administrator from .dev.vars
npm run dev                      # http://localhost:3000
```

Sign in at `/login` with the `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` you put in `.dev.vars`.

## Deploy to Cloudflare (first time)

```bash
npx wrangler login
npx wrangler d1 create kavery-db          # paste the database_id it prints into wrangler.jsonc
npx wrangler r2 bucket create kaverysc    # the bucket name in wrangler.jsonc
npx wrangler secret put AUTH_SECRET       # a random string, 32+ characters
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT     # mailto:someone@the-club
npm run db:migrate:remote
npm run db:seed -- --remote
npm run deploy
```

`npm run vapid` prints a fresh push key pair for the three `VAPID_*` values.

## Where things are

| | |
|---|---|
| `docs/PLAN.md` | Analysis of the KCSC project this is ported from, decisions, roadmap |
| `design-system/kavery/MASTER.md` | Colours, type, motion and component rules |
| `db/schema.ts` | The whole database |
| `lib/auth/roles.ts` | Roles and permissions |
| `CLAUDE.md` | Working notes for anyone (or any agent) changing the code |
