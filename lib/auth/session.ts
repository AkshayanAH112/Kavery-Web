import { cache } from "react";
import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { getDb, getSecret, schema } from "@/lib/db";
import { isRole, type Role } from "./roles";

export const SESSION_COOKIE = "ksc_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export type Session = { userId: string; email: string; name: string; role: Role };

function secret() {
  const value = getSecret("AUTH_SECRET");
  if (!value || value.length < 32) throw new Error("AUTH_SECRET is missing or shorter than 32 characters");
  return new TextEncoder().encode(value);
}

export async function createSessionToken(userId: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_MAX_AGE)
    .sign(secret());
}

/**
 * The token only proves who the caller is. Role and active status are read from
 * the database on every request, so demoting or deactivating someone takes
 * effect immediately instead of when their token expires.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const bearer = (await headers()).get("authorization");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let userId: string | undefined;
  try {
    userId = (await jwtVerify(token, secret(), { algorithms: ["HS256"] })).payload.sub;
  } catch {
    return null;
  }
  if (!userId) return null;

  const user = await getDb().query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user || !user.isActive || !isRole(user.role)) return null;
  return { userId: user.id, email: user.email, name: user.name, role: user.role };
});

export function sessionCookieOptions(maxAge = SESSION_MAX_AGE) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge };
}
