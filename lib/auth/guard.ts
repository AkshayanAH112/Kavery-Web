import { redirect } from "next/navigation";
import { can, type Permission } from "./roles";
import { getSession, type Session } from "./session";

type Authorized = { ok: true; session: Session };
type Denied = { ok: false; response: Response };

/**
 * Route Handler guard. A new route is NOT protected unless it calls this:
 *
 *   const auth = await authorize("cricket.score");
 *   if (!auth.ok) return auth.response;
 */
export async function authorize(permission?: Permission): Promise<Authorized | Denied> {
  const session = await getSession();
  if (!session) return { ok: false, response: Response.json({ error: "Sign in to continue." }, { status: 401 }) };
  if (permission && !can(session.role, permission)) {
    return { ok: false, response: Response.json({ error: "Your role does not allow this." }, { status: 403 }) };
  }
  return { ok: true, session };
}

/** Server Component guard for console pages. */
export async function requireSession(permission?: Permission): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (permission && !can(session.role, permission)) redirect("/console?denied=1");
  return session;
}
