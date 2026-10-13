"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Lock,
  ScanLine,
  UserX,
} from "lucide-react";

type RosterEntry = {
  student: {
    _id: string;
    name: string;
    registrationNumber?: string;
    grade: number;
    totalLeaves?: number;
  };
  isPresent: boolean;
  isRecorded: boolean;
};

type SessionEntry = {
  classSession: {
    _id: string;
    grade: number;
    date: string;
    time?: string;
    subject?: string;
    /** Set once the register is closed via POST /api/classes/[id]/end. */
    endedAt?: string | null;
    batchId: { _id: string; name: string } | string;
  };
  roster: RosterEntry[];
};

const batchName = (batch: SessionEntry["classSession"]["batchId"]) =>
  typeof batch === "string" ? "Batch" : batch?.name ?? "Batch";

/**
 * Three states, not two. A student who was never scanned is "Not marked", not
 * "Absent" — only an explicit absent mark writes an Attendance row with
 * countedAsLeave, which is what feeds totalLeaves and the 2/3-leave warnings.
 * Collapsing the two is what makes the dashboard look like it disagrees with
 * itself (46/56 present, yet 0 on leave).
 */
function splitRoster(roster: RosterEntry[]) {
  return {
    present: roster.filter((r) => r.isPresent),
    absent: roster.filter((r) => r.isRecorded && !r.isPresent),
    unmarked: roster.filter((r) => !r.isRecorded),
  };
}

export default function TodayAttendancePage() {
  const [sessions, setSessions] = useState<SessionEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/attendance/today")
      .then((r) => r.json() as any)
      .then((d) => {
        if (d.error) setError(d.error);
        else setSessions(d.sessions || []);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-destructive">
        Could not load today&apos;s attendance: {error}
      </div>
    );
  }

  if (!sessions) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="animate-spin" size={18} /> Loading today&apos;s classes...
      </div>
    );
  }

  const totals = sessions.reduce(
    (acc, s) => {
      const { present, absent, unmarked } = splitRoster(s.roster);
      acc.present += present.length;
      acc.absent += absent.length;
      acc.unmarked += unmarked.length;
      acc.total += s.roster.length;
      return acc;
    },
    { present: 0, absent: 0, unmarked: 0, total: 0 }
  );

  const percent = totals.total > 0 ? Math.round((totals.present / totals.total) * 100) : 0;

  const notPresent = sessions.flatMap((s) =>
    s.roster
      .filter((r) => !r.isPresent)
      .map((r) => ({ ...r, session: s.classSession }))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Today&apos;s Attendance</h1>
        <p className="text-muted-foreground">
          {new Date().toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          {sessions.length > 0 && ` — ${sessions.length} class${sessions.length === 1 ? "" : "es"} scheduled`}
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center shadow-xs">
          <CalendarCheck className="mx-auto mb-3 text-muted-foreground" size={32} />
          <p className="font-semibold text-foreground">No classes scheduled today</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Attendance can only be recorded against a scheduled class session.
          </p>
          <Link
            href="/console/batches"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border-2 border-primary px-4 py-2 font-semibold text-primary transition-colors hover:bg-primary/10"
          >
            Schedule a class <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <SummaryTile label="Present" value={totals.present} sub={`${percent}% of ${totals.total}`} tone="text-success" bg="bg-success/10" Icon={CheckCircle2} />
            <SummaryTile label="Marked absent" value={totals.absent} sub="counted as a leave" tone="text-destructive" bg="bg-destructive/10" Icon={UserX} />
            <SummaryTile label="Not marked" value={totals.unmarked} sub="never scanned" tone="text-warning" bg="bg-warning/10" Icon={AlertTriangle} />
            <SummaryTile label="Expected" value={totals.total} sub="across all classes" tone="text-muted-foreground" bg="bg-muted" Icon={CalendarCheck} />
          </div>

          {totals.unmarked > 0 && (
            <div className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 shrink-0 text-warning" size={18} />
                <div className="text-sm">
                  <p className="font-semibold text-foreground">
                    {totals.unmarked} student{totals.unmarked === 1 ? " has" : "s have"} no attendance record today
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    They count against the attendance percentage but are <strong>not</strong> recorded as a leave, so they
                    do not raise parent warnings. Open the class and mark each one present or absent to record it properly.
                  </p>
                </div>
              </div>
              <Link
                href="/console/scanner"
                className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <ScanLine size={16} /> Open scanner
              </Link>
            </div>
          )}

          <div className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">Today&apos;s classes</h2>
            {sessions.map(({ classSession, roster }) => {
              const { present, absent, unmarked } = splitRoster(roster);
              const pct = roster.length > 0 ? Math.round((present.length / roster.length) * 100) : 0;
              return (
                <Link
                  key={classSession._id}
                  href={`/console/classes/${classSession._id}`}
                  className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 shadow-xs transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">
                      {batchName(classSession.batchId)}
                      <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        Grade {classSession.grade}
                      </span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
                      <span>
                        {classSession.time || "No time set"}
                        {classSession.subject ? ` — ${classSession.subject}` : ""}
                      </span>
                      {classSession.endedAt && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                          <Lock size={10} /> Register closed
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 text-sm">
                    <Count value={present.length} label="present" tone="text-success" />
                    <Count value={absent.length} label="absent" tone="text-destructive" />
                    {unmarked.length > 0 && <Count value={unmarked.length} label="unmarked" tone="text-warning" />}
                    <span className="tabular w-12 text-right font-bold text-foreground">{pct}%</span>
                    <ChevronRight className="text-muted-foreground" size={18} />
                  </div>
                </Link>
              );
            })}
          </div>

          <div id="absent" className="scroll-mt-6 space-y-3">
            <h2 className="text-lg font-bold text-foreground">
              Not present today{notPresent.length > 0 && ` (${notPresent.length})`}
            </h2>
            {notPresent.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground shadow-xs">
                Everyone on today&apos;s roster is marked present.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/40 text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Reg. Number</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Name</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Class</th>
                      <th className="px-4 py-3 font-semibold text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notPresent.map((r) => (
                      <tr key={`${r.session._id}-${r.student._id}`} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 text-muted-foreground">{r.student.registrationNumber || "—"}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{r.student.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {batchName(r.session.batchId)} · Grade {r.session.grade}
                        </td>
                        <td className="px-4 py-3">
                          {r.isRecorded ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
                              <UserX size={12} /> Marked absent
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
                              <AlertTriangle size={12} /> Not marked
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/console/classes/${r.session._id}`}
                            className="font-semibold text-primary hover:underline"
                          >
                            Open class
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  sub,
  tone,
  bg,
  Icon,
}: {
  label: string;
  value: number;
  sub: string;
  tone: string;
  bg: string;
  Icon: React.ComponentType<{ size?: number }>;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className={`rounded-lg ${bg} ${tone} p-1.5`}>
          <Icon size={16} />
        </span>
      </div>
      <p className={`tabular mt-2 text-3xl font-bold ${tone}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function Count({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <span className="hidden items-center gap-1.5 sm:inline-flex">
      <span className={`tabular font-bold ${tone}`}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  );
}
