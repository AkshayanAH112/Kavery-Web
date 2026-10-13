@AGENTS.md

# Kavery Sports Club

One Next.js app on Cloudflare Workers serving three surfaces: the public site (`app/(site)/[locale]`),
the staff console (`app/(console)`), and the API (`app/api`). It is also the mobile app — an installable
PWA with Web Push. There is no native app.

Read `docs/PLAN.md` for the analysis and roadmap, and `design-system/kavery/MASTER.md` before any UI work.
This project is a port of KCSC (`D:\KCSC\Web app`); its `CLAUDE.md` documents the domain rules
(attendance, leaves, marks, cricket scoring) that later phases must carry over unchanged.

## Commands

```bash
npm run dev           # next dev, with local D1/R2 bindings
npm run typecheck     # tsc --noEmit
npm run lint
npm run preview       # build and run in the real Workers runtime (workerd)
npm run db:generate   # after editing db/schema.ts: write a new SQL migration
npm run db:migrate    # apply migrations to local D1   (db:migrate:remote for production)
npm run db:seed       # create the first administrator from .dev.vars
npm run db:demo       # local only: clearly-labelled demo rows so the dashboard has data (db:demo:clear removes them)
npm run db:demo:cricket  # local only, needs `npm run dev` running: plays demo matches through the real scoring API (…:clear removes them)
npm run db:demo:content  # local only, needs `npm run dev` running: demo posts and an album, uploaded to local R2 (…:clear removes them)
# Demo students open on the parent page: KEDA/80/1001–1012 with phone 0770000000, or card code KEDA-5-DE000001–12.
npm run db:demo:members  # local only, needs `npm run dev` running: demo applications, members and a renewal (…:clear removes them)
```

**`next build` passing is not enough.** A build can succeed and still fail on every request in the
Workers runtime. Before calling a change done, run `npm run preview` and load a page.

**If the dev server says it "can't resolve" a package you have just installed** (it happened with
`@tailwindcss/typography`, referenced from CSS), restarting is not enough: Turbopack keeps the failed
lookup in `.next/`. Stop the server, delete `.next/`, start it again.

**Do not add `loading.tsx` files.** They make every page under them stream, so a missing page
answers 200 instead of 404 and a page-level redirect (a wrong role in the console, the old `/results`
address) stops being a real redirect. The loading bar and waiting screen between pages are done in
the browser by `components/RouteProgress.tsx`, mounted in both root layouts.

**Stop `npm run dev` before `npm run preview` / `npm run deploy`.** If the dev server cannot be
stopped, copy the source to another folder (`git ls-files -co --exclude-standard`), run `npm ci`
there and deploy from the copy — the build only needs the source and `wrangler.jsonc`.

**The live Worker** is `kavery-sports-club` (D1 `kavery-db`, R2 bucket `kaverysc`). In `wrangler.jsonc`,
`preview_database_id` and `preview_bucket_name` are what local development uses — leave them, or
`npm run dev` and every `--local` command start pointing at a new, empty local database. Secrets live on
the Worker (`wrangler secret put`), never in the repository. The dev server holds a lock on
`.open-next/`, so the build fails with `EPERM`. And never stop a stray `workerd.exe` by name to "clean
up": the dev server's D1/R2 bindings run in one, and killing it leaves the server up but every
database page returning 500 until it is restarted.

## Things that are not obvious

- **Next.js is pinned to 16.3.8.** 16.4.0 breaks at runtime under the Cloudflare adapter. Don't bump it
  without a `preview` check.
- **No `proxy.ts` / `middleware.ts`.** The adapter doesn't run Next's Node-runtime proxy. Locale comes from
  the `[locale]` segment (`setRequestLocale` in the layout and every page); `/` redirects from
  `app/route.ts`; console pages protect themselves with `requireSession()`.
- **A route is unprotected until it calls `authorize("<permission>")`** (`lib/auth/guard.ts`). Roles and
  permissions are defined only in `lib/auth/roles.ts`.
- **Read secrets with `getSecret()`, not `process.env`** — under `next dev`, `.dev.vars` values exist only
  on the Worker bindings.
- **No Node-only libraries**: no `sharp`, `bcrypt`, `nodemailer`, `mongoose`, `fs`. Use Web Crypto, D1, R2.
- **Dates**: the Worker runs in UTC, Sri Lanka is UTC+5:30. Use `lib/dates.ts` for any "today" query.
- **The console is English-only and never gets a locale prefix.** The public site is `/en` and `/ta`;
  every UI string goes in both `messages/*.json`, and layouts are checked in Tamil too.
