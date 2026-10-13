import type { Metadata } from "next";
import { GalleryScreen } from "@/components/content/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Gallery" };

export default async function Page() {
  await requireSession("content.manage");
  return <GalleryScreen />;
}
