"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, GraduationCap, X, Globe } from "lucide-react";
import { AlertModal } from "@/components/console/confirm-dialog";

type ExamSummary = {
  _id: string;
  subject: string;
  grade: number;
  batchId: { _id: string; name: string } | null;
  examDate: string;
  maxMarks: number;
  name?: string;
  resultsCount: number;
  averagePercent: number | null;
  // Optional: exams created before the public Results page existed have no
  // value stored, which reads the same as false here — unpublished.
  isPublished?: boolean;
};

type LegacyMark = {
  _id: string;
  studentId: { name: string } | null;
  subject: string;
  examDate: string;
  marks: number;
  maxMarks: number;
};

export default function MarksPage() {
  const router = useRouter();
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [legacyMarks, setLegacyMarks] = useState<LegacyMark[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [eRes, mRes, bRes] = await Promise.all([
        fetch("/api/exams"),
        fetch("/api/marks"),
        fetch("/api/batches"),
      ]);
      const eData = await eRes.json() as any;
      const mData = await mRes.json() as any;
      const bData = await bRes.json() as any;
      setExams(eData.exams || []);
      // Rows still missing examId — exactly what /api/exams/backfill leaves
      // behind (pre-Exam-model records with no batchId to migrate from).
      setLegacyMarks((mData.marks || []).filter((m: any) => !m.examId));
      setBatches(bData.batches || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Exams &amp; Results</h1>
          <p className="text-muted-foreground">Create an exam, then click in anytime to add or review marks.</p>
        </div>
        <button
          onClick={() => setIsNewOpen(true)}
          className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary/90"
        >
          <Plus size={18} aria-hidden /> New Exam
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="animate-spin text-primary" size={40} />
        </div>
      ) : exams.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-16 text-center">
          <GraduationCap size={40} className="text-muted-foreground opacity-50" aria-hidden />
          <p className="text-muted-foreground">No exams created yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary font-medium text-secondary-foreground">
                <tr>
                  <th className="px-6 py-3">Subject</th>
                  <th className="px-6 py-3">Grade</th>
                  <th className="px-6 py-3">Batch</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Results</th>
                  <th className="px-6 py-3">Average</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {exams.map((exam) => (
                  <tr
                    key={exam._id}
                    onClick={() => router.push(`/console/exams/${exam._id}`)}
                    className="cursor-pointer transition-colors duration-200 hover:bg-muted"
                  >
                    <td className="px-6 py-2.5 font-semibold text-foreground">
                      <span className="flex items-center gap-2">
                        {exam.name ? `${exam.subject} — ${exam.name}` : exam.subject}
                        {exam.isPublished && (
                          <span
                            title="Parents can see these results on the public site"
                            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary"
                          >
                            <Globe size={10} /> Public
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-2.5 text-muted-foreground">Grade {exam.grade}</td>
                    <td className="px-6 py-2.5 text-muted-foreground">{exam.batchId?.name ?? "—"}</td>
                    <td className="px-6 py-2.5 text-muted-foreground">
                      {new Date(exam.examDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-2.5 text-muted-foreground">{exam.resultsCount}</td>
                    <td className="px-6 py-2.5">
                      {exam.averagePercent !== null ? (
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                          {exam.averagePercent}%
                        </span>
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

      {legacyMarks.length > 0 && (
        <div className="rounded-lg border border-dashed border-border p-4">
          <button
            onClick={() => setShowLegacy((s) => !s)}
            className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {showLegacy ? "Hide" : "Show"} legacy records ({legacyMarks.length}) — entered before exams existed as their own record
          </button>
          {showLegacy && (
            <div className="mt-4 max-h-64 space-y-1 overflow-y-auto">
              {legacyMarks.map((m) => (
                <div key={m._id} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm odd:bg-muted/50">
                  <span>{m.studentId?.name ?? "Unknown student"} — {m.subject}</span>
                  <span className="tabular text-muted-foreground">
                    {m.marks}/{m.maxMarks} · {new Date(m.examDate).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isNewOpen && (
        <NewExamModal
          batches={batches}
          onClose={() => setIsNewOpen(false)}
          onCreated={(examId) => {
            setIsNewOpen(false);
            router.push(`/console/exams/${examId}`);
          }}
        />
      )}
    </div>
  );
}

function NewExamModal({
  batches,
  onClose,
  onCreated,
}: {
  batches: any[];
  onClose: () => void;
  onCreated: (examId: string) => void;
}) {
  const gradeBatches = (grade: string) => batches.filter((b) => b.grades?.includes(Number(grade)));

  const [grade, setGrade] = useState("3");
  const [batchId, setBatchId] = useState(gradeBatches("3")[0]?._id ?? "");
  const [subject, setSubject] = useState("");
  const [name, setName] = useState("");
  const [maxMarks, setMaxMarks] = useState(100);
  const [examDate, setExamDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<any[]>([]);

  // A batch's declared `grades` (its intake coverage) can drift from which
  // grade its actually-registered students are in now — e.g. after a year of
  // promotions. Cross-checking against real students here, instead of trusting
  // `batches`, is what stops an exam from being created against an empty
  // roster (the marks page and its Excel template would then have nothing to show).
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
    try {
      const res = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, grade: Number(grade), batchId, examDate, maxMarks, name: name || undefined }),
      });
      const data = await res.json() as any;
      if (res.ok) onCreated(data.exam._id);
      else setError(data.error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between">
          <h2 className="text-xl font-bold text-foreground">New Exam</h2>
          <button onClick={onClose} className="cursor-pointer text-muted-foreground hover:text-foreground">
            <X size={20} aria-hidden />
          </button>
        </div>

        <form onSubmit={create} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">Target Grade</label>
              <select className="field cursor-pointer" value={grade} onChange={(e) => handleGradeChange(e.target.value)}>
                <option value="3">Grade 3</option>
                <option value="4">Grade 4</option>
                <option value="5">Grade 5</option>
              </select>
            </div>
            <div>
              <label className="field-label">Batch</label>
              <select className="field cursor-pointer" required value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                {gradeBatches(grade).length === 0 && <option value="">No batches for this grade</option>}
                {gradeBatches(grade).map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Exam Date</label>
              <input type="date" required className="field" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Subject</label>
              <input
                type="text"
                required
                placeholder="e.g. Mathematics"
                className="field"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Maximum Marks</label>
              <input
                type="number"
                min="1"
                required
                className="field"
                value={maxMarks}
                onChange={(e) => setMaxMarks(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="field-label">Label (optional)</label>
              <input
                type="text"
                placeholder="e.g. Mid-term"
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          {batchId && eligibleCount === 0 && (
            <p className="rounded-lg bg-warning/15 px-3 py-2 text-xs font-medium text-warning">
              No Grade {grade} students are registered in this batch yet — the exam will start with an empty roster.
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border bg-card py-2 font-medium text-foreground transition-colors hover:bg-muted">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !batchId}
              className="flex-1 rounded-xl bg-primary py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="mx-auto animate-spin" size={18} /> : "Create Exam"}
            </button>
          </div>
        </form>
      </div>
      <AlertModal open={error !== null} onClose={() => setError(null)} title="Failed to create exam" description={error ?? undefined} tone="danger" />
    </div>
  );
}
