"use client";

import { useEffect, useState } from "react";
import { Loader2, LineChart, Printer, Trophy } from "lucide-react";
import { examDateLabel, reportDateLabel, type AnalysisExam, type AnalysisReportFilters, type AnalysisStudentExam } from "@/lib/keda/analysis-report";

type StudentResult = {
  studentId: string;
  name: string;
  school: string | null;
  grade: number;
  exams: AnalysisStudentExam[];
  examCount: number;
  examsSat: number;
  examsTotal: number;
  examsMissed: number;
  avgMarksPercent: number | null;
  attendancePercent: number | null;
  combinedScore: number | null;
  partial: boolean;
};

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

const today = new Date();
const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

export default function AnalysisPage() {
  const [start, setStart] = useState(isoDate(thirtyDaysAgo));
  const [end, setEnd] = useState(isoDate(today));
  const [grade, setGrade] = useState("");
  const [batches, setBatches] = useState<any[]>([]);
  const [batchId, setBatchId] = useState("");
  const [results, setResults] = useState<StudentResult[] | null>(null);
  const [exams, setExams] = useState<AnalysisExam[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Filters the current results were produced with, so the printed header matches
  // the table even if the inputs were edited afterwards without re-running.
  const [reportFilters, setReportFilters] = useState<AnalysisReportFilters | null>(null);

  useEffect(() => {
    fetch("/api/batches")
      .then((r) => r.json() as any)
      .then((d) => setBatches(d.batches || []));
  }, []);

  const runReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ start, end });
      if (grade) params.set("grade", grade);
      if (batchId) params.set("batchId", batchId);
      const res = await fetch(`/api/analysis?${params}`);
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error);
      setResults(data.students);
      setExams(data.exams ?? []);
      setReportFilters({
        start,
        end,
        gradeLabel: grade ? `Grade ${grade}` : "All grades",
        batchLabel: batches.find((b) => b._id === batchId)?.name ?? "All batches",
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runReport();
  }, []);


  const gradeBatches = batches.filter((b) => !grade || b.grades?.includes(Number(grade)));

  return (
    <div className="space-y-6">
      {/* Shown only on paper: who issued the report and what it covers. */}
      {reportFilters && (
        <div className="hidden items-center gap-4 border-b border-border pb-4 print:flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/keda-logo.png" alt="" className="h-16 w-auto" />
          <div>
            <p className="text-lg font-bold">Kavery Education Development Association</p>
            <p className="text-sm">
              Student analysis: exam results and attendance, {reportDateLabel(reportFilters.start)} to {reportDateLabel(reportFilters.end)} · {reportFilters.gradeLabel} · {reportFilters.batchLabel}
            </p>
          </div>
        </div>
      )}

      <div className="print:hidden">
        <h1 className="text-3xl text-foreground">Analysis</h1>
        <p className="text-muted-foreground">
          Rank students by exam results and attendance together, over any date range.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-card p-6 shadow-xs sm:grid-cols-4 print:hidden">
        <div>
          <label className="field-label">From</label>
          <input type="date" className="field" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label className="field-label">To</label>
          <input type="date" className="field" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Grade</label>
          <select
            className="field cursor-pointer"
            value={grade}
            onChange={(e) => {
              setGrade(e.target.value);
              setBatchId("");
            }}
          >
            <option value="">All grades</option>
            <option value="3">Grade 3</option>
            <option value="4">Grade 4</option>
            <option value="5">Grade 5</option>
          </select>
        </div>
        <div>
          <label className="field-label">Batch</label>
          <select className="field cursor-pointer" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">All batches</option>
            {gradeBatches.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={runReport}
          disabled={loading}
          className="flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary/90 disabled:opacity-60 sm:col-span-4"
        >
          {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <LineChart size={16} aria-hidden />}
          Run report
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Students are ranked by the number of exams sat (most first, none last), then by average exam
          mark; attendance only breaks a tie. In the exam columns,{" "}
          <span className="font-semibold">Ab</span> = marked absent, — = no mark recorded, and a blank cell means
          the exam wasn&apos;t held for that student&apos;s batch.
        </p>
        <button
          onClick={() => window.print()}
          disabled={loading || !results || results.length === 0}
          className="flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold print:hidden text-foreground transition-colors duration-200 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Printer size={16} aria-hidden />
          Print or save as PDF
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="animate-spin text-primary" size={40} />
        </div>
      ) : !results || results.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-16 text-center">
          <Trophy size={40} className="text-muted-foreground opacity-50" aria-hidden />
          <p className="text-muted-foreground">No marks or attendance recorded in this range yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary font-medium text-secondary-foreground">
                <tr>
                  <th className="px-6 py-3">Rank</th>
                  <th className="px-6 py-3">Student</th>
                  <th className="px-6 py-3">Grade</th>
                  {exams.map((e) => (
                    <th key={e.key} className="whitespace-nowrap px-4 py-3 text-center">
                      <span className="block">{e.label}</span>
                      <span className="block text-xs font-normal opacity-80">
                        {examDateLabel(e.examDate)} · /{e.maxMarks}
                      </span>
                    </th>
                  ))}
                  <th className="px-6 py-3">Exams</th>
                  <th className="px-6 py-3">Avg. Marks</th>
                  <th className="px-6 py-3">Attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.map((r, i) => {
                  const byExam = new Map(r.exams.map((e) => [e.examKey, e]));
                  return (
                  <tr key={r.studentId} className="transition-colors duration-200 hover:bg-muted">
                    <td className="px-6 py-2.5 font-bold text-foreground">{i + 1}</td>
                    <td className="px-6 py-2.5">
                      <span className="block font-semibold text-foreground">{r.name}</span>
                      {r.school && <span className="block text-xs text-muted-foreground">{r.school}</span>}
                    </td>
                    <td className="whitespace-nowrap px-6 py-2.5 text-muted-foreground">Grade {r.grade}</td>
                    {exams.map((e) => {
                      const result = byExam.get(e.key);
                      return (
                        <td key={e.key} className="px-4 py-2.5 text-center tabular-nums">
                          {!result ? null : result.status === "sat" ? (
                            <span className="font-semibold text-foreground">{result.marks}</span>
                          ) : result.status === "absent" ? (
                            <span className="text-xs font-semibold text-destructive" title="Marked absent">
                              Ab
                            </span>
                          ) : (
                            <span className="text-muted-foreground" title="No mark recorded">
                              —
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-6 py-2.5 text-muted-foreground">
                      {r.examsTotal > 0 ? `${r.examsSat} / ${r.examsTotal}` : "0"}
                    </td>
                    <td className="px-6 py-2.5">
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                        {r.avgMarksPercent === null ? "—" : `${r.avgMarksPercent}%`}
                      </span>
                    </td>
                    <td className="px-6 py-2.5 text-muted-foreground">
                      {r.attendancePercent === null ? "—" : `${r.attendancePercent}%`}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
