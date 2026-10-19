"use client";

import { Trophy, TrendingUp, TrendingDown, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The panel every block of the results page sits in. */
function GlassCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("live-card", className)}>{children}</div>;
}

type Part = { part: number | null; subject: string; examDate: string; maxMarks: number; status: "sat" | "absent" | "missing"; marks: number | null };

type TestResult = {
  testId: string;
  name: string;
  kind: "test" | "model";
  date: string;
  parts: Part[];
  total: number | null;
  maxTotal: number;
  percent: number | null;
  isAbsent: boolean;
  classAverage: number | null;
  rank: number | null;
  outOf: number;
};

type Placing = { testsPublished: number; testsCounted: number; averagePercent: number | null; rank: number | null; outOf: number };

export type ResultsPayload = {
  student: {
    name: string;
    grade: number;
    registrationNumber: string;
    batchName: string | null;
  };
  results: TestResult[];
  summary: (Placing & { subjects: { part: number | null; subject: string; averagePercent: number; testsCounted: number }[] }) | null;
  modelSummary: Placing | null;
};

// Day-first, matching how dates are written locally, and identical in both
// locales — the cards are dense enough without month names changing width.
const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", { timeZone: "Asia/Colombo", day: "numeric", month: "short", year: "numeric" });

/**
 * One student's published results: headline numbers, strongest and weakest
 * paper, then one card per test with Part 1, Part 2 and their total. Model
 * exams are listed and summarised on their own. The parent page signs the
 * parent in and hands the data over; this only draws it.
 */
export default function ResultsView({ data }: { data: ResultsPayload }) {
  const t = useTranslations("ResultsPage");
  const paperName = (p: { part: number | null; subject: string }) => (p.part ? t("part", { part: p.part }) : p.subject);

  const subjects = data.summary?.subjects ?? [];
  const strongest = subjects[0];
  // Only call out a weakest paper when there is a spread to talk about —
  // with one paper, "strongest" and "needs work" would be the same row.
  const weakest = subjects.length > 1 ? subjects[subjects.length - 1] : null;
  const tests = data.results.filter((r) => r.kind === "test");
  const models = data.results.filter((r) => r.kind === "model");

  if (data.results.length === 0) {
    return (
      <GlassCard className="p-8 text-center">
        <h3 className="font-display text-xl font-bold text-fg">{t("empty_title")}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{t("empty_body")}</p>
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {data.summary && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Headline label={t("average")} value={data.summary.averagePercent} suffix="%" note={t("exams_counted", { count: data.summary.testsCounted })} />
          <Headline label={t("rank")} value={data.summary.rank} note={data.summary.rank !== null ? t("of_students", { total: data.summary.outOf }) : ""} />
          <GlassCard className="flex flex-col justify-center gap-3 p-5">
            {strongest && <PaperTrend icon={<TrendingUp size={16} className="shrink-0 text-accent" />} label={t("strongest")} name={paperName(strongest)} percent={strongest.averagePercent} strong />}
            {weakest && <PaperTrend icon={<TrendingDown size={16} className="shrink-0 text-muted-foreground" />} label={t("weakest")} name={paperName(weakest)} percent={weakest.averagePercent} />}
          </GlassCard>
        </div>
      )}

      {tests.length > 0 && (
        <section className="flex flex-col gap-3">
          {models.length > 0 && <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("tests_heading")}</h3>}
          {tests.map((r) => (
            <TestCard key={r.testId} result={r} paperName={paperName} />
          ))}
        </section>
      )}

      {models.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("models_heading")}</h3>
          {data.modelSummary && (
            <div className="grid grid-cols-2 gap-4">
              <Headline label={t("average")} value={data.modelSummary.averagePercent} suffix="%" note={t("exams_counted", { count: data.modelSummary.testsCounted })} />
              <Headline label={t("rank")} value={data.modelSummary.rank} note={data.modelSummary.rank !== null ? t("of_students", { total: data.modelSummary.outOf }) : ""} />
            </div>
          )}
          {models.map((r) => (
            <TestCard key={r.testId} result={r} paperName={paperName} />
          ))}
        </section>
      )}

      {/* How the numbers were arrived at — a rank with no stated basis
          invites the wrong reading, especially where absences are involved. */}
      <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2/30 p-4">
        <Info size={16} className="mt-0.5 shrink-0 text-accent" />
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-accent">{t("note_title")}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("note_body")}</p>
        </div>
      </div>
    </div>
  );
}

