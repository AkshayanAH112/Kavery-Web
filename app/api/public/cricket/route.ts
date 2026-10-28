import { LIVE_SECONDS, cachedJson, liveHomePayload } from "@/lib/cricket/server";

// Public and unauthenticated by design. Never add anything per-viewer: the response is shared at the edge.
export async function GET(request: Request) {
  return cachedJson(request, LIVE_SECONDS, async () => ({ body: await liveHomePayload() }));
}
