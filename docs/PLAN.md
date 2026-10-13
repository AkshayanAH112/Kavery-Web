# Kavery Sports Club — analysis and build plan

Written 2026-10-12, updated 2026-10-13. Phases 0, 1 and 2 are built; the rest is the roadmap.

## 1. What KCSC is (the project being ported)

`D:\KCSC` — Kallar Central Sports Club. Two git repos sharing one MongoDB and one API:

| Part | Stack | Size |
|---|---|---|
| `Web app/` | Next.js 16.2, Mongoose, Tailwind v4, next-intl (en/ta), deployed on Vercel | ~27,000 lines: API 4.5k, admin pages 7.8k, components 9.8k, lib 2.7k |
| `Mobileapp/` | React + Vite wrapped by Capacitor into an Android APK | separate repo, 7 APK releases |

Feature inventory, and what each costs to bring across:

| KCSC feature | What it does | Port effort |
|---|---|---|
| Auth, 2 roles (`admin`, `lms_manager`) | JWT in an httpOnly cookie + bearer for the APK | **Rebuilt** — 5 roles, permission map |
| Tuition LMS | Students, batches, class sessions, QR attendance, leave counters and 2/3-leave alerts, exams, marks, analysis, PDF/Excel export, yearly promotion cron | Large. Rules are subtle (see KCSC `CLAUDE.md`) and must be carried over exactly |
| Club membership | Public join form, annual fee by occupation, bank slip upload, admin review, renewals, emailed membership card | Medium |
| Cricket live scoring | Teams, tournaments, ball-by-ball scoring with optimistic concurrency, public live pages, points table, player stats | Medium — the engine (`lib/cricket/engine.ts`, `scoring.ts`, `view.ts`, 1,160 lines) is pure TypeScript and copies over unchanged |
| News and gallery | TipTap editor, albums, image pipeline | Medium |
| Public results lookup | Parent enters a registration number, gets published marks and rank | Small |
| Bilingual marketing site | Dark red landing, video-scrub hero | **Rebuilt** with a new design |

Lessons from KCSC that shaped this build:

- The APK was the expensive part: every fix meant a new release (v1.0 → v1.5). **Kavery has no native app.**
- Mongo-on-serverless needed connection limits and concurrency caps. **D1 has no connections to manage.**
- Vercel's image optimiser ran out of quota and broke every image at once. **Images are resized before
  upload and served as stored.**
- The marketing and admin CSS had colliding token names and needed two root layouts that could never
  share a stylesheet. **Kavery has one token system with theme scopes.**

## 2. What Kavery is

| | |
|---|---|
| **Kavery Sports Club (KSC)** | Periyaneelavanai. Founded 1981 (crest). Cricket. The parent organisation. |
| **Kavery Education Development Association (KEDA)** | The club's education wing, since 2023 (logo). Motto: நற்கல்வி – அறிவுசார் சமுதாயம். Free scholarship-exam classes. Contact on the paper form: kedaperi23@gmail.com |

Read from the files supplied in `D:\KaverySportsClub`:

- **Registration numbers are `KEDA/<yy>/<1000+n>`** — `KEDA/27/1000` in the 2026/27 sheet, `KEDA/26/10xx`
  on the 2026 form. `yy` is the exam year. The schema and counter are built for this format.