function Headline({ label, value, suffix, note }: { label: string; value: number | null; suffix?: string; note: string }) {
  return (
    <GlassCard className="p-5 text-center">
      <p className="text-xs font-bold uppercase tracking-widest text-accent">{label}</p>
      <p className="mt-2 font-display text-4xl font-extrabold tabular-nums text-accent">
        {value ?? "—"}
        {value !== null && suffix && <span className="text-2xl">{suffix}</span>}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </GlassCard>
  );
}

function PaperTrend({ icon, label, name, percent, strong }: { icon: ReactNode; label: string; name: string; percent: number; strong?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      {icon}
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-bold text-fg">
          {name} <span className={cn("tabular-nums", strong ? "text-accent" : "text-muted-foreground")}>{percent}%</span>
        </p>
      </div>
    </div>
  );
}

/** One test: its parts, the total, the class average and the rank. */
function TestCard({ result: r, paperName }: { result: TestResult; paperName: (p: { part: number | null; subject: string }) => string }) {
  const t = useTranslations("ResultsPage");
  const twoParts = r.parts.length > 1;
  // Parts sat on different days each show their own date; one day is shown once, in the header.
  const oneDay = new Set(r.parts.map((p) => formatDate(p.examDate))).size === 1;
  const absentParts = r.parts.filter((p) => p.status === "absent");

  return (
    <GlassCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold wrap-break-word text-fg">{r.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {oneDay && <span>{formatDate(r.date)}</span>}
            {r.kind === "model" && <span className="rounded-full bg-accent px-2 py-0.5 font-bold text-on-accent">{t("model_badge")}</span>}
          </p>
        </div>
        {r.isAbsent ? (
          <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-muted-foreground">{t("absent")}</span>
        ) : (
          <span className="shrink-0 rounded-full bg-surface-2/40 px-3 py-1 text-sm font-bold tabular-nums text-accent">{r.percent}%</span>
        )}
      </div>

      {r.isAbsent ? (
        // Absent for every part: the stored zeros would read as a score of nought, so none are shown.
        <p className="mt-3 text-xs text-muted-foreground">{t("absent_note")}</p>
      ) : (
        <>
          <dl className="mt-4 divide-y divide-line border-t border-line text-sm">
            {twoParts &&
              r.parts.map((p) => (
                <div key={p.part ?? p.subject} className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-muted-foreground">
                    {paperName(p)}
                    {!oneDay && <span className="ml-2 text-xs">{formatDate(p.examDate)}</span>}
                  </dt>
                  <dd className="tabular-nums text-fg">
                    {p.status === "sat" ? (
                      <>
                        {p.marks}
                        <span className="text-muted-foreground">/{p.maxMarks}</span>
                      </>
                    ) : (
                      <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-muted-foreground">{p.status === "absent" ? t("absent") : t("not_entered")}</span>
                    )}
                  </dd>
                </div>
              ))}
            <div className="flex items-center justify-between gap-3 py-2.5">
              <dt className="font-bold text-fg">{twoParts ? t("total") : t("col_marks")}</dt>
              <dd className="font-bold tabular-nums text-fg">
                {r.total}
                <span className="font-normal text-muted-foreground">/{r.maxTotal}</span>
              </dd>
            </div>
          </dl>

          <dl className="mt-1 grid grid-cols-2 gap-3 border-t border-line pt-3 text-center">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("col_class_avg")}</dt>
              <dd className="mt-1 text-sm font-bold tabular-nums text-muted-foreground">{r.classAverage !== null ? `${r.classAverage}%` : "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t("col_rank")}</dt>
              <dd className="mt-1 inline-flex items-center gap-1 text-sm font-bold tabular-nums text-fg">
                {r.rank === 1 && <Trophy size={12} className="text-accent" />}
                {r.rank}/{r.outOf}
              </dd>
            </div>
          </dl>

          {twoParts && absentParts.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{t("part_absent_note", { part: absentParts.map(paperName).join(", ") })}</p>}
        </>
      )}
    </GlassCard>
  );
}
