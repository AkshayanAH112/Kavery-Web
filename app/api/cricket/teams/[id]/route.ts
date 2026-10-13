import { and, eq, inArray, ne, or } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, getEnv, schema } from "@/lib/db";
import { isId, loadTeams, matchesNamingPlayers, readBody, text } from "@/lib/cricket/server";
import { parseTeamInput } from "@/lib/cricket/team-input";

const { cricketTeams: T, cricketPlayers: P, cricketMatches: M, cricketTournaments: TR } = schema;

export async function PATCH(request: Request, { params }: RouteContext<"/api/cricket/teams/[id]">) {
  const auth = await authorize("cricket.score");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const data = await readBody(request);
  const input = parseTeamInput(data);
  if (typeof input === "string") return Response.json({ error: input }, { status: 400 });

  const db = getDb();
  const team = isId(id) ? await db.query.cricketTeams.findFirst({ where: eq(T.id, id) }) : null;
  if (!team) return Response.json({ error: "Team not found" }, { status: 404 });
  if (await db.query.cricketTeams.findFirst({ where: and(eq(T.name, input.name), ne(T.id, id)) })) {
    return Response.json({ error: "A team with this name already exists" }, { status: 400 });
  }

  const writes = [];
  if (input.players) {
    const existing = await db.select().from(P).where(eq(P.teamId, id));
    const existingIds = new Set(existing.map((p) => p.id));
    const keeping = new Set(input.players.map((p) => p._id).filter((pid): pid is string => !!pid && existingIds.has(pid)));
    const removed = existing.filter((p) => !keeping.has(p.id));

    // Every ball refers to a player by id, so a player named in any squad can be renamed but not removed.
    if (removed.length > 0) {
      const used = new Set((await matchesNamingPlayers(removed.map((p) => p.id))).flatMap((m) => [...m.squadA, ...m.squadB]));
      const names = removed.filter((p) => used.has(p.id)).map((p) => p.name);
      if (names.length > 0) {
        return Response.json({ error: `Cannot remove ${names.join(", ")} — already named in a match squad. Rename instead, or delete those matches first.` }, { status: 409 });
      }
      writes.push(db.delete(P).where(inArray(P.id, removed.map((p) => p.id))));
    }

    input.players.forEach((p, sort) => {
      const values = { name: p.name, role: p.role, isCaptain: p.isCaptain, isKeeper: p.isKeeper, sort };
      if (p._id && keeping.has(p._id)) writes.push(db.update(P).set(values).where(eq(P.id, p._id)));
      else writes.push(db.insert(P).values({ ...values, teamId: id }));
    });
  }

  // A replaced crest's old file is removed from R2 after the row is saved.
  const logoChanged = data?.logoUrl !== undefined && (text(data.logoUrl, 500) || null) !== team.logoUrl;
  const teamUpdate = db
    .update(T)
    .set({
      name: input.name,
      shortName: input.shortName || null,
      color: input.color ?? null,
      ...(logoChanged ? { logoUrl: text(data.logoUrl, 500) || null, logoKey: text(data.logoPublicId, 300) || null } : {}),
    })
    .where(eq(T.id, id));

  await db.batch([teamUpdate, ...writes]);
  if (logoChanged && team.logoKey) await getEnv().MEDIA.delete(team.logoKey).catch(() => {});

  return Response.json({ team: (await loadTeams([id])).get(id) });
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/cricket/teams/[id]">) {
  const auth = await authorize("cricket.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const db = getDb();
  const team = isId(id) ? await db.query.cricketTeams.findFirst({ where: eq(T.id, id) }) : null;
  if (!team) return Response.json({ error: "Team not found" }, { status: 404 });

  const matchCount = await db.$count(M, or(eq(M.teamA, id), eq(M.teamB, id)));
  if (matchCount > 0) {
    return Response.json({ error: `Cannot delete: this team has ${matchCount} match(es). Delete those matches first.` }, { status: 409 });
  }

  const tournaments = (await db.select({ id: TR.id, teamIds: TR.teamIds }).from(TR)).filter((t) => t.teamIds.includes(id));
  await db.batch([
    db.delete(T).where(eq(T.id, id)), // players go with it (ON DELETE CASCADE)
    ...tournaments.map((t) => db.update(TR).set({ teamIds: t.teamIds.filter((teamId) => teamId !== id) }).where(eq(TR.id, t.id))),
  ]);
  if (team.logoKey) await getEnv().MEDIA.delete(team.logoKey).catch(() => {});

  return Response.json({ success: true });
}
