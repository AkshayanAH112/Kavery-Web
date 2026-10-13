import type { Metadata } from "next";
import { NewsScreen } from "@/components/content/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "News" };

export default async function Page() {
  await requireSession("content.manage");
  return <NewsScreen />;
}
