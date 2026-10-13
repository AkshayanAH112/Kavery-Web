import type { Metadata } from "next";
import { StudentImportScreen } from "@/components/keda/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Import students" };

export default async function Page() {
  await requireSession("education.manage");
  return <StudentImportScreen />;
}
