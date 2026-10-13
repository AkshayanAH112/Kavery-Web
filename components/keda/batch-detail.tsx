"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Calendar, FileText, Pencil, Trash2, X } from "lucide-react";
import { ConfirmDialog, AlertModal } from "@/components/console/confirm-dialog";

export default function BatchDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const batchId = params.id as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    fetch(`/api/batches/${batchId}`)
      .then(r => r.json() as any)
      .then(d => {
        setData(d);
        setLoading(false);
      });
  }, [batchId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async () => {
    setConfirmDeleteOpen(false);
    const res = await fetch(`/api/batches/${batchId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/console/batches");
    } else {
      const err = await res.json() as any;
      setError(err.error);
    }
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-primary" size={40} /></div>;
  if (!data?.batch) return <div className="p-12 text-center text-muted-foreground">Batch not found</div>;

  const { batch, classes } = data;

  // Group classes by grade
  const classesByGrade: Record<number, any[]> = {};
  batch.grades.forEach((g: number) => {
    classesByGrade[g] = classes.filter((c: any) => c.grade === g);
  });

  return (
    <div className="space-y-6">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft size={20} /> Back to Batches
      </button>

      <div className="bg-primary p-8 rounded-3xl text-primary-foreground shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-12 translate-x-12"></div>
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{batch.name}</h1>
            <p className="text-primary-foreground/80 mt-2 text-lg">Year: {batch.year}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsEditOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-white/25 px-3 py-2 font-medium text-sm transition-colors">
              <Pencil size={15} /> Edit
            </button>
            <button onClick={() => setConfirmDeleteOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-white/15 hover:bg-destructive/80 px-3 py-2 font-medium text-sm transition-colors">
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {batch.grades.map((grade: number) => (
          <div key={grade} className="bg-card border border-border rounded-3xl p-6 shadow-sm">
            <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-3">
              <span className="bg-primary/10 text-primary w-10 h-10 rounded-xl flex items-center justify-center">G{grade}</span>
              Grade {grade} Classes
            </h2>
            
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {classesByGrade[grade]?.map(c => (
                <div 
                  key={c._id}
                  onClick={() => router.push(`/console/classes/${c._id}`)}
                  className="p-5 border border-border rounded-2xl cursor-pointer hover:border-primary hover:shadow-md transition-all group"
                >
                  <div className="flex justify-between items-start mb-3">
                    <span className="rounded bg-secondary px-2 py-1 font-mono text-xs font-bold text-secondary-foreground">
                      Grade {c.grade}
                    </span>
                    <ArrowLeft size={16} className="rotate-135 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <h3 className="font-bold text-foreground flex items-center gap-2">
                    <FileText size={16} className="text-primary" />
                    {c.subject || 'General Session'}
                  </h3>
                  <div className="mt-3 text-sm text-muted-foreground flex items-center gap-2">
                    <Calendar size={14} />
                    {new Date(c.date).toLocaleDateString()} at {c.time || 'N/A'}
                  </div>
                </div>
              ))}

              {(!classesByGrade[grade] || classesByGrade[grade].length === 0) && (
                <div className="col-span-full p-8 border border-dashed border-border rounded-2xl text-center text-muted-foreground">
                  No classes scheduled for Grade {grade} yet.
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {isEditOpen && (
        <EditBatchModal
          batch={batch}
          onClose={() => setIsEditOpen(false)}
          onSaved={() => { setIsEditOpen(false); fetchData(); }}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete this batch?"
        description="This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
      />
      <AlertModal open={error !== null} onClose={() => setError(null)} title="Failed to delete" description={error ?? undefined} tone="danger" />
    </div>
  );
}

function EditBatchModal({ batch, onClose, onSaved }: { batch: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: batch.name, year: batch.year, grades: [...batch.grades] as number[], autoPromote: Boolean(batch.autoPromote) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleGrade = (g: number) => {
    setForm(prev => ({
      ...prev,
      grades: prev.grades.includes(g) ? prev.grades.filter(x => x !== g) : [...prev.grades, g].sort()
    }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/batches/${batch._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) onSaved();
      else { const err = await res.json() as any; setError(err.error); }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-start justify-between">
          <h2 className="text-xl font-bold text-foreground">Edit Batch</h2>
          <button onClick={onClose} className="cursor-pointer text-muted-foreground hover:text-foreground"><X size={20} /></button>
        </div>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="field-label">Batch Name</label>
            <input required className="field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="field-label">Exam year (used in index numbers, e.g. 2027 gives KEDA/27/…)</label>
            <input type="number" required className="field" value={form.year} onChange={e => setForm({ ...form, year: Number(e.target.value) })} />
          </div>
          <div>
            <label className="field-label">Grades Covered</label>
            <div className="flex items-center gap-2 pt-1">
              {[3, 4, 5].map(g => (
                <button
                  type="button"
                  key={g}
                  onClick={() => toggleGrade(g)}
                  className={`rounded-lg px-3 py-1 text-sm font-bold transition-colors ${form.grades.includes(g) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border border-border"}`}
                >
                  Grade {g}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-start gap-2 pt-1 text-sm text-foreground">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.autoPromote}
              onChange={e => setForm({ ...form, autoPromote: e.target.checked })}
            />
            Automatically promote students to the next grade each January (same
            students continue into next year&apos;s grade in this batch).
          </label>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 border border-border bg-card rounded-xl font-medium text-foreground hover:bg-muted transition-colors">Cancel</button>
            <button type="submit" disabled={saving || form.grades.length === 0} className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground py-2 rounded-xl font-medium">
              {saving ? <Loader2 className="animate-spin mx-auto" size={18} /> : "Save"}
            </button>
          </div>
        </form>
      </div>
      <AlertModal open={error !== null} onClose={() => setError(null)} title="Failed to save" description={error ?? undefined} tone="danger" />
    </div>
  );
}
