"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import { Loader2, ArrowLeft, Search, Download, Upload, Globe, CalendarX, FileSpreadsheet } from "lucide-react";
import { AlertModal } from "@/components/console/confirm-dialog";
import { searchText } from "@/lib/keda/bamini";

/**
 * Mark entry for one paper of a test (Part 1 or Part 2, or a single paper):
 * typed in row by row or uploaded from the Excel template, with absences carried
 * over from that day's register as hints. The test's own page edits, publishes
 * and deletes it, and shows the combined total.
 */
export default function ExamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params.id as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Absence hints the user has waved off. A hint is not a Marks row, so there is
  // nothing to delete when one is dismissed — it just stops being offered until
  // the next reload.
  const [dismissedHints, setDismissedHints] = useState<Set<string>>(new Set());
  const [applyingHints, setApplyingHints] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/exams/${examId}`);
      const d = await res.json() as any;
      setData(d);
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const saveOne = async (studentId: string) => {
    const value = entries[studentId];
    if (value === undefined || value === "") return;
    setSaving(true);
    try {
      await fetch(`/api/exams/${examId}/marks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, marks: Number(value) }),
      });
      setEntries((prev) => {
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
      fetchData();
    } finally {
      setSaving(false);
    }
  };

  const toggleAbsent = async (studentId: string, isAbsent: boolean, isHint = false) => {
    // Un-ticking a pre-ticked hint is not an edit — there is no Marks row behind
    // it yet. Just stop showing it, rather than writing a "present" record for a
    // student nobody has entered a mark for.
    if (isHint && !isAbsent) {
      setDismissedHints((prev) => new Set(prev).add(studentId));
      return;
    }
    setSaving(true);
    try {
      await fetch(`/api/exams/${examId}/marks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, isAbsent }),
      });
      setEntries((prev) => {
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
      fetchData();
    } finally {
      setSaving(false);
    }
  };

  /**
   * Writes the outstanding absence hints as real Marks rows, in one request.
   * This is the only thing that turns a hint into a record — opening the page
   * never does, because missing the class and missing the paper are different
   * facts and only staff can confirm the second one.
   */
  const applyAbsenceHints = async (studentIds: string[]) => {
    if (studentIds.length === 0) return;
    setApplyingHints(true);
    try {
      const res = await fetch(`/api/exams/${examId}/marks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(studentIds.map((studentId) => ({ studentId, isAbsent: true }))),
      });
      if (res.ok) {
        fetchData();
      } else {
        const err = await res.json() as any;
        setError("Failed to record absences: " + err.error);
      }
    } finally {
      setApplyingHints(false);
    }
  };

  const handleDownloadTemplate = () => {
    if (!data?.roster) return;
    // Index Number first: it is the only identifier on this sheet that staff can
    // match against a student card or the attendance export. Student ID is the
    // Mongo _id — kept because the upload joins on it, but moved to the end
    // since it means nothing to the person filling the sheet in.
    const templateData = data.roster.map((r: any) => ({
      "Index Number": r.student.registrationNumber ?? "",
      Name: r.student.name,
      "Marks (Required)": r.mark?.marks ?? 0,
      Absent: r.mark?.isAbsent ? "Yes" : "No",
      "Student ID": r.student._id,
    }));
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Marks Template");
    XLSX.writeFile(wb, `KEDA_${fileTitle(data.exam)}_Template.xlsx`);
  };

  /**
   * The finished, ranked result sheet — an output document, not the data-entry
   * template above. Built from the full roster in rank order, never from the
   * search-filtered view, so the sheet is always the whole class regardless of
   * what is typed in the search box.
   *
   * Absent papers export as blank with an "Absent" remark rather than the 0 that
   * Marks stores for them: a 0 in a printed results column reads as a score of
   * nought, which is the same reason the parent page (lib/keda/results.ts) returns null there.
   */
  const handleDownloadResultSheet = () => {
    if (!data?.roster) return;
    // Read off `data` rather than the `exam` binding destructured further down,
    // so this handler does not depend on where it sits in the component body.
    const exam = data.exam;
    const { rankedRoster: ranked, rankByStudentId: ranks, scored: sat } = buildRanking(data.roster);

    // Percentages are computed against each row's own recorded maxMarks, not the
    // exam's current value — editing Max Marks deliberately does not rescale
    // marks already entered (see the PATCH handler), so a row keeps the total it
    // was marked out of. The class average is the mean of exactly the
    // percentages printed below it, matching the public Results page's rule.
    const percentOf = (r: any) => {
      const max = r.mark?.maxMarks || exam.maxMarks;
      return max > 0 ? (r.mark.marks / max) * 100 : null;
    };
    const satPercents = sat.map(percentOf).filter((v: number | null): v is number => v !== null);
    const classAverage = satPercents.length
      ? Math.round((satPercents.reduce((a: number, b: number) => a + b, 0) / satPercents.length) * 10) / 10
      : null;
    const absentCount = ranked.filter((r: any) => r.isRecorded && r.mark.isAbsent).length;
    const notRecordedCount = ranked.filter((r: any) => !r.isRecorded).length;

    const examTitle = paperTitle(exam);
    const examDate = new Date(exam.examDate).toLocaleDateString();

    const sheet: (string | number | null)[][] = [
      ["Kavery Education Development Association — Result Sheet"],
      [],
      ["Subject", examTitle],
      ["Grade", `Grade ${exam.grade}`],
      ["Batch", exam.batchId?.name ?? "—"],
      ["Exam Date", examDate],
      ["Out Of", exam.maxMarks],
      [],
      ["Students on roster", ranked.length],
      ["Sat the exam", sat.length],
      ["Absent", absentCount],
      ["Not recorded", notRecordedCount],
      ["Class average", classAverage === null ? "—" : `${classAverage}%`],
      ["Highest mark", sat.length ? sat[0].mark.marks : "—"],
      [],
      ["Rank", "Index Number", "Student Name", "School", "Marks", "Out Of", "Percentage", "Remarks"],
    ];

    for (const r of ranked) {
      const rank = ranks.get(r.student._id);
      const isAbsent = r.isRecorded && r.mark.isAbsent;
      const percent = r.isRecorded && !isAbsent ? percentOf(r) : null;
      sheet.push([
        rank ?? "—",
        r.student.registrationNumber ?? "—",
        r.student.name,
        r.student.school || "—",
        isAbsent || !r.isRecorded ? "" : r.mark.marks,
        r.isRecorded ? r.mark.maxMarks || exam.maxMarks : exam.maxMarks,
        percent === null ? "" : `${Math.round(percent * 10) / 10}%`,
        isAbsent ? "Absent" : r.isRecorded ? "" : "Not recorded",
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(sheet);
    ws["!cols"] = [{ wch: 6 }, { wch: 18 }, { wch: 28 }, { wch: 28 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Results");
    const isoDate = new Date(exam.examDate).toISOString().slice(0, 10);
    XLSX.writeFile(wb, `KEDA_${fileTitle(exam)}_${isoDate}_Results.xlsx`);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const wb = XLSX.read(event.target?.result, { type: "binary" });
        const wsData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        // Fall back to the index number when Student ID is blank — staff do add
        // rows by hand, and the index number is the column they can actually
        // read off a student card. Rows that match neither are dropped rather
        // than posted with an undefined studentId, which would 500 on validation.
        const byIndexNumber = new Map<string, string>(
          (data?.roster ?? [])
            .filter((r: any) => r.student.registrationNumber)
            .map((r: any) => [String(r.student.registrationNumber).trim().toUpperCase(), r.student._id])
        );
        const unmatched: string[] = [];
        const payload = wsData
          .map((row: any) => {
            const isAbsent = String(row["Absent"] ?? "").trim().toLowerCase() === "yes";
            const indexNumber = String(row["Index Number"] ?? "").trim().toUpperCase();
            const studentId = row["Student ID"] || byIndexNumber.get(indexNumber);
            if (!studentId) {
              if (indexNumber || row["Name"]) unmatched.push(indexNumber || String(row["Name"]));
              return null;
            }
            return {
              studentId,
              marks: isAbsent ? 0 : Number(row["Marks (Required)"]),
              isAbsent,
            };
          })
          .filter(Boolean);

        if (payload.length === 0) {
          setError(
            unmatched.length > 0
              ? `No rows matched a student on this roster. Unrecognised: ${unmatched.slice(0, 5).join(", ")}${unmatched.length > 5 ? "…" : ""}`
              : "That sheet had no rows to import."
          );
          return;
        }
        const res = await fetch(`/api/exams/${examId}/marks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          fetchData();
        } else {
          const err = await res.json() as any;
          setError("Failed to upload marks: " + err.error);
        }
      } catch (err: any) {
        console.error(err);
        setError("Error reading Excel file.");
      } finally {
        setSaving(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsBinaryString(file);
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-primary" size={40} /></div>;
  if (!data?.exam) return <div className="p-12 text-center text-muted-foreground">Exam not found</div>;

  const { exam, roster } = data;
  const recordedCount = roster.filter((r: any) => r.isRecorded).length;

  // Hints still on offer: suggested by the register, not yet waved off, and not
  // already overridden by a mark (the API stops suggesting once one exists).
  const pendingHints = roster.filter((r: any) => r.suggestedAbsent && !dismissedHints.has(r.student._id));

  // One ranking, shared by the table and the downloadable result sheet, so the
  // two can never disagree about who came first.
  const { scored, rankByStudentId, rankedRoster } = buildRanking(roster);

  const query = searchText(searchQuery.trim());
  const filteredRoster = rankedRoster.filter(
    (r: any) =>
      searchText(r.student.name).includes(query) ||
      (r.student.registrationNumber ?? "").toLowerCase().includes(query)
  );

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push(exam.testId ? `/console/exams/${exam.testId}` : "/console/exams")}
        className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={20} /> Back to {exam.name ?? "Exams"}
      </button>

      <div className="flex flex-col justify-between gap-6 rounded-lg border border-border bg-card p-6 shadow-xs md:flex-row md:items-center md:p-8">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">Grade {exam.grade}</span>
            {exam.isPublished && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                <Globe size={12} aria-hidden /> Public: corrections show to parents when saved
              </span>
            )}
          </div>
          <h1 className="text-2xl text-foreground md:text-3xl">{paperTitle(exam)}</h1>
          <p className="mt-1 text-muted-foreground">
            {exam.batchId?.name} · {new Date(exam.examDate).toLocaleDateString()} · Out of {exam.maxMarks}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-25 flex-col items-center justify-center rounded-lg bg-primary/10 p-4">
            <span className="tabular text-2xl font-bold text-primary">
              {recordedCount}
              <span className="text-sm font-normal text-primary/70">/{roster.length}</span>
            </span>
            <span className="mt-1 text-xs font-bold uppercase text-primary">Recorded</span>
          </div>
          {/* The other part of the same test, one click away. */}
          {data.parts?.length > 1 &&
            data.parts
              .filter((p: any) => p._id !== exam._id)
              .map((p: any) => (
                <Link key={p._id} href={`/console/exams/paper/${p._id}`} className="rounded-lg border border-border px-3 py-2 font-medium text-foreground transition-colors hover:bg-muted">
                  {p.label} marks
                </Link>
              ))}
        </div>
      </div>

      {/* Carried over from the class register for this exam's date. Only an
          explicitly marked absence produces a hint — a student with no
          attendance row at all is "not marked", not absent, so the register
          never having been closed leaves this banner off entirely. */}
      {pendingHints.length > 0 && (
        <div className="flex flex-col gap-4 rounded-lg border border-warning/30 bg-warning/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CalendarX size={20} className="mt-0.5 shrink-0 text-warning" />
            <div>
              <p className="font-bold text-foreground">
                {pendingHints.length} student{pendingHints.length === 1 ? " was" : "s were"} marked absent in class on{" "}
                {new Date(exam.examDate).toLocaleDateString()}
              </p>
              <p className="text-sm text-muted-foreground">
                Their Absent boxes are pre-ticked below. Nothing is saved until you apply them — un-tick anyone who
                sat the paper anyway.
              </p>
            </div>
          </div>
          <button
            onClick={() => applyAbsenceHints(pendingHints.map((r: any) => r.student._id))}
            disabled={applyingHints}
            className="flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {applyingHints ? <Loader2 className="animate-spin" size={16} /> : <>Mark {pendingHints.length} absent</>}
          </button>
        </div>
      )}

      {data.attendance?.sessionCount === 0 && recordedCount === 0 && (
        <p className="text-sm text-muted-foreground">
          No class register was taken on {new Date(exam.examDate).toLocaleDateString()}, so no absences were carried
          over. Close that day&apos;s register first if you want them filled in automatically.
        </p>
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4 sm:flex-row">
        <button
          onClick={handleDownloadTemplate}
          className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-primary py-3 font-bold text-primary transition-colors hover:bg-primary/10"
        >
          <Download size={18} /> Download Excel Template
        </button>
        <div className="relative flex-1">
          <input
            type="file"
            accept=".xlsx, .xls"
            ref={fileInputRef}
            onChange={handleFileUpload}
            disabled={saving}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
          <div className="flex h-full w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-primary-foreground transition-colors hover:bg-primary/90">
            {saving ? <Loader2 className="animate-spin" size={18} /> : <><Upload size={18} /> Upload Filled Template</>}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
            <input
              type="text"
              placeholder="Search by name or index number..."
              className="field pl-12"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {/* Exports the whole class in rank order, not the filtered view. */}
          <button
            onClick={handleDownloadResultSheet}
            disabled={recordedCount === 0}
            title={recordedCount === 0 ? "Enter at least one mark first" : undefined}
            className="flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 font-bold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileSpreadsheet size={16} /> Download Result Sheet
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-secondary font-medium text-secondary-foreground">
              <tr>
                <th className="px-4 py-3 text-center">Rank</th>
                <th className="px-4 py-3">Index No</th>
                <th className="px-6 py-3">Student</th>
                <th className="px-6 py-3 text-center">Absent</th>
                <th className="px-6 py-3 text-right">Marks (out of {exam.maxMarks})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRoster.map((r: any) => {
                const isHinted = r.suggestedAbsent && !dismissedHints.has(r.student._id);
                // A hint shows as ticked but is not a record — see applyAbsenceHints.
                const isAbsent = Boolean(r.mark?.isAbsent) || isHinted;
                const rank = rankByStudentId.get(r.student._id);
                return (
                <tr key={r.student._id} className={`transition-colors duration-200 hover:bg-muted ${isHinted ? "bg-warning/5" : ""}`}>
                  <td className="px-4 py-2.5 text-center tabular font-bold text-muted-foreground">{rank ?? "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {r.student.registrationNumber ?? "—"}
                  </td>
                  <td className="px-6 py-2.5 font-semibold text-foreground">
                    {r.student.name}
                    {isHinted && (
                      <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase text-warning">
                        Absent in class
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={isAbsent}
                      onChange={(e) => toggleAbsent(r.student._id, e.target.checked, isHinted)}
                      aria-label={`Mark ${r.student.name} absent`}
                    />
                  </td>
                  <td className="px-6 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      {isAbsent ? (
                        <span className="w-24 rounded-lg border border-dashed border-border py-2 text-center text-xs font-bold uppercase text-muted-foreground">
                          Absent
                        </span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          max={exam.maxMarks}
                          className="field w-24 text-center"
                          placeholder={r.mark ? String(r.mark.marks) : "—"}
                          value={entries[r.student._id] ?? ""}
                          onChange={(e) => setEntries({ ...entries, [r.student._id]: e.target.value })}
                          onBlur={() => saveOne(r.student._id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                        />
                      )}
                      {r.isRecorded && entries[r.student._id] === undefined && (
                        <span className="text-xs font-bold text-success">Saved</span>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
              {filteredRoster.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-muted-foreground">
                    {roster.length === 0
                      ? `No Grade ${exam.grade} students are registered in ${exam.batchId?.name ?? "this batch"} yet.`
                      : "No students match your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AlertModal open={error !== null} onClose={() => setError(null)} title="Something went wrong" description={error ?? undefined} tone="danger" />
    </div>
  );
}

/**
 * Standard competition ranking (1, 2, 2, 4) over the marks actually entered,
 * absentees excluded — the same rule the parent page (lib/keda/results.ts) applies, so a parent
 * and a member of staff never see two different ranks for one exam.
 *
 * rankedRoster keys off the *saved* mark, not the value being typed: a row only
 * moves once its mark is committed on blur, so nothing jumps out from under the
 * cursor mid-entry. Students with no mark yet hold at the bottom in index-number
 * order, which is where entry happens.
 */
function buildRanking(roster: any[]) {
  const scored = roster
    .filter((r: any) => r.isRecorded && !r.mark.isAbsent)
    .sort((a: any, b: any) => b.mark.marks - a.mark.marks);

  const rankByStudentId = new Map<string, number>();
  scored.forEach((r: any, i: number) => {
    const tiedWithPrevious = i > 0 && scored[i - 1].mark.marks === r.mark.marks;
    rankByStudentId.set(
      r.student._id,
      tiedWithPrevious ? rankByStudentId.get(scored[i - 1].student._id)! : i + 1
    );
  });

  const rankedRoster = [...roster].sort((a: any, b: any) => {
    const group = (r: any) => (r.isRecorded && !r.mark.isAbsent ? 0 : r.isRecorded ? 1 : 2);
    if (group(a) !== group(b)) return group(a) - group(b);
    if (group(a) === 0) return b.mark.marks - a.mark.marks;
    return 0; // already in index-number order from the API
  });

  return { scored, rankByStudentId, rankedRoster };
}

/** "Term test 3 — Part 1", or a single paper's "Quiz — Mathematics". */
const paperTitle = (exam: any) => (exam.name ? `${exam.name} — ${exam.label ?? exam.subject}` : exam.label ?? exam.subject);
const fileTitle = (exam: any) => paperTitle(exam).replace(/[^a-z0-9]+/gi, "_");
