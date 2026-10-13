import type { Metadata } from "next";
import { StudentsScreen } from "@/components/keda/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Students" };

export default async function Page() {
  await requireSession("education.manage");
  return <StudentsScreen />;
}
