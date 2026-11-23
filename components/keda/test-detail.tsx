"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import { ArrowLeft, FileSpreadsheet, Globe, Loader2, Lock, MonitorCheck, PenLine, Pencil, Search, Trash2, Trophy, X } from "lucide-react";
import { AlertModal, ConfirmDialog } from "@/components/console/confirm-dialog";
import { searchText } from "@/lib/keda/bamini";

type Paper = { _id: string; part: number | null; label: string; examDate: string; maxMarks: number; rosterCount: number; recorded: number; online: { _id: string; status: string } | null };
type Part = { examId: string; part: number | null; maxMarks: number; status: "sat" | "absent" | "missing"; marks: number | null; expected: boolean };
type Row = { student: { _id: string; name: string; registrationNumber?: string; school: string | null }; parts: Part[]; total: number | null; percent: number | null; rank: number | null; absent: boolean };
type Data = {
  test: { _id: string; name: string; kind: "test" | "model"; grade: number; batchId: { _id: string; name: string } | string; isPublished: boolean; publishedAt: string | null; maxTotal: number };
  papers: Paper[];
  rows: Row[];
  summary: { ranked: number; classAverage: number | null; maxTotal: number; unfinished: { label: string; left: number }[] };
};

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Colombo", day: "numeric", month: "short", year: "numeric" });
const batchName = (b: Data["test"]["batchId"]) => (typeof b === "object" ? b.name : "—");

/** How a row reads in a remark: "Absent for Part 2", "Absent", "Part 1 not entered". */
function remark(row: Row, papers: Paper[]) {
  if (row.absent) return "Absent";
  const absent = row.parts.filter((p) => p.status === "absent").map((p) => papers.find((x) => x._id === p.examId)?.label);
  const missing = row.parts.filter((p) => p.status === "missing" && p.expected).map((p) => papers.find((x) => x._id === p.examId)?.label);
  return [absent.length ? `Absent for ${absent.join(", ")}` : "", missing.length ? `${missing.join(", ")} not entered` : ""].filter(Boolean).join("; ");
}

/**
 * One test: its parts (each opens its own mark entry), the combined table —
 * Part 1, Part 2, total and rank, worked out on the server by combineTest, the
 * same function the parent page uses — and the one publish switch for the
 * whole test.
 */
