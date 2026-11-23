"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MonitorCheck, Plus, X } from "lucide-react";
import { AlertModal } from "@/components/console/confirm-dialog";
import { Badge, Button, PageHeader } from "@/components/console/ui";
import type { PaperStatus } from "@/lib/keda/online-rules";
import { STATUS, when } from "./online-shared";

type PaperSummary = {
  _id: string;
  title: string;
  mode: "practice" | "exam";
  grade: number;
  batchId: { _id: string; name: string } | string;
  opensAt: string | null;
  closesAt: string | null;
  durationMinutes: number;
  status: PaperStatus;
  testId: string | null;
  started: number;
  finished: number;
};

/**
 * Every online paper. Practice papers are made here; an exam paper is set up from a paper of a test
 * (the test's page), because its scores become that paper's marks.
 */
export default function OnlinePapersScreen() {
  const router = useRouter();
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [batches, setBatches] = useState<{ _id: string; name: string; grades: number[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNewOpen, setIsNewOpen] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/online-papers").then((r) => r.json() as Promise<{ papers?: PaperSummary[] }>), fetch("/api/batches").then((r) => r.json() as Promise<{ batches?: typeof batches }>)])
      .then(([p, b]) => {
        setPapers(p.papers ?? []);
        setBatches(b.batches ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Online exams"
        description="Papers students sit on the parent page, on a phone at home or a tablet in class. A practice paper's score is the student's own. An exam paper is set up from a test's Part 1 or Part 2 (Exams and marks), and its scores become that part's marks."
        action={
          <Button onClick={() => setIsNewOpen(true)}>
            <Plus size={18} aria-hidden /> New practice paper
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="animate-spin text-muted-foreground" size={32} />
        </div>
      ) : papers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-16 text-center">
          <MonitorCheck size={40} className="text-muted-foreground opacity-50" aria-hidden />
          <p className="font-semibold text-foreground">No online papers yet.</p>
          <p className="max-w-md text-sm text-muted-foreground">Make a practice paper here, or open a test in Exams and marks and choose “Set up online” on Part 1 or Part 2.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary font-medium text-secondary-foreground">
                <tr>
                  <th className="px-6 py-3">Paper</th>
                  <th className="px-6 py-3">Class</th>
                  <th className="px-6 py-3">Open</th>
                  <th className="px-6 py-3 text-right">Finished</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {papers.map((p) => (
                  <tr key={p._id} onClick={() => router.push(`/console/online/${p._id}`)} className="cursor-pointer align-top transition-colors duration-200 hover:bg-muted">
                    <td className="px-6 py-3">
                      <span className="font-semibold text-foreground">{p.title}</span>
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        <Badge tone={p.mode === "exam" ? "brand" : "neutral"}>{p.mode === "exam" ? "Exam: marks go to the test" : "Practice"}</Badge>
                        <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                      </span>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      Grade {p.grade}
                      <span className="block text-xs">{typeof p.batchId === "object" ? p.batchId.name : "—"}</span>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {p.opensAt ? (
                        <>
                          {when(p.opensAt)} → {when(p.closesAt)}
                          <span className="block text-xs">{p.durationMinutes} minutes each</span>
                        </>
                      ) : (
                        "Not set"
                      )}
                    </td>
                    <td className="px-6 py-3 text-right tabular text-foreground">
                      {p.finished}
                      {p.started > p.finished && <span className="block text-xs text-muted-foreground">{p.started - p.finished} sitting now</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isNewOpen && <NewPracticeModal batches={batches} onClose={() => setIsNewOpen(false)} onCreated={(id) => router.push(`/console/online/${id}`)} />}
    </div>
  );
}

function NewPracticeModal({ batches, onClose, onCreated }: { batches: { _id: string; name: string; grades: number[] }[]; onClose: () => void; onCreated: (id: string) => void }) {
  const forGrade = (grade: string) => batches.filter((b) => b.grades?.includes(Number(grade)));
  const [title, setTitle] = useState("");
  const [grade, setGrade] = useState("5");
  const [batchId, setBatchId] = useState(forGrade("5")[0]?._id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/online-papers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, grade: Number(grade), batchId }) });
      const data = (await res.json()) as { paper?: { _id: string }; error?: string };
      if (res.ok && data.paper) onCreated(data.paper._id);
      else setError(data.error ?? "Could not create the paper");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-(--card-radius) border border-border bg-card p-6 shadow-2xl sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-start justify-between">
          <h2 className="text-xl font-bold text-foreground">New practice paper</h2>
          <button onClick={onClose} aria-label="Close" className="cursor-pointer text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={create} className="space-y-4">
          <div>
            <label className="field-label" htmlFor="practice-title">Name</label>
            <input id="practice-title" required className="field" placeholder="e.g. Maths practice 3" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label" htmlFor="practice-grade">Grade</label>
              <select
                id="practice-grade"
                className="field"
                value={grade}
                onChange={(e) => {
                  setGrade(e.target.value);
                  setBatchId(forGrade(e.target.value)[0]?._id ?? "");
                }}
              >
                {[3, 4, 5].map((g) => (
                  <option key={g} value={g}>
                    Grade {g}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="practice-batch">Batch</label>
              <select id="practice-batch" required className="field" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                {forGrade(grade).length === 0 && <option value="">No batch for this grade</option>}
                {forGrade(grade).map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Next you add the questions and choose when it opens. Students see it only once you give it to them.</p>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <button type="submit" disabled={saving || !batchId} className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-(--field-radius) bg-brand px-4 font-semibold text-on-brand hover:opacity-90 disabled:opacity-50">
              {saving ? <Loader2 className="animate-spin" size={18} /> : "Create"}
            </button>
          </div>
        </form>
      </div>
      <AlertModal open={error !== null} onClose={() => setError(null)} title="Could not create the paper" description={error ?? undefined} tone="danger" />
    </div>
  );
}
