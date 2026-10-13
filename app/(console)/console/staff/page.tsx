import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { StaffManager } from "@/components/console/StaffManager";
import { PageHeader } from "@/components/console/ui";
import { requireSession } from "@/lib/auth/guard";
import { getDb, schema } from "@/lib/db";
import { staffColumns } from "@/lib/staff";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  const session = await requireSession("staff.manage");
  const staff = await getDb().select(staffColumns).from(schema.users).orderBy(asc(schema.users.name));

  return (
    <div className="space-y-8">
      <PageHeader title="Staff" description="Each person gets their own account and one role. The role decides what they can open and what the server will accept from them." />
      <StaffManager
        currentUserId={session.userId}
        initial={staff.map((s) => ({ ...s, lastLoginAt: s.lastLoginAt?.getTime() ?? null, createdAt: s.createdAt.getTime() }))}
      />
    </div>
  );
}
