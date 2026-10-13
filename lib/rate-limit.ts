/**
 * A best-effort brake for public endpoints. It lives in one isolate's memory, so
 * it slows casual abuse and nothing more — a Cloudflare rate-limiting rule on
 * the path is the real control (Phase 4).
 *
 *   const tooMany = rateLimiter(20, 10 * 60 * 1000);
 *   if (tooMany(clientIp(request) ?? "unknown")) return …429
 */
export function rateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  const recentFor = (key: string, now: number) => (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  /** Counts this call, and says whether the key is now over the limit. */
  const limiter = (key: string): boolean => {
    const now = Date.now();
    const recent = recentFor(key, now);
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) {
      for (const [k, times] of hits) if (times.every((t) => now - t >= windowMs)) hits.delete(k);
    }
    return recent.length > max;
  };
  /**
   * Whether one more would be too many, without counting it. For limits on
   * things that succeeded: ask first, do the work, then call the limiter itself
   * to count it — so a request that is refused for another reason costs nothing.
   */
  limiter.isFull = (key: string): boolean => recentFor(key, Date.now()).length >= max;
  return limiter;
}

/** On Cloudflare `cf-connecting-ip` is set by the edge and cannot be forged by the caller. */
export function clientIp(request: Request): string | null {
  return request.headers.get("cf-connecting-ip") || (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
}
