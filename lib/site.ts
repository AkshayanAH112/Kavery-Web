import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getLocalYear } from "@/lib/dates";
import { normalizeSiteSettings, type SiteSettings } from "@/lib/site-settings";

/** Facts taken from the two crests. Everything else on the public site comes from the database. */
export const CLUB = {
  name: "Kavery Sports Club",
  shortName: "KSC",
  place: "Periyaneelavanai",
  founded: 1981,
  keda: { name: "Kavery Education Development Association", shortName: "KEDA", founded: 2023 },
} as const;

export { DEFAULT_SETTINGS, type SiteSettings } from "@/lib/site-settings";

/** Editable in the console under Site details. Each top-level field is one site_settings row. */
export async function getSettings(): Promise<SiteSettings> {
  const rows = await getDb().select().from(schema.siteSettings);
  return normalizeSiteSettings(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}

export async function saveSettings(settings: SiteSettings) {
  const db = getDb();
  const now = new Date();
  const writes = Object.entries(settings).map(([key, value]) =>
    db.insert(schema.siteSettings).values({ key, value }).onConflictDoUpdate({ target: schema.siteSettings.key, set: { value, updatedAt: now } }),
  );
  await db.batch(writes as [(typeof writes)[number], ...typeof writes]);
}

/** The few live numbers the About page quotes. */
export async function getAboutStats() {
  const db = getDb();
  const [students, members] = await Promise.all([db.$count(schema.students, eq(schema.students.isActive, true)), db.$count(schema.members, eq(schema.members.status, "approved"))]);
  return { years: getLocalYear() - CLUB.founded, students, members };
}

export type HomeMatch = {
  id: string;
  title: string | null;
  status: string;
  startAt: number | null;
  venue: string | null;
  tournament: string | null;
  result: (typeof schema.cricketMatches.$inferSelect)["result"];
  sides: { id: string; name: string; shortName: string; color: string | null; logoUrl: string | null; score: { runs: number; wickets: number; balls: number } | null }[];
};

/**
 * Everything the landing page shows, in one round of queries. A match is public
 * only if it is not hidden AND its tournament, if it has one, is published.
 */
export async function getHomeData() {
  const db = getDb();
  const m = schema.cricketMatches;

  const [students, members, matchesScored, posts, matchRows, tournaments, teams, folders] = await Promise.all([
    db.$count(schema.students, eq(schema.students.isActive, true)),
    db.$count(schema.members, eq(schema.members.status, "approved")),
    db.$count(m, and(eq(m.status, "completed"), eq(m.isPublished, true))),
    db
      .select({
        id: schema.posts.id,
        org: schema.posts.org,
        title: schema.posts.title,
        slug: schema.posts.slug,
        excerpt: schema.posts.excerpt,
        coverUrl: schema.posts.coverUrl,
        category: schema.posts.category,
        publishedAt: schema.posts.publishedAt,
      })
      .from(schema.posts)
      .where(eq(schema.posts.status, "published"))
      .orderBy(desc(schema.posts.publishedAt))
      .limit(3),
    db
      .select({
        id: m.id,
        title: m.title,
        status: m.status,
        startAt: m.startAt,
        venue: m.venue,
        tournamentId: m.tournamentId,
        teamA: m.teamA,
        teamB: m.teamB,
        scores: m.scores,
        result: m.result,
      })
      .from(m)
      .where(and(eq(m.isPublished, true), inArray(m.status, ["live", "innings_break", "upcoming", "completed"])))
      .orderBy(desc(m.startAt))
      .limit(30),
    db.select({ id: schema.cricketTournaments.id, name: schema.cricketTournaments.name, isPublished: schema.cricketTournaments.isPublished }).from(schema.cricketTournaments),
    db.select().from(schema.cricketTeams),
    db.select().from(schema.galleryFolders).where(isNotNull(schema.galleryFolders.coverUrl)).orderBy(desc(schema.galleryFolders.updatedAt)).limit(6),
  ]);

  const tournamentById = new Map(tournaments.map((t) => [t.id, t]));
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const matches: HomeMatch[] = matchRows
    .filter((row) => !row.tournamentId || tournamentById.get(row.tournamentId)?.isPublished)
    .map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      startAt: row.startAt?.getTime() ?? null,
      venue: row.venue,
      tournament: row.tournamentId ? (tournamentById.get(row.tournamentId)?.name ?? null) : null,
      result: row.result,
      sides: [row.teamA, row.teamB].map((teamId) => {
        const team = teamById.get(teamId);
        const score = row.scores.find((s) => s.team === teamId);
        const name = team?.name ?? "Team";
        return {
          id: teamId,
          name,
          shortName: team?.shortName || name.slice(0, 3).toUpperCase(),
          color: team?.color ?? null,
          logoUrl: team?.logoUrl ?? null,
          score: score ? { runs: score.runs, wickets: score.wickets, balls: score.balls } : null,
        };
      }),
    }));

  const live = matches.filter((x) => x.status === "live" || x.status === "innings_break");
  const upcoming = matches.filter((x) => x.status === "upcoming").sort((a, b) => (a.startAt ?? Infinity) - (b.startAt ?? Infinity));
  const recent = matches.filter((x) => x.status === "completed");

  return {
    stats: { years: getLocalYear() - CLUB.founded, members, students, matchesScored },
    posts: posts.map((p) => ({ ...p, publishedAt: p.publishedAt?.getTime() ?? null })),
    live,
    upcoming: upcoming.slice(0, 3),
    recent: recent.slice(0, 3),
    featured: live[0] ?? upcoming[0] ?? recent[0] ?? null,
    folders,
  };
}

export type HomeData = Awaited<ReturnType<typeof getHomeData>>;