- **Client components get strings as props**, so the message catalogue is not shipped to the browser.
  The one exception is `/[locale]/live/*`: those pages poll and translate in the browser, so their
  layout provides a `NextIntlClientProvider` carrying only the `Live` namespace.
- **KEDA classes are free.** No fee, invoice or payment field on anything in the tuition domain.
  Club membership (`members`) is the only place money appears.
- **`lib/console-nav.ts` lists every console module** (grouped as in the sidebar) and whether it is
  built (`ready`). Flip it when a module's pages land; unbuilt ones show as "Soon" and are not links.
- **Token names follow shadcn** (`bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`,
  `text-destructive`…), aliased onto Kavery's semantic tokens in `app/globals.css`, so shadcn-style
  components and KCSC's admin screens drop in. One deliberate exception: **`bg-accent` is the crest
  yellow here**, not shadcn's quiet hover surface — use `bg-muted` for that. `dark:` follows the
  console's theme toggle (`data-theme` on `<html>`), not the OS.
- **Cricket** (`lib/cricket/`, `components/cricket/`): `engine.ts`, `scoring.ts` and `view.ts` are
  KCSC's pure modules, unchanged — they work on Mongo-shaped documents (`_id`, ISO dates, players
  embedded in a team). `lib/cricket/server.ts` is the only place D1 rows become those documents. A
  match stores deliveries and nothing derived; **only `POST /api/cricket/matches/[id]/score` writes
  `innings`**, conditional on `rev`. KCSC's `CLAUDE.md` lists the scoring rules that are easy to break.
