import type { Metadata } from "next";
import { GalleryAlbumScreen } from "@/components/content/screens";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Album" };

export default async function Page() {
  await requireSession("content.manage");
  return <GalleryAlbumScreen />;
}
