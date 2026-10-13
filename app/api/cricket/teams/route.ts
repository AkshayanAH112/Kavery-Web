import { eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { loadTeams, readBody, text } from "@/lib/cricket/server";
import { parseTeamInput } from "@/lib/cricket/team-input";

export async function GET() {
  const auth = await authorize("cricket.score");
  if (!auth.ok) return auth.response;
  return Response.json({ teams: [...(await loadTeams()).values()] });
}

export async function POST(request: Request) {
  const auth = await authorize("cricket.score");
  if (!auth.ok) return auth.response;

  const data = await readBody(request);
  const input = parseTeamInput(data);
  if (typeof input === "string") return Response.json({ error: input }, { status: 400 });

  const db = getDb();
  if (await db.query.cricketTeams.findFirst({ where: eq(schema.cricketTeams.name, input.name) })) {
    return Response.json({ error: "A team with this name already exists" }, { status: 400 });
  }

  const teamId = crypto.randomUUID();
  const team = db.insert(schema.cricketTeams).values({
    id: teamId,
    name: input.name,
    shortName: input.shortName || null,
    color: input.color ?? null,
    logoUrl: text(data?.logoUrl, 500) || null,
    logoKey: text(data?.logoPublicId, 300) || null,
  });
  const players = (input.players ?? []).map((p, sort) => ({ teamId, name: p.name, role: p.role, isCaptain: p.isCaptain, isKeeper: p.isKeeper, sort }));
  // One batch = one transaction: a team is never left behind without its squad.
  if (players.length) await db.batch([team, db.insert(schema.cricketPlayers).values(players)]);
  else await team;

  return Response.json({ team: (await loadTeams([teamId])).get(teamId) }, { status: 201 });
}
