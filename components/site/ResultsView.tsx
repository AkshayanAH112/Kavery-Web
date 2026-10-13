"use client";

import { useMemo, useState } from "react";
import { Trophy, TrendingUp, TrendingDown, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The panel every block of the results page sits in. */
function GlassCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("live-card", className)}>{children}</div>;
}

type ExamResult = {
  examId: string;
  name: string | null;
  subject: string;
  examDate: string;
  maxMarks: number;
  isAbsent: boolean;
  marks: number | null;
  percent: number | null;
  classAverage: number | null;
  rank: number | null;
  outOf: number;
};

export type ResultsPayload = {
  student: {
    name: string;
    grade: number;
    registrationNumber: string;
    batchName: string | null;
  };
  results: ExamResult[];
  summary: {
    examsPublished: number;
    examsCounted: number;
    averagePercent: number | null;
    rank: number | null;
    outOf: number;
    subjects: { subject: string; averagePercent: number; examsCounted: number }[];
  } | null;
};

// Day-first, matching how dates are written locally, and identical in both
// locales — the table is dense enough without month names changing width.
const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const examLabel = (exam: ExamResult) =>
  exam.name ? `${exam.subject} — ${exam.name}` : exam.subject;

/**
 * One student's published results: headline numbers, strongest and weakest
 * subject, and the paper-by-paper table. The parent page signs the parent in and
 * hands the data over; this only draws it.
 */
