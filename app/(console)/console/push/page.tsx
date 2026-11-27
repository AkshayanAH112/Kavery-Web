import type { Metadata } from "next";
import { PushComposer } from "@/components/console/PushComposer";
import { PageHeader } from "@/components/console/ui";
import { requireSession } from "@/lib/auth/guard";
import { getPushConsole } from "@/lib/push-schedules";

export const metadata: Metadata = { title: "Notifications" };

export default async function PushPage() {
  await requireSession("push.send");
  return (
    <div className="space-y-8">
      <PageHeader title="Notifications" description="Send a push notification now or at a time you choose, once or on a repeat, with a poster if you like. It reaches everyone who chose that topic on the public site, even when the app is closed." />
      <PushComposer initial={await getPushConsole()} />
    </div>
  );
}
