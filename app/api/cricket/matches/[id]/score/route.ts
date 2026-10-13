import { and, eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { resultText } from "@/components/cricket/format";
import { authorize } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { ScoringError, applyAction, scoreLines } from "@/lib/cricket/scoring";
import { adminMatchView, getMatch, getTournament, readBody } from "@/lib/cricket/server";
import { sendPushToTopic } from "@/lib/push";

const M = schema.cricketMatches;

/**
 * The only route that writes deliveries. The scorer sends the revision it last
 * saw; the write is conditional on that revision still being current, so a
 * double tap, or a second phone scoring the same match, cannot record a ball
 * twice — the loser gets a 409 carrying the current scoreboard.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/cricket/matches/[id]/score">) {
  const auth = await authorize("cricket.score");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const body = await readBody(request);
  if (typeof body?.rev !== "number" || !body.action || typeof body.action.type !== "string") {
    return Response.json({ error: "rev and action are required" }, { status: 400 });
  }

  const match = await getMatch(id);
  if (!match) return Response.json({ error: "Match not found" }, { status: 404 });
  const rev = match.rev ?? 0;

  const stale = async () =>
    Response.json(
      {
        error: "The scoreboard changed on another device. It has been refreshed — check the last ball before continuing.",
        match: await adminMatchView((await getMatch(id))!),
      },
      { status: 409 },
    );
  if (body.rev !== rev) return stale();

  let next;
  try {
    next = applyAction(match, body.action);
  } catch (e) {
    if (e instanceof ScoringError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }

  const written = await getDb()
    .update(M)
    .set({
      innings: next.innings,
      status: next.status,
      toss: next.toss ?? null,
      result: next.result ?? null,
      scores: scoreLines(next).map((line) => ({ ...line, allOut: !!line.allOut })),
      rev: rev + 1,
    })
    .where(and(eq(M.id, id), eq(M.rev, rev)))
    .returning({ id: M.id });
  if (written.length === 0) return stale();

  const view = await adminMatchView({ ...match, ...next, rev: rev + 1, updatedAt: new Date().toISOString() });

  // Tell followers when a public match starts or finishes. The scorer's response
  // does not wait for it, and a failed push never fails the ball.
  const started = match.status === "upcoming" && next.status === "live";
  const finished = match.status !== "completed" && next.status === "completed";
  if ((started || finished) && view.isPublished && (!match.tournamentId || (await getTournament(match.tournamentId))?.isPublished)) {
    const fixture = `${view.teamA.name} v ${view.teamB.name}`;
    const push = sendPushToTopic("cricket", {
      title: started ? `${fixture} has started` : (resultText(view) ?? `${fixture} has finished`),
      body: started ? "Follow the score ball by ball." : fixture,
      url: "/#matches",
      // Same tag per match, so an undone-and-rebowled final ball replaces the alert instead of stacking a second one.
      tag: `match-${id}`,
    }).catch(() => {});
    const ctx = getCloudflareContext().ctx;
    if (ctx?.waitUntil) ctx.waitUntil(push);
  }

  return Response.json({ match: view });
}
