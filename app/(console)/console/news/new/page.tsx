import type { Metadata } from "next";
import { NewsNewScreen } from "@/components/content/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "New post" };

export default async function Page() {
  await requireSession("content.manage");
  return <NewsNewScreen />;
}
