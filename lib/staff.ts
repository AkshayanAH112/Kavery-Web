import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { ROLES } from "@/lib/auth/roles";

export const StaffCreate = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  role: z.enum(ROLES),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});

export const StaffUpdate = z
  .object({
    name: z.string().trim().min(2).max(80),
    role: z.enum(ROLES),
    isActive: z.boolean(),
    password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
  })
  .partial();

export const staffColumns = {
  id: schema.users.id,
  name: schema.users.name,
  email: schema.users.email,
  role: schema.users.role,
  isActive: schema.users.isActive,
  lastLoginAt: schema.users.lastLoginAt,
  createdAt: schema.users.createdAt,
};

/**
 * Only an admin can create another admin, so removing the last active one would
 * lock everybody out for good. True when `userId` is that last admin.
 */
export async function isLastActiveAdmin(userId: string) {
  const db = getDb();
  const others = await db.$count(
    schema.users,
    and(eq(schema.users.role, "admin"), eq(schema.users.isActive, true), ne(schema.users.id, userId)),
  );
  return others === 0;
}