export default function ResultsView({ data }: { data: ResultsPayload }) {
  const t = useTranslations("ResultsPage");
  const [examFilter, setExamFilter] = useState("all");

  const visibleResults = useMemo(() => (examFilter === "all" ? data.results : data.results.filter((r) => r.examId === examFilter)), [data, examFilter]);

  const subjects = data.summary?.subjects ?? [];
  const strongest = subjects[0];
  // Only call out a weakest subject when there is a spread to talk about —
  // with one subject, "strongest" and "needs work" would be the same row.
  const weakest = subjects.length > 1 ? subjects[subjects.length - 1] : null;

  return (
    <div className="flex flex-col gap-6">
          {data.results.length === 0 || !data.summary ? (
            <GlassCard className="p-8 text-center">
              <h3 className="font-display text-xl font-bold text-fg">
                {t("empty_title")}
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                {t("empty_body")}
              </p>
            </GlassCard>
          ) : (
            <>
              {/* Headline numbers */}
              <div className="grid gap-4 sm:grid-cols-3">
                <GlassCard className="p-5 text-center">
                  <p className="text-xs font-bold uppercase tracking-widest text-accent">
                    {t("average")}
                  </p>
                  <p className="mt-2 font-display text-4xl font-extrabold tabular-nums text-accent">
                    {data.summary.averagePercent ?? "—"}
                    {data.summary.averagePercent !== null && (
                      <span className="text-2xl">%</span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("exams_counted", { count: data.summary.examsCounted })}
                  </p>
                </GlassCard>

                <GlassCard className="p-5 text-center">
                  <p className="text-xs font-bold uppercase tracking-widest text-accent">
                    {t("rank")}
                  </p>
                  <p className="mt-2 font-display text-4xl font-extrabold tabular-nums text-accent">
                    {data.summary.rank ?? "—"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.summary.rank !== null && t("of_students", { total: data.summary.outOf })}
                  </p>
                </GlassCard>

                <GlassCard className="flex flex-col justify-center gap-3 p-5">
                  {strongest && (
                    <div className="flex items-center gap-2.5">
                      <TrendingUp size={16} className="shrink-0 text-accent" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          {t("strongest")}
                        </p>
                        <p className="truncate text-sm font-bold text-fg">
                          {strongest.subject}{" "}
                          <span className="tabular-nums text-accent">
                            {strongest.averagePercent}%
                          </span>
                        </p>
                      </div>
                    </div>
                  )}
                  {weakest && (
                    <div className="flex items-center gap-2.5">
                      <TrendingDown size={16} className="shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          {t("weakest")}
                        </p>
                        <p className="truncate text-sm font-bold text-fg">
                          {weakest.subject}{" "}
                          <span className="tabular-nums text-muted-foreground">
                            {weakest.averagePercent}%
                          </span>
                        </p>
                      </div>
                    </div>
                  )}
                </GlassCard>
              </div>

              {/* Per-exam filter */}
              <div className="flex flex-wrap items-center gap-3">
                <label
                  htmlFor="examFilter"
                  className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                >
                  {t("filter_label")}
                </label>
                <select
                  id="examFilter"
                  value={examFilter}
                  onChange={(e) => setExamFilter(e.target.value)}
                  className="cursor-pointer rounded-full border border-line bg-surface-2 px-4 py-2 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <option value="all">{t("filter_all")}</option>
                  {data.results.map((exam) => (
                    <option key={exam.examId} value={exam.examId}>
                      {examLabel(exam)} · {formatDate(exam.examDate)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Desktop table */}
              <GlassCard className="hidden overflow-hidden p-0 md:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-line bg-surface-2/40">
                      <tr className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        <th className="px-5 py-3">{t("col_exam")}</th>
                        <th className="px-5 py-3">{t("col_date")}</th>
                        <th className="px-5 py-3">{t("col_marks")}</th>
                        <th className="px-5 py-3">{t("col_percent")}</th>
                        <th className="px-5 py-3">{t("col_class_avg")}</th>
                        <th className="px-5 py-3">{t("col_rank")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {visibleResults.map((exam) => (
                        <tr key={exam.examId} className="transition-colors hover:bg-surface-2/30">
                          <td className="px-5 py-3.5 font-semibold text-fg">
                            {examLabel(exam)}
                          </td>
                          <td className="px-5 py-3.5 text-muted-foreground">
                            {formatDate(exam.examDate)}
                          </td>
                          {exam.isAbsent ? (
                            // An absent paper stores marks as 0. Rendering that
                            // zero would read to a parent as a score of nought,
                            // so the whole row collapses to one honest label.
                            <td colSpan={4} className="px-5 py-3.5">
                              <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-muted-foreground">
                                {t("absent")}
                              </span>
                              <span className="ml-2 text-xs text-muted-foreground">
                                {t("absent_note")}
                              </span>
                            </td>
                          ) : (
                            <>
                              <td className="px-5 py-3.5 tabular-nums text-fg">
                                {exam.marks}
                                <span className="text-muted-foreground">/{exam.maxMarks}</span>
                              </td>
                              <td className="px-5 py-3.5">
                                <span className="rounded-full bg-surface-2/40 px-2.5 py-1 text-xs font-bold tabular-nums text-accent">
                                  {exam.percent}%
                                </span>
                              </td>
                              <td className="px-5 py-3.5 tabular-nums text-muted-foreground">
                                {exam.classAverage !== null ? `${exam.classAverage}%` : "—"}
                              </td>
                              <td className="px-5 py-3.5 tabular-nums text-fg">
                                <span className="inline-flex items-center gap-1.5">
                                  {exam.rank === 1 && (
                                    <Trophy size={13} className="text-accent" />
                                  )}
                                  {exam.rank}
                                  <span className="text-muted-foreground">/{exam.outOf}</span>
                                </span>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>

              {/* Mobile cards — the same six values, stacked, because a
                  six-column table on a 360px phone is unreadable either
                  scrolled sideways or squeezed. */}
              <div className="flex flex-col gap-3 md:hidden">
                {visibleResults.map((exam) => (
                  <GlassCard key={exam.examId} className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold wrap-break-word text-fg">
                          {examLabel(exam)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(exam.examDate)}
                        </p>
                      </div>
                      {exam.isAbsent ? (
                        <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-muted-foreground">
                          {t("absent")}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-surface-2/40 px-3 py-1 text-sm font-bold tabular-nums text-accent">
                          {exam.percent}%
                        </span>
                      )}
                    </div>

                    {exam.isAbsent ? (
                      <p className="mt-3 text-xs text-muted-foreground">{t("absent_note")}</p>
                    ) : (
                      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3 text-center">
                        <div>
                          <dt className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            {t("col_marks")}
                          </dt>
                          <dd className="mt-1 text-sm font-bold tabular-nums text-fg">
                            {exam.marks}/{exam.maxMarks}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            {t("col_class_avg")}
                          </dt>
                          <dd className="mt-1 text-sm font-bold tabular-nums text-muted-foreground">
                            {exam.classAverage !== null ? `${exam.classAverage}%` : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            {t("col_rank")}
                          </dt>
                          <dd className="mt-1 inline-flex items-center gap-1 text-sm font-bold tabular-nums text-fg">
                            {exam.rank === 1 && <Trophy size={12} className="text-accent" />}
                            {exam.rank}/{exam.outOf}
                          </dd>
                        </div>
                      </dl>
                    )}
                  </GlassCard>
                ))}
              </div>

              {/* How the numbers were arrived at — a rank with no stated basis
                  invites the wrong reading, especially where absences are
                  involved. */}
              <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2/30 p-4">
                <Info size={16} className="mt-0.5 shrink-0 text-accent" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-accent">
                    {t("note_title")}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {t("note_body")}
                  </p>
                </div>
              </div>
            </>
          )}
    </div>
  );
}
