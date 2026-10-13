import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { authorize } from "@/lib/auth/guard";
import { hashPassword } from "@/lib/auth/password";
import { StaffUpdate, isLastActiveAdmin, staffColumns } from "@/lib/staff";

const LAST_ADMIN = Response.json(
  { error: "This is the only active administrator. Make someone else an administrator first." },
  { status: 409 },
);

export async function PATCH(request: Request, { params }: RouteContext<"/api/staff/[id]">) {
  const auth = await authorize("staff.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const parsed = StaffUpdate.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Check the fields and try again." }, { status: 400 });

  const db = getDb();
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, id) });
  if (!user) return Response.json({ error: "Staff member not found." }, { status: 404 });

  const { password, ...changes } = parsed.data;
  const losesAdmin = user.role === "admin" && user.isActive && ((changes.role && changes.role !== "admin") || changes.isActive === false);
  if (losesAdmin && (await isLastActiveAdmin(id))) return LAST_ADMIN;

  const [updated] = await db
    .update(schema.users)
    .set({ ...changes, ...(password ? { passwordHash: await hashPassword(password) } : {}) })
    .where(eq(schema.users.id, id))
    .returning(staffColumns);
  return Response.json({ staff: updated });
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/staff/[id]">) {
  const auth = await authorize("staff.manage");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  if (id === auth.session.userId) return Response.json({ error: "You cannot delete your own account." }, { status: 409 });

  const db = getDb();
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, id) });
  if (!user) return Response.json({ error: "Staff member not found." }, { status: 404 });
  if (user.role === "admin" && user.isActive && (await isLastActiveAdmin(id))) return LAST_ADMIN;

  await db.delete(schema.users).where(eq(schema.users.id, id));
  return Response.json({ ok: true });
}
