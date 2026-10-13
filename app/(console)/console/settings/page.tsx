import type { Metadata } from "next";
import { SiteSettingsForm } from "@/components/console/SiteSettingsForm";
import { PageHeader } from "@/components/console/ui";
import { requireSession } from "@/lib/auth/guard";
import { getSettings } from "@/lib/site";

export const metadata: Metadata = { title: "Site details" };

export default async function SettingsPage() {
  await requireSession("site.manage");
  return (
    <div className="space-y-8">
      <PageHeader title="Site details" description="What the public site says about the club and about KEDA: contact lines, the About page and the office bearers. Only the club can supply these, so nothing appears until it is entered here." />
      <SiteSettingsForm initial={await getSettings()} />
    </div>
  );
}
