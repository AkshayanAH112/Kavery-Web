import { LIVE_SECONDS, cachedJson, publicMatchPayload } from "@/lib/cricket/server";

export async function GET(request: Request, { params }: RouteContext<"/api/public/cricket/matches/[id]">) {
  const { id } = await params;
  // Always the short cache, even for a finished match: a scorer can undo the
  // last ball of a completed game, and that correction should show within seconds.
  return cachedJson(request, LIVE_SECONDS, async () => {
    const body = await publicMatchPayload(id);
    return body ? { body } : { status: 404, body: { error: "Match not found" } };
  });
}