- **The current intake is Grade 4 & 5** — 90 index numbers issued (`KEDA/27/1000`–`1089`), 82 with a name
  filled in so far (the sheet's heading reads "தரம் : 4 & 5 (2026/27)").
  The brief said Grade 5; the site says "Grade 4 and 5" and it is one editable setting (`kedaGrades`).
- **The sheet is typed in Bamini**, a legacy Tamil font encoding, not Unicode. Importing it needs a
  Bamini→Unicode conversion step or the names arrive as Latin gibberish. Planned in Phase 2.
- **The paper form collects** student name, school, parent/guardian, address, phone, WhatsApp number and a
  note. `students` has a column for each (KCSC had no WhatsApp or notes field).

Those two files contain children's names and guardians' phone numbers. They sit outside the git repo
(`web/`) and must stay out of it.

## 3. Architecture decisions

| Decision | Choice | Reason |
|---|---|---|
| Hosting | **Cloudflare Workers** via `@opennextjs/cloudflare` | Asked for. One deploy serves site, API and console. |
| Database | **Cloudflare D1** (SQLite) + Drizzle ORM | Asked for ("if we can use that as database as well"). No connection pool, free tier is ample, migrations are plain SQL in `drizzle/`. |
| Files | **Cloudflare R2** (`MEDIA` binding) | Asked for. No egress fees. |
| Mobile | **Installable PWA + Web Push**, no native app | "Mobile installation using web notification". Installs from the browser, updates on deploy, one codebase. |
| Auth | Email + password, PBKDF2 (Web Crypto), JWT in an httpOnly cookie, role re-read from D1 every request | bcrypt is too slow for a Worker's CPU budget; reading the role per request means a demotion applies immediately. |
| Roles | `admin`, `education`, `attendance`, `scorer`, `editor` | See §4. |
| i18n | `next-intl`, `/en` and `/ta`, **no middleware** | The adapter does not run Next's Node-runtime `proxy.ts`. Locale comes from the `[locale]` segment; `/` redirects from a route handler. |
| Live scores | Polling with edge caching, not sockets | Same as KCSC: many spectators cost one D1 read per interval. |
| Image resizing | In the browser before upload | `sharp` does not run on Workers. |

Two things about the Cloudflare adapter that will bite again if forgotten:

- **Next.js is pinned to 16.3.8.** 16.4.0 builds without error and then fails on every request in the
  Workers runtime (`Unexpected loadManifest(preview-props.json)`). Do not bump Next without running
  `npm run preview` and loading a page.
- **Secrets are read with `getSecret()` (`lib/db.ts`), not `process.env`.** Under `next dev` the values
  in `.dev.vars` only exist on the Worker bindings.

Cost: the Worker is 1.86 MB gzipped (`wrangler deploy --dry-run`, after Phase 2) against a 3 MB limit on the free plan, so it runs free today. It will
grow as modules land; the paid plan (10 MB, US$5/month) is the fallback. Sending push to more than ~40
devices in one go also needs either the paid plan or a Queue.

## 4. Roles

Defined once in `lib/auth/roles.ts`. The API checks the permission on every request; hiding a menu item
is only convenience.

| Role | Can |
|---|---|
| **Administrator** | Everything: staff, members, public site, education, cricket, notifications |
| **Education manager** | KEDA students, batches, classes, attendance, exams, marks; news. No club membership |
| **Attendance marker** | Mark attendance for a class. Nothing else |
| **Scorer** | Teams, squads, matches and ball-by-ball scoring |
| **Editor** | News and gallery |

The last active administrator cannot be demoted, deactivated or deleted.

## 5. Phases

### Phase 0 — Foundation ✅ built

- Next.js app on Cloudflare (build + local Workers runtime verified), D1 schema for **every** domain
  (20 tables, one migration), R2 binding
- Design system (`design-system/kavery/MASTER.md`, tokens in `app/globals.css`)
- Public landing page, English and Tamil, with parallax hero, live stats and match centre reading from D1
- Auth, five roles, staff management
- Console in the style of the shadcnspace dashboard reference: grouped icon sidebar (collapsible, a
  drawer on phones), search, light/dark toggle, account menu, and a dashboard of real club data —
  attendance chart, membership breakdown, recent matches, leave alerts, push log, staff table — where
  each role only receives the blocks it is allowed to see
- PWA: manifest, icons, service worker, offline page, install prompt
- Web Push: topic subscriptions, VAPID sending from the Worker, console composer and send log

### Phase 1 — Cricket scoring

**Built ✅** — the scorer's side, end to end:

- KCSC's pure engine (`engine`, `scoring`, `view`, `team-input`) copied unchanged; a new D1 layer
  (`lib/cricket/server.ts`) hands it the document shapes it expects
- Seven staff routes for teams, tournaments, matches and scoring, with the `rev` conflict check
- Console screens: matches list and setup, teams and team sheets, tournaments, and the phone-width
  scoring pad with undo and live scorecard
- Crest upload to R2 (`/api/upload`, served from `/media`)
- Push to the `cricket` topic when a public match starts and when it finishes
- The landing page's ticker and match centre show the real scores and refresh themselves while a
  match is live

Checked by a scripted match played through the API (37 assertions: rules, two simultaneous writes,
locks after the first ball, permissions, publication) against both the dev server and the production
Worker in the local Workers runtime.

**Public match pages — built ✅**

- `/[locale]/live` (all live, upcoming and finished matches), a match page with live score, full
  scorecard, over-by-over and squads, a tournament page with fixtures, points table and player stats,
  and team and player pages — KCSC's components restyled onto Kavery tokens, English and Tamil
- Five public read routes, shared at Cloudflare's edge for a few seconds so many spectators cost one
  database read; hidden matches and unpublished tournaments answer 404 everywhere, page titles included
- The landing page's ticker and match cards link to the match page, and the scorer's "open public
  page" buttons work

Not yet run in the Workers runtime: the scripted 37-check match passes on the dev server with these
pages in place, but the production check (`npm run preview`) for this last step is still to do. In
particular the edge cache only exists in that runtime; it is written to fall back to a plain database
read if it fails.

### Phase 2 — KEDA classes

**Built ✅** — registers and attendance:

- Batches, students and class sessions, with KEDA's own index numbers (`KEDA/27/1000`…) issued from
  an atomic counter; a number already issued on paper can be entered as-is and the sequence carries
  on after it. The paper form's WhatsApp number and note have their own fields.
- A student card drawn for KEDA (name, index number, grade, batch, QR — no phone or address on it),
  printable and downloadable
- QR scanner, the class register with present/absent toggles, and "end class", which turns no-shows
  into counted leaves
- Leave counters and alerts exactly as KCSC has them: a parent warning at 2 leaves, an escalation at
  3 (with a push to staff), once per cycle, and again after a reactivation starts a new cycle
- Today's registers, the attendance report with Excel export, the student profile and leave history
- Two roles in practice: an **attendance marker** can scan, mark and close a register but receives
  no family contact details and cannot open students, reports or alerts; an **education manager**
  can do all of it

Checked by a scripted term played through the API (57 assertions: numbering, eligibility by
registration date, leave counting under repeated toggles, closing a register twice, alerts across
cycles, role boundaries, deletion guards) on the dev server.

**Built ✅** — exams and marks:

- Exams scheduled up front, mark entry per student or by uploading a filled Excel template, and the
  result sheet download. A mark above the paper's maximum, or an empty one, is refused rather than
  stored; a batch of marks saves all-or-nothing.
- Absence suggestions from that day's register (a hint only — it writes nothing), the publish gate
  (every exam starts unpublished), and the roster rule that keeps a marked student editable after
  they are deactivated
- Analysis: one ranking over any date range — papers sat first, then average, attendance as the
  tie-break — with "absent" and "no mark entered" shown apart. The report prints (or saves as PDF)
  through the browser so Tamil names render correctly.
- Student profile with averages by subject

Checked by a second scripted run (37 assertions) and, together with the cricket and attendance
suites, against the production Worker in the local Workers runtime: all three pass there.

**Built ✅** — import and promotion:

- Importing a class list from Excel: the names are converted from the Bamini font encoding to real
  Tamil, shown for checking and correction, and only then saved. Index numbers already in the
  system are skipped, so a list can be imported twice. Read against the club's 2026/27 sheet (counts
  only): 90 index numbers found, 82 with names, every character converted.
