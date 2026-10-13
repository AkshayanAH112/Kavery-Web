import { eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { getTournament, readBody } from "@/lib/cricket/server";
import { parseTournamentInput } from "@/lib/cricket/tournament-input";

const { cricketTournaments: TR, cricketMatches: M } = schema;

export async function PATCH(request: Request, { params }: RouteContext<"/api/cricket/tournaments/[id]">) {
  const auth = await authorize("cricket.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const input = parseTournamentInput(await readBody(request));
  if (typeof input === "string") return Response.json({ error: input }, { status: 400 });
  if (!(await getTournament(id))) return Response.json({ error: "Tournament not found" }, { status: 404 });

  if (Object.keys(input).length > 0) await getDb().update(TR).set(input).where(eq(TR.id, id));
  return Response.json({ tournament: await getTournament(id) });
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/cricket/tournaments/[id]">) {
  const auth = await authorize("cricket.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  if (!(await getTournament(id))) return Response.json({ error: "Tournament not found" }, { status: 404 });
  const db = getDb();
  const matchCount = await db.$count(M, eq(M.tournamentId, id));
  if (matchCount > 0) {
    return Response.json({ error: `Cannot delete: this tournament has ${matchCount} match(es). Delete those matches first.` }, { status: 409 });
  }
  await db.delete(TR).where(eq(TR.id, id));
  return Response.json({ success: true });
}
