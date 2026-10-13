import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BellRing, GraduationCap, IdCard, Megaphone, Trophy, TriangleAlert } from "lucide-react";
import { Donut, StackedBars } from "@/components/console/charts";
import { Badge, Card, CardHeader, EmptyState, IconTile, Note, buttonClass } from "@/components/console/ui";
import { requireSession } from "@/lib/auth/guard";
import { ROLE_LABELS, ROLE_SUMMARIES, isRole } from "@/lib/auth/roles";
import { getDashboard } from "@/lib/console-dashboard";
import { TIME_ZONE } from "@/lib/dates";

export const metadata: Metadata = { title: "Dashboard" };

const dateTime = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const when = (ms: number | null, fallback = "Never") => (ms ? dateTime.format(ms) : fallback);

const MATCH_BADGE: Record<string, { tone: "danger" | "warn" | "neutral" | "ok"; label: string }> = {
  live: { tone: "danger", label: "Live" },
  innings_break: { tone: "danger", label: "Innings break" },
  upcoming: { tone: "warn", label: "Upcoming" },
  completed: { tone: "ok", label: "Finished" },
  abandoned: { tone: "neutral", label: "Abandoned" },
};

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

export default async function ConsoleHome({ searchParams }: PageProps<"/console">) {
  const session = await requireSession();
  const { denied } = await searchParams;
  const data = await getDashboard(session.role);
  const { education, cricket, members, staff, push } = data;
  const marked = education ? education.present + education.absent : 0;
  const memberTotal = members ? members.approved + members.pending + members.rejected : 0;

  return (
    <div className="space-y-5">
      {denied && <Note tone="error">Your role does not include that page. Ask an administrator if you need access.</Note>}

      {/* Row 1 — welcome + the two numbers this role acts on most */}
      <div className="grid gap-5 lg:grid-cols-12">
        <Card className="relative overflow-hidden p-6 lg:col-span-6">
          <div className="relative z-10 max-w-[70%]">
            <h1 className="text-xl font-semibold tracking-tight">Hello, {session.name.split(" ")[0]}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {ROLE_LABELS[session.role]}. {ROLE_SUMMARIES[session.role]}
            </p>
            <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
              {education && <Stat label="Active students" value={education.students} />}
              {members && <Stat label="Club members" value={members.approved} />}
              {cricket && !members && <Stat label="Teams" value={cricket.teams} />}
              {cricket && !education && <Stat label="Matches finished" value={cricket.completed} />}
            </div>
          </div>
          <Image src="/brand/ksc-crest.webp" alt="" width={900} height={890} className="pointer-events-none absolute -bottom-10 -right-6 h-auto w-44 opacity-90 sm:w-52" />
        </Card>

        {cricket && (
          <Card className="p-6 lg:col-span-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Matches</h2>
                <p className="mt-1 flex items-center gap-2 text-2xl font-semibold tabular-nums tracking-tight">
                  {cricket.completed + cricket.live + cricket.upcoming}
                  {cricket.live > 0 && <Badge tone="danger">{cricket.live} live</Badge>}
                </p>
              </div>
              <IconTile className="rounded-full">
                <Trophy aria-hidden className="h-4.5 w-4.5" strokeWidth={1.75} />
              </IconTile>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {cricket.upcoming} upcoming · {cricket.completed} finished · {cricket.teams} team{cricket.teams === 1 ? "" : "s"}
            </p>
          </Card>
        )}

        {push && (
          <Card className="p-6 lg:col-span-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Subscribers</h2>
                <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{push.subscribers}</p>
              </div>
              <IconTile className="rounded-full">
                <BellRing aria-hidden className="h-4.5 w-4.5" strokeWidth={1.75} />
              </IconTile>
            </div>
            <Link href="/console/push" className={buttonClass("secondary", "mt-3 min-h-9! px-3 text-sm")}>
              Send a notification <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
          </Card>
        )}
      </div>

      {/* Row 2 — attendance over the last week, membership beside it */}
      {(education || members) && (
        <div className="grid gap-5 lg:grid-cols-12">
          {education && (
            <Card className={`p-6 ${members ? "lg:col-span-8" : "lg:col-span-12"}`}>
              <CardHeader title="Attendance" description="Class registers over the last 7 days" />
              {marked === 0 ? (
                <div className="mt-6">
                  <EmptyState title="No registers in the last 7 days">When a class is held and its attendance is marked, each day shows here as present against absent.</EmptyState>
                </div>
              ) : (
                <div className="mt-6 grid gap-8 md:grid-cols-[1fr_13rem]">
                  {/* Scrolls sideways on a phone rather than shrinking the axis labels below a readable size. */}
                  <div className="overflow-x-auto">
                    <div className="min-w-[26rem]">
                      <StackedBars
                        data={education.attendance.map((d) => ({ label: d.label, primary: d.present, secondary: d.absent }))}
                        summary={`Attendance for the last 7 days: ${education.present} present and ${education.absent} absent in total.`}
                      />
                    </div>
                  </div>
                  <div className="space-y-5 self-center">
                    <Stat label="Attendance rate" value={`${Math.round((education.present / marked) * 100)}%`} />
                    <p className="flex items-center gap-2.5 text-sm">
                      <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-data-1" />
                      <span className="text-muted-foreground">Present</span>
                      <span className="ml-auto font-semibold tabular-nums">{education.present}</span>
                    </p>
                    <p className="flex items-center gap-2.5 text-sm">
                      <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-data-3" />
                      <span className="text-muted-foreground">Marked absent</span>
                      <span className="ml-auto font-semibold tabular-nums">{education.absent}</span>
                    </p>
                  </div>
                </div>
              )}
            </Card>
          )}

          {members && (
            <Card className={`p-6 ${education ? "lg:col-span-4" : "lg:col-span-12"}`}>
              <CardHeader title="Membership" description="Applications by status" />
              {memberTotal === 0 ? (
                <div className="mt-6">
                  <EmptyState title="No applications yet">Applications from the public join form will be counted here.</EmptyState>
                </div>
              ) : (
                <div className="mt-6 flex items-center gap-6">
                  <Donut
                    summary={`${members.approved} approved, ${members.pending} waiting for review, ${members.rejected} rejected.`}
                    slices={[
                      { label: "Approved", value: members.approved, color: "var(--data-1)" },
                      { label: "Waiting", value: members.pending, color: "var(--data-2)" },
                      { label: "Rejected", value: members.rejected, color: "var(--data-3)" },
                    ]}
                  />
                  <ul className="flex-1 space-y-2.5 text-sm">
                    {(
                      [
                        ["Approved", members.approved, "bg-data-1"],
                        ["Waiting for review", members.pending, "bg-data-2"],
                        ["Rejected", members.rejected, "bg-data-3"],
                      ] as const
                    ).map(([label, value, dot]) => (
                      <li key={label} className="flex items-center gap-2.5">
                        <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                        <span className="text-muted-foreground">{label}</span>
                        <span className="ml-auto font-semibold tabular-nums">{value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Row 3 — three lists */}
      <div className="grid gap-5 lg:grid-cols-3">
        {cricket && (
          <Card className="p-6">
            <CardHeader title="Recent matches" description="Latest activity first" />
            {cricket.matches.length === 0 ? (
              <div className="mt-6">
                <EmptyState title="No matches yet">Matches appear here once a scorer creates the first fixture.</EmptyState>
              </div>
            ) : (
              <ul className="mt-5 space-y-4">
                {cricket.matches.map((match) => {
                  const badge = MATCH_BADGE[match.status] ?? MATCH_BADGE.abandoned;
                  return (
                    <li key={match.id} className="flex items-center gap-3">
                      <IconTile>
                        <Trophy aria-hidden className="h-4.5 w-4.5" strokeWidth={1.75} />
                      </IconTile>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{match.sides.map((s) => s.name).join(" v ")}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {match.sides.some((s) => s.score) ? match.sides.map((s) => s.score ?? "–").join("  ·  ") : when(match.startAt, "Date to be confirmed")}
                        </p>
                      </div>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        {education && (
          <Card className="p-6">
            <CardHeader title="Leave alerts" description="Students who have reached 2 or 3 leaves" />
            {education.alerts.length === 0 ? (
              <div className="mt-6">
                <EmptyState title="Nothing needs follow-up">A student is listed here after a second leave, and escalated after a third.</EmptyState>
              </div>
            ) : (
              <ul className="mt-5 space-y-4">
                {education.alerts.map((alert) => (
                  <li key={alert.id} className="flex items-center gap-3">
                    <IconTile>
                      {alert.type === "admin_critical" ? (
                        <TriangleAlert aria-hidden className="h-4.5 w-4.5 text-danger" strokeWidth={1.75} />
                      ) : (
                        <GraduationCap aria-hidden className="h-4.5 w-4.5" strokeWidth={1.75} />
                      )}
                    </IconTile>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{alert.name}</p>
                      <p className="truncate text-sm text-muted-foreground">{alert.registrationNumber ?? "No index number"}</p>
                    </div>
                    <Badge tone={alert.type === "admin_critical" ? "danger" : "warn"}>{alert.leaveCount} leaves</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {push && (
          <Card className="p-6">
            <CardHeader title="Notifications sent" description="The last five pushes" />
            {push.log.length === 0 ? (
              <div className="mt-6">
                <EmptyState title="Nothing sent yet">Pushes you send from Notifications are logged here with how many devices received them.</EmptyState>
              </div>
            ) : (
              <ul className="mt-5 space-y-4">
                {push.log.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3">
                    <IconTile>
                      <Megaphone aria-hidden className="h-4.5 w-4.5" strokeWidth={1.75} />
                    </IconTile>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{entry.title}</p>
                      <p className="truncate text-sm text-muted-foreground">{when(entry.createdAt)}</p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{entry.delivered} delivered</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      {/* Row 4 — staff table */}
      {staff && (
        <Card>
          <div className="p-6">
            <CardHeader
              title="Staff"
              description="Most recently signed in"
              action={
                <Link href="/console/staff" className={buttonClass("secondary", "min-h-9! px-3 text-sm")}>
                  Manage staff
                </Link>
              }
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-xl text-left text-[0.9375rem]">
              <thead>
                <tr className="border-y border-line text-sm">
                  <th scope="col" className="px-6 py-3 font-semibold">Name</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Role</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Last signed in</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((person) => (
                  <tr key={person.id} className="border-b border-line last:border-b-0">
                    <td className="px-6 py-3.5">
                      <span className="flex items-center gap-3">
                        <IconTile className="rounded-full">
                          <IdCard aria-hidden className="h-4.5 w-4.5" strokeWidth={1.75} />
                        </IconTile>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{person.name}</span>
                          <span className="block truncate text-sm text-muted-foreground">{person.email}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-6 py-3.5">{isRole(person.role) ? ROLE_LABELS[person.role] : person.role}</td>
                    <td className="px-6 py-3.5 tabular-nums text-muted-foreground">{when(person.lastLoginAt)}</td>
                    <td className="px-6 py-3.5">{person.isActive ? <Badge tone="ok">Active</Badge> : <Badge tone="neutral">Deactivated</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