- The January promotion, with two faults in the original job fixed: a Grade 3 student could be
  promoted twice in one run, and running the job twice promoted everyone again.

**Still to do:**

- Schedule the promotion (a Cloudflare Cron Trigger calling `POST /api/cron/promote-students`) —
  with the deployment in Phase 4
- The public results lookup (Phase 3) — "Publish results" already sets the flag it will read
- The scanner has not been tried with a real camera

### Phase 3 — Members, content, results

**Built ✅** — results lookup, news, gallery and club membership:

- Parent page (`/[locale]/parents`): a parent scans the student card, or enters the index number
  and the phone number the child was registered with, and sees that child's published marks (rank
  per paper, class average, overall placing), attendance, notices (missed classes, results
  published) and KEDA's announcements. Brothers and sisters can be added side by side; the phone
  stays signed in for 30 days. It replaced the first version, which asked for the index number
  alone. The response is assembled field by field so no family detail can leak; an absent paper is
  shown as absent, never as 0.
- About page (`/[locale]/about`) for the club and KEDA, fed by a "Site details" screen in the
  console: contact lines, the story in English and Tamil, class times, office bearers.
- News and gallery can be viewed as All / Club / KEDA, and a post or album is marked as the club's
  or KEDA's when it is created.
- Publishing a post or an exam sends a push notification to people who asked for that topic.
- News: a rich-text editor with cover and gallery images, drafts and publishing, and public news
  pages. Post bodies are rebuilt through an allow-list when saved, so nothing an editor account
  pastes can run in a visitor's browser.
