import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { authorize } from "@/lib/auth/guard";
import { hashPassword } from "@/lib/auth/password";
import { StaffCreate, staffColumns } from "@/lib/staff";

export async function GET() {
  const auth = await authorize("staff.manage");
  if (!auth.ok) return auth.response;
  const staff = await getDb().select(staffColumns).from(schema.users).orderBy(asc(schema.users.name));
  return Response.json({ staff });
}

export async function POST(request: Request) {
  const auth = await authorize("staff.manage");
  if (!auth.ok) return auth.response;

  const parsed = StaffCreate.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Check the name, email, role and password (10 characters or more)." }, { status: 400 });

  const db = getDb();
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, parsed.data.email) });
  if (existing) return Response.json({ error: "An account with this email already exists." }, { status: 409 });

  const { password, ...rest } = parsed.data;
  const [created] = await db
    .insert(schema.users)
    .values({ ...rest, passwordHash: await hashPassword(password) })
    .returning(staffColumns);
  return Response.json({ staff: created }, { status: 201 });
}
