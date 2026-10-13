import { CurrentUserProvider } from "@/components/console/current-user";
import { Shell } from "@/components/console/Shell";
import { requireSession } from "@/lib/auth/guard";
import { ROLE_LABELS, can } from "@/lib/auth/roles";
import { groupsFor } from "@/lib/console-nav";

export default async function ConsoleLayout({ children }: LayoutProps<"/console">) {
  const session = await requireSession();
  return (
    <CurrentUserProvider user={{ name: session.name, email: session.email, role: session.role, isAdmin: can(session.role, "staff.manage") }}>
      <Shell groups={groupsFor(session.role)} user={{ name: session.name, email: session.email, roleLabel: ROLE_LABELS[session.role] }}>
        {children}
      </Shell>
    </CurrentUserProvider>
  );
}
