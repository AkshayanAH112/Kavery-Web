import type { Metadata } from "next";
import { PushComposer } from "@/components/console/PushComposer";
import { PageHeader } from "@/components/console/ui";
import { requireSession } from "@/lib/auth/guard";
import { getPushOverview } from "@/lib/push";

export const metadata: Metadata = { title: "Notifications" };

export default async function PushPage() {
  await requireSession("push.send");
  return (
    <div className="space-y-8">
      <PageHeader title="Notifications" description="Send a push notification to everyone who chose a topic on the public site. It arrives on their phone even when the app is closed." />
      <PushComposer initial={await getPushOverview()} />
    </div>
  );
}