export default function TestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const testId = params.id as string;
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/tests/${testId}`);
      setData(res.ok ? ((await res.json()) as Data) : null);
    } finally {
      setLoading(false);
    }
  }, [testId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-primary" size={40} /></div>;
  if (!data) return <div className="p-12 text-center text-muted-foreground">Test not found</div>;

  const { test, papers, rows, summary } = data;
  const twoParts = papers.length > 1;
  const canPublish = summary.unfinished.length === 0 && rows.length > 0;

  // Ranked first (by rank), then absent for everything, then nothing entered; index-number order within each.
  const group = (r: Row) => (r.rank !== null ? 0 : r.absent ? 1 : 2);
  const ordered = [...rows].sort((a, b) => group(a) - group(b) || (a.rank ?? 0) - (b.rank ?? 0));
  const q = searchText(query.trim());
  const visible = ordered.filter((r) => searchText(r.student.name).includes(q) || (r.student.registrationNumber ?? "").toLowerCase().includes(q));

  // Publishing is the gate on the parent page, for the whole test at once. Unpublishing is always allowed.
  const togglePublish = async () => {
    setPublishing(true);
    try {
      const res = await fetch(`/api/tests/${testId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPublished: !test.isPublished }) });
      if (!res.ok) setError(((await res.json()) as any).error);
      else fetchData();
    } finally {
      setPublishing(false);
    }
  };

  // The online paper for a part: opened if there is one, set up (empty, as a draft) if not.
  const openOnline = async (paper: Paper) => {
    if (paper.online) return router.push(`/console/online/${paper.online._id}`);
    const res = await fetch("/api/online-papers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examId: paper._id }) });
    const data = (await res.json()) as { paper?: { _id: string }; error?: string };
    if (res.ok && data.paper) router.push(`/console/online/${data.paper._id}`);
    else setError(data.error ?? "Could not set up the online paper");
  };

  const handleDelete = async () => {
    setConfirmDeleteOpen(false);
    const res = await fetch(`/api/tests/${testId}`, { method: "DELETE" });
    if (res.ok) router.push("/console/exams");
    else setError(((await res.json()) as any).error);
  };

  /**
   * The finished, ranked result sheet for the whole class, in rank order and never the search-filtered
   * view. An absent part exports blank with a remark rather than the 0 that marks stores for it: a 0
   * in a printed column reads as a score of nought.
   */
  const downloadResultSheet = () => {
    const sat = ordered.filter((r) => r.rank !== null);
    const sheet: (string | number | null)[][] = [
      ["Kavery Education Development Association — Result Sheet"],
      [],
      ["Test", test.name + (test.kind === "model" ? " (model exam)" : "")],
      ["Grade", `Grade ${test.grade}`],
      ["Batch", batchName(test.batchId)],
      ...papers.map((p) => [p.label, `${shortDate(p.examDate)} · out of ${p.maxMarks}`]),
      ["Total out of", summary.maxTotal],
      [],
      ["Students", rows.length],
      ["Ranked", summary.ranked],
      ["Absent for the whole test", rows.filter((r) => r.absent).length],
      ["Class average", summary.classAverage === null ? "—" : `${summary.classAverage}%`],
      ["Highest total", sat.length ? sat[0].total : "—"],
      [],
      ["Rank", "Index Number", "Student Name", "School", ...(twoParts ? papers.map((p) => p.label) : []), twoParts ? "Total" : "Marks", "Out Of", "Percentage", "Remarks"],
    ];
    for (const r of ordered) {
      sheet.push([
        r.rank ?? "—",
        r.student.registrationNumber ?? "—",
        r.student.name,
        r.student.school || "—",
        ...(twoParts ? r.parts.map((p) => (p.status === "sat" ? p.marks : "")) : []),
        r.total ?? "",
        summary.maxTotal,
        r.percent === null ? "" : `${r.percent}%`,
        remark(r, papers),
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(sheet);
    ws["!cols"] = [{ wch: 6 }, { wch: 18 }, { wch: 28 }, { wch: 28 }, ...(twoParts ? papers.map(() => ({ wch: 8 })) : []), { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Results");
    XLSX.writeFile(wb, `KEDA_${test.name.replace(/[^a-z0-9]+/gi, "_")}_Results.xlsx`);
  };

  return (
    <div className="space-y-6">
      <button onClick={() => router.push("/console/exams")} className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft size={20} /> Back to Exams
      </button>

      <div className="flex flex-col justify-between gap-6 rounded-lg border border-border bg-card p-6 shadow-xs md:flex-row md:items-center md:p-8">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">Grade {test.grade}</span>
            {test.kind === "model" && <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-on-accent">Model exam</span>}
          </div>
          <h1 className="text-2xl text-foreground md:text-3xl">{test.name}</h1>
          <p className="mt-1 text-muted-foreground">
            {batchName(test.batchId)} · Total out of {summary.maxTotal}
            {summary.classAverage !== null && ` · Class average ${summary.classAverage}%`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => setIsEditOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 font-medium text-foreground transition-colors hover:bg-muted">
            <Pencil size={16} /> Edit
          </button>
          <button onClick={() => setConfirmDeleteOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 font-medium text-destructive transition-colors hover:bg-destructive/10">
            <Trash2 size={16} /> Delete
          </button>
        </div>
      </div>

      {/* The parts. Marks are entered per part, each on its own day's roster and register. */}
      <div className={`grid gap-4 ${twoParts ? "sm:grid-cols-2" : ""}`}>
        {papers.map((p) => {
          const done = p.rosterCount > 0 && p.recorded >= p.rosterCount;
          return (
            <div key={p._id} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-5 shadow-xs">
              <div>
                <p className="text-lg font-bold text-foreground">{p.label}</p>
                <p className="text-sm text-muted-foreground">
                  {shortDate(p.examDate)} · out of {p.maxMarks}
                </p>
                <p className={`mt-1 text-sm font-semibold tabular ${done ? "text-success" : "text-muted-foreground"}`}>
                  {p.recorded}/{p.rosterCount} entered
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                <Link href={`/console/exams/paper/${p._id}`} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                  <PenLine size={16} aria-hidden /> Enter marks
                </Link>
                <button onClick={() => openOnline(p)} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-4 py-2 font-semibold text-foreground transition-colors hover:bg-muted">
                  <MonitorCheck size={16} aria-hidden /> {p.online ? "Online paper" : "Set up online"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* The gate on the parent page, for the whole test. Unpublished is the default and the safe state. */}
      <div className={`flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between ${test.isPublished ? "border-primary/30 bg-primary/5" : "border-border bg-muted/40"}`}>
        <div className="flex items-start gap-3">
          {test.isPublished ? <Globe size={20} className="mt-0.5 shrink-0 text-primary" /> : <Lock size={20} className="mt-0.5 shrink-0 text-muted-foreground" />}
          <div>
            <p className="font-bold text-foreground">{test.isPublished ? "Results are public" : "Results are not public"}</p>
            <p className="text-sm text-muted-foreground">
              {test.isPublished
                ? `Parents see ${twoParts ? "both parts and the total" : "these marks"} on the parent page${test.publishedAt ? ` · published ${shortDate(test.publishedAt)}` : ""}. Corrections show as soon as they are saved.`
                : canPublish
                  ? `Every mark is in. Publishing shows parents ${twoParts ? "both parts and the total" : "the marks"} at once.`
                  : rows.length === 0
                    ? "No students on this test's roster yet."
                    : `Publish once every part is entered: ${summary.unfinished.map((u) => `${u.label} has ${u.left} to go`).join(", ")}.`}
            </p>
          </div>
        </div>
        <button
          onClick={togglePublish}
          disabled={publishing || (!test.isPublished && !canPublish)}
          className={`flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-4 py-2 font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${test.isPublished ? "border border-border text-foreground hover:bg-muted" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
        >
          {publishing ? <Loader2 className="animate-spin" size={16} /> : test.isPublished ? <><Lock size={16} /> Unpublish</> : <><Globe size={16} /> Publish results</>}
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} aria-hidden />
            <input type="text" placeholder="Search by name or index number..." aria-label="Search students" className="field pl-12" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button
            onClick={downloadResultSheet}
            disabled={summary.ranked === 0}
            title={summary.ranked === 0 ? "Enter at least one mark first" : undefined}
            className="flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 font-bold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileSpreadsheet size={16} /> Download result sheet
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="whitespace-nowrap bg-secondary font-medium text-secondary-foreground">
              <tr>
                <th className="px-4 py-3 text-center">Rank</th>
                <th className="px-4 py-3">Index No</th>
                <th className="px-4 py-3">Student</th>
                {twoParts && papers.map((p) => <th key={p._id} className="px-4 py-3 text-right">{p.label} <span className="font-normal opacity-70">/{p.maxMarks}</span></th>)}
                <th className="px-4 py-3 text-right">{twoParts ? "Total" : "Marks"} <span className="font-normal opacity-70">/{summary.maxTotal}</span></th>
                <th className="px-4 py-3 text-right">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((r) => (
                <tr key={r.student._id} className="transition-colors duration-200 hover:bg-muted">
                  <td className="px-4 py-2.5 text-center tabular font-bold text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      {r.rank === 1 && <Trophy size={13} className="text-warning" aria-hidden />}
                      {r.rank ?? "—"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">{r.student.registrationNumber ?? "—"}</td>
                  <td className="min-w-40 px-4 py-2.5 font-semibold text-foreground">{r.student.name}</td>
                  {twoParts &&
                    r.parts.map((p) => (
                      <td key={p.examId} className="px-4 py-2.5 text-right tabular">
                        {p.status === "sat" ? (
                          <span className="text-foreground">{p.marks}</span>
                        ) : p.status === "absent" ? (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">Absent</span>
                        ) : (
                          <span className="text-muted-foreground" title={p.expected ? "Not entered yet" : "Registered after this part"}>
                            {p.expected ? "—" : "n/a"}
                          </span>
                        )}
                      </td>
                    ))}
                  <td className="px-4 py-2.5 text-right tabular font-bold text-foreground">
                    {r.total ?? (r.absent ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">Absent</span> : <span className="font-normal text-muted-foreground">—</span>)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular text-muted-foreground">{r.percent === null ? "—" : `${r.percent}%`}</td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={twoParts ? 7 : 5} className="p-12 text-center text-muted-foreground">
                    {rows.length === 0 ? `No Grade ${test.grade} students are registered in ${batchName(test.batchId)} yet.` : "No students match your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {twoParts && <p className="text-xs text-muted-foreground">The total is the parts the student sat. A part they were absent for adds nothing, and they are ranked on that total; absent for every part means no rank.</p>}

      {isEditOpen && <EditTestModal data={data} onClose={() => setIsEditOpen(false)} onSaved={() => { setIsEditOpen(false); fetchData(); }} />}
      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete this test?"
        description={`This deletes ${twoParts ? "both parts and" : ""} every mark entered for it (${papers.reduce((n, p) => n + p.recorded, 0)})${papers.some((p) => p.online) ? ", and its online paper with every answer students gave" : ""}. This cannot be undone.`}
        confirmLabel="Delete"
        tone="danger"
      />
      <AlertModal open={error !== null} onClose={() => setError(null)} title="Something went wrong" description={error ?? undefined} tone="danger" />
    </div>
  );
}

function EditTestModal({ data, onClose, onSaved }: { data: Data; onClose: () => void; onSaved: () => void }) {
  const { test, papers } = data;
  const isModel = test.kind === "model";
  const single = papers.length === 1;
  const [name, setName] = useState(test.name);
  const [dates, setDates] = useState(papers.map((p) => new Date(p.examDate).toISOString().slice(0, 10)));
  const [maxes, setMaxes] = useState(papers.map((p) => p.maxMarks));
  const [subject, setSubject] = useState(single ? papers[0].label : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/tests/${test._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          // A model exam has one date for both parts.
          papers: papers.map((p, i) => ({ id: p._id, examDate: isModel ? dates[0] : dates[i], maxMarks: maxes[i], ...(single ? { subject } : {}) })),
        }),
      });
      if (res.ok) onSaved();
      else setError(((await res.json()) as any).error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-2xl sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-start justify-between">
          <h2 className="text-xl font-bold text-foreground">Edit test</h2>
          <button onClick={onClose} aria-label="Close" className="cursor-pointer text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="field-label" htmlFor="edit-name">Name</label>
            <input id="edit-name" required className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {single && (
            <div>
              <label className="field-label" htmlFor="edit-subject">Subject</label>
              <input id="edit-subject" required className="field" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
          )}
          {isModel && (
            <div>
              <label className="field-label" htmlFor="edit-date">Date (both parts)</label>
              <input id="edit-date" type="date" required className="field" value={dates[0]} onChange={(e) => setDates(dates.map(() => e.target.value))} />
            </div>
          )}
          {papers.map((p, i) => (
            <div key={p._id} className="grid grid-cols-2 gap-4">
              {!isModel && (
                <div>
                  <label className="field-label" htmlFor={`edit-date-${i}`}>{single ? "Date" : `${p.label} date`}</label>
                  <input id={`edit-date-${i}`} type="date" required className="field" value={dates[i]} onChange={(e) => setDates(dates.map((d, j) => (j === i ? e.target.value : d)))} />
                </div>
              )}
              <div className={isModel ? "col-span-2" : undefined}>
                <label className="field-label" htmlFor={`edit-max-${i}`}>{single ? "Out of" : `${p.label} out of`}</label>
                <input id={`edit-max-${i}`} type="number" min="1" required className="field" value={maxes[i]} onChange={(e) => setMaxes(maxes.map((m, j) => (j === i ? Number(e.target.value) : m)))} />
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Changing a maximum does not rescale marks already entered.</p>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border bg-card py-2 font-medium text-foreground transition-colors hover:bg-muted">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-primary py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
              {saving ? <Loader2 className="mx-auto animate-spin" size={18} /> : "Save"}
            </button>
          </div>
        </form>
      </div>
      <AlertModal open={error !== null} onClose={() => setError(null)} title="Failed to save" description={error ?? undefined} tone="danger" />
    </div>
  );
}
