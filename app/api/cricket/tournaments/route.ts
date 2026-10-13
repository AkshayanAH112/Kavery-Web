import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { getTournament, loadTournaments, readBody, uniqueTournamentSlug } from "@/lib/cricket/server";
import { parseTournamentInput } from "@/lib/cricket/tournament-input";

// Scorers read the list (a match is filed under a tournament); only admins change it.
export async function GET() {
  const auth = await authorize("cricket.score");
  if (!auth.ok) return auth.response;
  return Response.json({ tournaments: [...(await loadTournaments()).values()] });
}

export async function POST(request: Request) {
  const auth = await authorize("cricket.manage");
  if (!auth.ok) return auth.response;

  const input = parseTournamentInput(await readBody(request));
  if (typeof input === "string") return Response.json({ error: input }, { status: 400 });
  if (!input.name) return Response.json({ error: "Tournament name is required" }, { status: 400 });

  const id = crypto.randomUUID();
  // A new tournament is never published by the create form — that is a deliberate later step.
  await getDb()
    .insert(schema.cricketTournaments)
    .values({ ...input, id, name: input.name, slug: await uniqueTournamentSlug(input.name), isPublished: false });
  return Response.json({ tournament: await getTournament(id) }, { status: 201 });
}
