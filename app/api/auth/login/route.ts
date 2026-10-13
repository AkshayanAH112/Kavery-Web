import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { isRole } from "@/lib/auth/roles";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/auth/session";

const Body = z.object({ email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(1).max(200) });

// One message for every failure, so the response never reveals whether an email has an account.
const DENIED = Response.json({ error: "Email or password is incorrect." }, { status: 401 });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return DENIED;

  const db = getDb();
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, parsed.data.email) });
  if (!user || !user.isActive || !isRole(user.role)) return DENIED;
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) return DENIED;

  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));

  const token = await createSessionToken(user.id);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());
  return Response.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
}