- Gallery: albums, bulk photo upload, captions, cover choice, and public album pages with a
  full-screen viewer. Deleting a post, a photo or an album also removes its files from storage.
- Photos are shrunk in the browser before upload (1600px, WebP), which also drops location data.
- The site navigation offers News and Gallery only once there is something in them.
- Club membership:
  - Public join form (`/[locale]/membership`) and renew form (`/[locale]/membership/renew`), in
    English and Tamil, linked from the navigation and the club section of the home page.
  - Console: applications waiting, renewals, approved, rejected; search; a member page with review
    notes, approve / reject / put back, editable details, renewal decisions and the membership card;
    "Add member" for people who joined on paper; "Fees and settings".
  - The fee is a setting, off by default. An administrator switches it on and enters the amount per
    occupation and the bank account; the forms then show them and require a payment slip. The amount
    is always worked out on the server.
  - A member's photo and payment slips are private: only a signed-in administrator can open them.
  - Member ids (`KSC-M-0001`) and a year's validity are issued on approval; a renewal adds a year to
    what is left. Lapsed memberships are marked "Expired" in the list.
  - The membership card (front and back, with a QR code of the member id) is drawn in the crest's
    colours and can be downloaded or printed at card size.
  - Differences from KCSC, all deliberate: fees and bank details are settings rather than code;
    member photos are private rather than public; the applicant's age comes from the date of birth;
    under-18s must give a guardian; a rejected applicant may apply again; a second renewal cannot
    overwrite one that is waiting; an early renewal does not lose the days left; the card is drawn
    rather than laid over supplied artwork, because Kavery has no card artwork yet.

Checked by four scripted runs (40, 19, 35 and 69 assertions) on the dev server.

**Still to do:**

- Email (membership card on approval) needs a provider that works from a Worker. Until then the
  card is downloaded and handed over or sent by the administrator.
- The club's own membership-card artwork and officers' signatures, if it wants them on the card
- The parent page's camera scanner has not been tried on a real phone
- Decided (13 Oct 2026): the QR code on a student card stays a bare unique scan id
  (`KEDA-<grade>-<8 random characters>`), separate from the index number, exactly as in KCSC. It is
  not a web address. Parents open the site and scan the card from the parent page.
- A notice to one child's parent (for example "2 classes missed") is shown on the page but not
  pushed: push subscriptions are per topic, not per child.
- A lost card cannot be cancelled yet (the scan id never changes); deactivating the student is the
  only way to shut it.
- A privacy page describing what the join form, the classes and the results lookup hold. The join
  form already asks for consent; the page it should point to does not exist yet.
- This phase has not yet been run in the Workers runtime (`npm run preview`)

### Phase 4 — Launch

`wrangler d1 create`, `wrangler r2 bucket create`, secrets, custom domain, rate limiting on login and
the public forms, SEO (sitemap, JSON-LD, hreflang), privacy page, real photography.

## 6. Open questions for the club

1. Is the intake Grade 5 only, or Grade 4 and 5 as the 2026/27 sheet says?
2. Does Kavery charge a membership fee, and if so what are the amounts and the bank account?
3. Domain name, and which Cloudflare account it will live on.
4. Contact phone, Facebook page, and photographs for the hero, club and gallery sections.
5. A Tamil speaker from the club should read `messages/ta.json` before launch.
