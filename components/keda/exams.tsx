"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, GraduationCap, X, Globe } from "lucide-react";
import { AlertModal } from "@/components/console/confirm-dialog";

type PaperSummary = { _id: string; part: number | null; label: string; examDate: string; maxMarks: number; recorded: number; rosterCount: number };

type TestSummary = {
  _id: string;
  name: string;
  kind: "test" | "model";
  grade: number;
  batchId: { _id: string; name: string } | null;
  date: string;
  maxTotal: number;
  isPublished: boolean;
  papers: PaperSummary[];
  classAverage: number | null;
};

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Colombo", day: "numeric", month: "short", year: "numeric" });

export default function MarksPage() {
  const router = useRouter();
  const [tests, setTests] = useState<TestSummary[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewOpen, setIsNewOpen] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/tests").then((r) => r.json() as any), fetch("/api/batches").then((r) => r.json() as any)])
      .then(([t, b]) => {
        setTests(t.tests || []);
        setBatches(b.batches || []);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Exams &amp; Results</h1>
          <p className="text-muted-foreground">
            A test is Part 1 and Part 2, marked separately and published together with their total. Click a test to enter marks.
          </p>
        </div>
        <button
          onClick={() => setIsNewOpen(true)}
          className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary/90"
        >
          <Plus size={18} aria-hidden /> New test
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="animate-spin text-primary" size={40} />
        </div>
      ) : tests.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-16 text-center">
          <GraduationCap size={40} className="text-muted-foreground opacity-50" aria-hidden />
          <p className="text-muted-foreground">No tests created yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary font-medium text-secondary-foreground">
                <tr>
                  <th className="px-6 py-3">Test</th>
                  <th className="px-6 py-3">Grade</th>
                  <th className="px-6 py-3">Batch</th>
                  <th className="px-6 py-3">Papers</th>
                  <th className="px-6 py-3">Average</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tests.map((test) => (
                  <tr key={test._id} onClick={() => router.push(`/console/exams/${test._id}`)} className="cursor-pointer align-top transition-colors duration-200 hover:bg-muted">
                    <td className="px-6 py-3 font-semibold text-foreground">
                      <span className="flex flex-wrap items-center gap-2">
                        {test.name}
                        {test.kind === "model" && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-accent">Model exam</span>}
                        {test.isPublished && (
                          <span title="Parents can see these results" className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                            <Globe size={10} aria-hidden /> Public
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">Out of {test.maxTotal}</span>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">Grade {test.grade}</td>
                    <td className="px-6 py-3 text-muted-foreground">{test.batchId?.name ?? "—"}</td>
                    <td className="px-6 py-3">
                      <ul className="space-y-1">
                        {test.papers.map((p) => (
                          <li key={p._id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                            <span className="font-semibold text-foreground">{p.label}</span>
                            <span className="text-muted-foreground">{shortDate(p.examDate)}</span>
                            <span className={`tabular font-semibold ${p.rosterCount > 0 && p.recorded >= p.rosterCount ? "text-success" : "text-muted-foreground"}`}>
                              {p.recorded}/{p.rosterCount} entered
                            </span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-6 py-3">
                      {test.classAverage !== null ? (
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{Math.round(test.classAverage)}%</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">No marks yet</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isNewOpen && (
        <NewTestModal
          batches={batches}
          onClose={() => setIsNewOpen(false)}
          onCreated={(testId) => {
            setIsNewOpen(false);
            router.push(`/console/exams/${testId}`);
          }}
        />
      )}
    </div>
  );
}

type Shape = "parts" | "model" | "single";

const SHAPES: { value: Shape; label: string; hint: string }[] = [
  { value: "parts", label: "Part 1 + Part 2", hint: "A class test. The parts can be on the same day or on different days." },
  { value: "model", label: "Model exam", hint: "A full mock: Part 1 and Part 2 sat on one day, like the real exam." },
  { value: "single", label: "Single paper", hint: "One paper, e.g. a subject quiz." },
];

function NewTestModal({ batches, onClose, onCreated }: { batches: any[]; onClose: () => void; onCreated: (testId: string) => void }) {
  const gradeBatches = (grade: string) => batches.filter((b) => b.grades?.includes(Number(grade)));

  const [shape, setShape] = useState<Shape>("parts");
  const [grade, setGrade] = useState("5");
  const [batchId, setBatchId] = useState(gradeBatches("5")[0]?._id ?? "");
  const [name, setName] = useState("");
  const [date1, setDate1] = useState("");
  const [date2, setDate2] = useState("");
  const [max1, setMax1] = useState(100);
  const [max2, setMax2] = useState(100);
  const [subject, setSubject] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<any[]>([]);

  // A batch's declared `grades` (its intake coverage) can drift from which
  // grade its actually-registered students are in now — e.g. after a year of
  // promotions. Cross-checking against real students here, instead of trusting
  // `batches`, is what stops a test from being created against an empty roster.
  useEffect(() => {
    fetch("/api/students").then((r) => r.json() as any).then((d) => setStudents(d.students || []));
  }, []);

  const eligibleCount = students.filter((s) => String(s.grade) === grade && s.batchId?._id === batchId).length;

  const handleGradeChange = (g: string) => {
    setGrade(g);
    setBatchId(gradeBatches(g)[0]?._id ?? "");
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const papers =
      shape === "single"
        ? [{ examDate: date1, maxMarks: max1, subject }]
        : [
            { examDate: date1, maxMarks: max1 },
            // Part 2 defaults to Part 1's day; a model exam is always one day.
            { examDate: shape === "model" ? date1 : date2 || date1, maxMarks: max2 },
          ];
    try {
      const res = await fetch("/api/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, kind: shape === "model" ? "model" : "test", grade: Number(grade), batchId, papers }),
      });
      const data = (await res.json()) as any;
      if (res.ok) onCreated(data.test._id);
      else setError(data.error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-2xl sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-start justify-between">
          <h2 className="text-xl font-bold text-foreground">New test</h2>
          <button onClick={onClose} aria-label="Close" className="cursor-pointer text-muted-foreground hover:text-foreground">
            <X size={20} aria-hidden />
          </button>
        </div>

        <form onSubmit={create} className="space-y-4">
          <fieldset>
            <legend className="field-label">Type</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {SHAPES.map((s) => (
                <label key={s.value} className={`flex cursor-pointer flex-col rounded-xl border p-3 text-sm transition-colors ${shape === s.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
                  <span className="flex items-center gap-2 font-semibold text-foreground">
                    <input type="radio" name="shape" value={s.value} checked={shape === s.value} onChange={() => setShape(s.value)} />
                    {s.label}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{SHAPES.find((s) => s.value === shape)!.hint}</p>
          </fieldset>

          <div>
            <label className="field-label" htmlFor="test-name">Name</label>
            <input id="test-name" required className="field" placeholder={shape === "model" ? "e.g. Model exam 2" : "e.g. Term test 3"} value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="test-grade">Grade</label>
              <select id="test-grade" className="field cursor-pointer" value={grade} onChange={(e) => handleGradeChange(e.target.value)}>
                <option value="3">Grade 3</option>
                <option value="4">Grade 4</option>
                <option value="5">Grade 5</option>
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="test-batch">Batch</label>
              <select id="test-batch" className="field cursor-pointer" required value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                {gradeBatches(grade).length === 0 && <option value="">No batches for this grade</option>}
                {gradeBatches(grade).map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {shape === "single" ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <label className="field-label" htmlFor="test-subject">Subject</label>
                <input id="test-subject" required className="field" placeholder="e.g. Mathematics" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="test-date1">Date</label>
                <input id="test-date1" type="date" required className="field" value={date1} onChange={(e) => setDate1(e.target.value)} />
              </div>
              <div>
                <label className="field-label" htmlFor="test-max1">Out of</label>
                <input id="test-max1" type="number" min="1" required className="field" value={max1} onChange={(e) => setMax1(Number(e.target.value))} />
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-border p-4">
              {shape === "model" && (
                <div>
                  <label className="field-label" htmlFor="test-date1">Date (both parts)</label>
                  <input id="test-date1" type="date" required className="field" value={date1} onChange={(e) => setDate1(e.target.value)} />
                </div>
              )}
              {[1, 2].map((n) => (
                <div key={n} className="grid gap-3 sm:grid-cols-3">
                  <p className="font-semibold text-foreground sm:col-span-3">Part {n}</p>
                  {shape === "parts" && (
                    <div className="sm:col-span-2">
                      <label className="field-label" htmlFor={`test-date${n}`}>Date</label>
                      <input
                        id={`test-date${n}`}
                        type="date"
                        required={n === 1}
                        className="field"
                        value={n === 1 ? date1 : date2}
                        onChange={(e) => (n === 1 ? setDate1 : setDate2)(e.target.value)}
                      />
                      {n === 2 && !date2 && <p className="mt-1 text-xs text-muted-foreground">Leave empty if it is the same day as Part 1.</p>}
                    </div>
                  )}
                  <div className={shape === "model" ? "sm:col-span-3" : undefined}>
                    <label className="field-label" htmlFor={`test-max${n}`}>Out of</label>
                    <input id={`test-max${n}`} type="number" min="1" required className="field" value={n === 1 ? max1 : max2} onChange={(e) => (n === 1 ? setMax1 : setMax2)(Number(e.target.value))} />
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Total out of {max1 + max2}.</p>
            </div>
          )}

          {batchId && eligibleCount === 0 && (
            <p className="rounded-lg bg-warning/15 px-3 py-2 text-xs font-medium text-warning">
              No Grade {grade} students are registered in this batch yet — the test will start with an empty roster.
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border bg-card py-2 font-medium text-foreground transition-colors hover:bg-muted">
              Cancel
            </button>
            <button type="submit" disabled={saving || !batchId} className="flex-1 rounded-xl bg-primary py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
              {saving ? <Loader2 className="mx-auto animate-spin" size={18} /> : "Create test"}
            </button>
          </div>
        </form>
      </div>
      <AlertModal open={error !== null} onClose={() => setError(null)} title="Failed to create test" description={error ?? undefined} tone="danger" />
    </div>
  );
}
