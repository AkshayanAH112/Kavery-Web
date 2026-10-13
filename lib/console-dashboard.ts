import { count, desc, eq, gte } from "drizzle-orm";
import { can, type Role } from "@/lib/auth/roles";
import { TIME_ZONE, getDayRange } from "@/lib/dates";
import { getDb, schema } from "@/lib/db";
import { staffColumns } from "@/lib/staff";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Everything the console dashboard shows. Each block is only queried when the
 * role may see it — a section a role cannot open is `null`, so its data never
 * leaves the server.
 */
export async function getDashboard(role: Role) {
  const db = getDb();
  const now = Date.now();
  const days = Array.from({ length: 7 }, (_, i) => getDayRange(now - (6 - i) * DAY_MS));

  const seesEducation = can(role, "attendance.mark");
  const seesCricket = can(role, "cricket.score");
  const seesMembers = can(role, "members.manage");
  const seesStaff = can(role, "staff.manage");
  const seesPush = can(role, "push.send");
  const none = Promise.resolve(null);

  const [students, attendanceRows, alerts, matchRows, matchCounts, teams, memberCounts, staff, subscribers, pushLog] = await Promise.all([
    seesEducation ? db.$count(schema.students, eq(schema.students.isActive, true)) : none,
    seesEducation
      ? db.select({ date: schema.attendance.date, present: schema.attendance.present }).from(schema.attendance).where(gte(schema.attendance.date, days[0].start))
      : none,
    seesEducation
      ? db.select().from(schema.leaveAlerts).where(eq(schema.leaveAlerts.status, "pending")).orderBy(desc(schema.leaveAlerts.createdAt)).limit(5)
      : none,
    seesCricket
      ? db
          .select({
            id: schema.cricketMatches.id,
            title: schema.cricketMatches.title,
            status: schema.cricketMatches.status,
            startAt: schema.cricketMatches.startAt,
            teamA: schema.cricketMatches.teamA,
            teamB: schema.cricketMatches.teamB,
            scores: schema.cricketMatches.scores,
          })
          .from(schema.cricketMatches)
          .orderBy(desc(schema.cricketMatches.updatedAt))
          .limit(5)
      : none,
    seesCricket ? db.select({ status: schema.cricketMatches.status, n: count() }).from(schema.cricketMatches).groupBy(schema.cricketMatches.status) : none,
    seesCricket ? db.select({ id: schema.cricketTeams.id, name: schema.cricketTeams.name, color: schema.cricketTeams.color }).from(schema.cricketTeams) : none,
    seesMembers ? db.select({ status: schema.members.status, n: count() }).from(schema.members).groupBy(schema.members.status) : none,
    seesStaff ? db.select(staffColumns).from(schema.users).orderBy(desc(schema.users.lastLoginAt)).limit(6) : none,
    seesPush ? db.$count(schema.pushSubscriptions) : none,
    seesPush ? db.select().from(schema.pushLog).orderBy(desc(schema.pushLog.createdAt)).limit(5) : none,
  ]);

  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, weekday: "short" });
  const attendance =
    attendanceRows &&
    days.map((day) => {
      const rows = attendanceRows.filter((r) => r.date >= day.start && r.date < day.end);
      const present = rows.filter((r) => r.present).length;
      return { label: weekday.format(day.start), present, absent: rows.length - present };
    });

  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));
  const byStatus = (rows: { status: string; n: number }[] | null) => Object.fromEntries((rows ?? []).map((r) => [r.status, r.n])) as Record<string, number | undefined>;
  const matchStatus = byStatus(matchCounts);
  const memberStatus = byStatus(memberCounts);

  return {
    education: seesEducation
      ? {
          students: students ?? 0,
          attendance: attendance ?? [],
          present: (attendance ?? []).reduce((sum, d) => sum + d.present, 0),
          absent: (attendance ?? []).reduce((sum, d) => sum + d.absent, 0),
          alerts: (alerts ?? []).map((a) => ({ id: a.id, name: a.studentName ?? "Student", registrationNumber: a.registrationNumber, type: a.type, leaveCount: a.leaveCount })),
        }
      : null,
    cricket: seesCricket
      ? {
          live: (matchStatus.live ?? 0) + (matchStatus.innings_break ?? 0),
          upcoming: matchStatus.upcoming ?? 0,
          completed: matchStatus.completed ?? 0,
          teams: (teams ?? []).length,
          matches: (matchRows ?? []).map((m) => ({
            id: m.id,
            title: m.title,
            status: m.status,
            startAt: m.startAt?.getTime() ?? null,
            sides: [m.teamA, m.teamB].map((teamId) => {
              const score = m.scores.find((s) => s.team === teamId);
              return { name: teamById.get(teamId)?.name ?? "Team", color: teamById.get(teamId)?.color ?? null, score: score ? `${score.runs}/${score.wickets}` : null };
            }),
          })),
        }
      : null,
    members: seesMembers ? { approved: memberStatus.approved ?? 0, pending: memberStatus.pending ?? 0, rejected: memberStatus.rejected ?? 0 } : null,
    staff: staff?.map((s) => ({ id: s.id, name: s.name, email: s.email, role: s.role, isActive: s.isActive, lastLoginAt: s.lastLoginAt?.getTime() ?? null })) ?? null,
    push: seesPush ? { subscribers: subscribers ?? 0, log: (pushLog ?? []).map((p) => ({ id: p.id, title: p.title, topic: p.topic, delivered: p.delivered, createdAt: p.createdAt.getTime() })) } : null,
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