- **KEDA classes** (`lib/keda/`, `components/keda/`, `/api/{batches,students,classes,attendance,notifications}`):
  the screens are KCSC's, so the API answers in Mongo-shaped JSON built by `lib/keda/server.ts`.
  **Every attendance row is written by `recordAttendance()` in `lib/keda/attendance-recorder.ts`** —
  never from a route directly, or the leave counters drift. Three states, not two: no row is "not
  marked", `present: false` is a counted leave. Index numbers are `KEDA/<yy>/<1000+n>` from an atomic
  counter per exam year; `qrCode` is issued once and never changes. An attendance marker gets the
  `brief` student shape (no guardian phone or address). `/api/notifications` is the *leave alerts*
  API (KCSC's name); the push composer is `/api/push`.
- **Pages load KEDA screens from `components/keda/screens.tsx`, never from the screen file.** That
  file wraps each one in `next/dynamic` with `ssr: false`. Importing a screen directly pulls `xlsx`,
  `recharts` and `html5-qrcode` into the Worker bundle (it went from 1.9 MB to 2.4 MB gzipped, against
  a 3 MB limit on the free plan). Check the size with `npx wrangler deploy --dry-run` after adding a
  dependency.
- **Marks**: an absent paper is stored as `marks: 0, isAbsent: true` — every average and rank must skip
  it; "no mark entered" (no row) is a third state. The absence suggestion on an exam roster is a hint
  from that day's register and writes nothing. `Exam.isPublished` (default false) is the gate for
  anything public.
- **Student import** (`/console/students/import`): the sheet is read in the browser, converted from
  the Bamini font encoding by `lib/keda/bamini.ts`, previewed and edited, and only then posted to
  `/api/students/import`. Imported students have `guardianName`/`guardianPhone` = `""` (the columns
  are NOT NULL); `studentDoc` reports that as missing. The club's own sheet must never be copied
  into the repo — test with synthetic data.
- **Yearly promotion** (`lib/keda/promotion.ts`, `POST /api/cron/promote-students`): moves grades
  highest first and stamps each batch per year in `counters`. Both guards fix real faults in the
  KCSC job it came from (a Grade 3 student promoted twice in one run; a second run promoting
  everyone again). The Cloudflare Cron Trigger that calls it is not wired yet.
- **Reports print, they don't generate PDFs.** Student names are Tamil; client-side PDF libraries
  neither embed a Tamil font nor shape the script. The console shell hides itself in `@media print`.
- **`.field` / `.field-label` / `.tabular`** in `app/globals.css` are the form classes the ported
  screens use on raw inputs; new console forms can use them too.
- **Public match pages** (`components/live/`, `app/(site)/[locale]/live/`) are KCSC's, restyled onto
  Kavery tokens. They read `/api/public/cricket/*`, which go through `cachedJson()` — responses are
  shared at the edge, so nothing per-viewer may ever be added to them. `lib/cricket/meta.ts` supplies
  page titles under the same visibility rules, so a hidden match never leaks through a `<title>`.
- **Uploads** go to R2 through `/api/upload` and are served by `/media/...`; `lib/media.ts` says which
  folders exist, who may write to them and which are public. In the browser, upload with
  `uploadImage()` from `lib/upload-client.ts`: it shrinks the photo to 1600px first, because the
  Worker cannot resize and what is stored is what every visitor downloads.
- **News and gallery** (`lib/content/`, `components/content/`, `/api/posts`, `/api/gallery`):
  - A post body is rebuilt through the allow-list in `lib/content/sanitize.ts` **on save**; the public
    page injects it as HTML, so never store or render a body that skipped that function.
  - An image reference from a client is only accepted through `ownMedia()` — the URL must be our own
    `/media/…` path and the key must sit in that content type's folder. That is what stops a post
    hot-linking another site and stops "delete this image" being aimed at any object in the bucket.
  - Each gallery photo is its own row. A published post keeps its slug and `publishedAt` when edited.
  - The public pages (`app/(site)/[locale]/news|gallery`) read the database directly through
    `lib/content/public.ts`, which only ever returns published posts and non-empty albums.
- **The parent page** (`/[locale]/parents`, `lib/keda/parent.ts`, `/api/public/parents/*`):
  - A parent gets in with the student card (its QR code is the student's scan id) **or** with the
    index number **and** a phone number the student was registered with. The index number alone is
    never enough — index numbers run in sequence. There is no other public way to a student's marks;
    the old index-number-only `/results` lookup was removed and redirects here.
  - Sign-in sets `ksc_parent`, a signed httpOnly cookie naming up to six children. It is its own kind
    of token (audience `parent`, no user id) and can never pass as a staff session. Which children it
    opens is re-read from the database on every request.
  - What a parent sees is built field by field in `childView()` and `lib/keda/results.ts`: published
    exams only, an absent paper as absent (never 0), no guardian details, no internal ids.
  - A wrong card, number or phone all get the same "no match". Failed tries are braked per connection
    and per index number.
  - Announcements on that page are KEDA's published posts (`org = "keda"`). Publishing a post or an
    exam pushes to the matching topic (`pushInBackground()` in `lib/push.ts`); `{locale}` in a push
    link becomes the subscriber's language.
  - A student brought in by the spreadsheet import has no phone on file, so only the card opens them
    until staff add a guardian phone.
- **Student photos** are for the ID card and are private, like members' files (`lib/private-files.ts`):
  stored under `students/` in R2, added or replaced on the student's page
  (`POST /api/students/[id]/photo`), and read back only through `GET /api/students/[id]/photo` by
  staff who work with the classes. A photo address sent by a client is never stored, and the parent
  page never includes the photo.
- **Site details** (`lib/site-settings.ts`, `/api/site-settings`, console → Site details): contact
  lines, the About page's text in both languages, class times and office bearers. The About page
  (`/[locale]/about`) shows what was entered and falls back to the standard wording or leaves a line
  out — it must never state a fact about the club that nobody entered. Text is rendered as text.
- **Club membership** (`lib/membership/`, `components/members/`, `/api/members`, `/api/public/members`,
  public pages under `app/(site)/[locale]/membership`):
  - **Nothing about money is in code.** Whether there is a fee, the amounts, and the bank account are
    one `site_settings` row (`membership`), edited at Members → Fees and settings. Fees are off by
    default; while they are off the forms ask for no payment slip.
  - **The fee is resolved on the server** from those settings and the occupation chosen
    (`occupationFields()`). Never read a fee, status, member id or validity date from a request.
  - **Photos and payment slips are private.** They live under `members/` and `payments/` in R2, which
    `lib/media.ts` does not list — so `/media` will not serve them and `/api/upload` will not write
    them. The only way out is `/api/members/[id]/file/[kind]`, which needs `members.manage` and looks
    the key up from the member row; a client never names a storage key. Uploads are identified by
    their first bytes (`storePrivateFile()`), not by the type the browser claims.
  - **The public routes take a form by field name**, length-capped (`memberDetails()`); nothing is
    spread from the request. Refusals carry a `code` so the form can show them in Tamil.
  - A member id (`KSC-M-0001`) and the first year's validity are issued once, on first approval, and
    survive a reset to "waiting". A renewal waits in its own fields (`renewal_status`, `renewal`) and
    touches nothing until approved; approving adds a year to whatever validity is left.
  - `lib/rate-limit.ts` is the shared best-effort brake for public endpoints. For a limit on things
    that succeeded, ask `isFull()` first and count only after the work is done.
- `D:\KaverySportsClub` (the parent folder) holds a student spreadsheet and a photographed form with
  children's and guardians' details. They are outside this repo. Keep them out.
