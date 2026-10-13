import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

// The cookie is httpOnly, so only the server can expire it.
export async function POST() {
  (await cookies()).set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return Response.json({ ok: true });
}
