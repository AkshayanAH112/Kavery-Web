import type { Metadata } from "next";
import { NewsEditScreen } from "@/components/content/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Edit post" };

export default async function Page() {
  await requireSession("content.manage");
  return <NewsEditScreen />;
}
