"use client";

import { Suspense, useState, useEffect } from "react";
import { Plus, Loader2, Calendar, ChevronRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

export default function BatchesPage() {
  return (
    <Suspense>
      <BatchesPageContent />
    </Suspense>
  );
}

function BatchesPageContent() {
  const [batches, setBatches] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const searchParams = useSearchParams();
  const [filterGrade, setFilterGrade] = useState(searchParams.get("grade") ?? "");

  const [batchForm, setBatchForm] = useState({ name: "", year: new Date().getFullYear() + 1, grades: [4, 5], autoPromote: false });
  const [classForm, setClassForm] = useState({ batchId: "", grade: "3", date: "", time: "", subject: "" });
  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [bRes, cRes] = await Promise.all([
        fetch("/api/batches"), fetch("/api/classes")
      ]);
      const bData = await bRes.json() as any;
      const cData = await cRes.json() as any;
      setBatches(bData.batches || []);
      setClasses(cData.classes || []);
      if (bData.batches?.length > 0) {
        setClassForm(prev => ({ ...prev, batchId: bData.batches[0]._id }));
      }
    } finally {
      setLoading(false);
    }
  }

  const createBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("/api/batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(batchForm) });
    setIsBatchModalOpen(false);
    setBatchForm({ name: "", year: new Date().getFullYear() + 1, grades: [4, 5], autoPromote: false });
    fetchData();
  };

  const toggleBatchGrade = (g: number) => {
    setBatchForm(prev => ({
      ...prev,
      grades: prev.grades.includes(g) ? prev.grades.filter(x => x !== g) : [...prev.grades, g].sort()
    }));
  };

  const createClass = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("/api/classes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(classForm) });
    setIsClassModalOpen(false);
    fetchData();
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-muted-foreground" size={32} /></div>;

  const filteredBatches = filterGrade ? batches.filter(v => v.grades.includes(Number(filterGrade))) : batches;
  const filteredClasses = filterGrade ? classes.filter(c => c.grade === Number(filterGrade)) : classes;

  return (
    <div className="space-y-8">
      {/* Batches Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-card p-6 rounded-2xl shadow-sm border border-border">
        <div>
          <h1 className="text-2xl font-bold">Batches & Classes</h1>
          <p className="text-muted-foreground text-sm">Manage academic years and daily class sessions.</p>
        </div>
        <div className="flex gap-3">
          <select className="field cursor-pointer sm:w-40" value={filterGrade} onChange={e => setFilterGrade(e.target.value)}>
            <option value="">All Grades</option>
            <option value="3">Grade 3</option>
            <option value="4">Grade 4</option>
            <option value="5">Grade 5</option>
          </select>
          <button onClick={() => setIsBatchModalOpen(true)} className="px-4 py-2 border border-border hover:bg-muted rounded-xl font-medium transition-colors">New Batch</button>
          <button onClick={() => setIsClassModalOpen(true)} className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-medium transition-colors flex items-center gap-2"><Plus size={18}/> New Session</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Batches List */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
          <h3 className="text-lg font-bold mb-4">Active Batches</h3>
          <div className="space-y-4">
            {filteredBatches.map(v => (
              <div 
                key={v._id} 
                onClick={() => router.push(`/console/batches/${v._id}`)}
                className="p-4 rounded-xl border border-border hover:border-primary cursor-pointer transition-colors flex justify-between items-center group"
              >
                <div>
                  <div className="font-bold text-foreground flex items-center gap-2">
                    {v.name} ({v.year})
                    {v.autoPromote && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                        Auto-promotes
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">Grades supported: {v.grades.join(', ')}</div>
                </div>
                <ChevronRight className="text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            ))}
          </div>
        </div>

        {/* Classes List */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
          <h3 className="text-lg font-bold mb-4">Recent Daily Sessions</h3>
          <div className="space-y-4">
            {filteredClasses.map(v => (
              <div key={v._id} className="p-4 rounded-xl border border-border flex items-center justify-between">
                <div>
                  <div className="font-bold">Grade {v.grade} - {v.subject || 'General'}</div>
                  <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1"><Calendar size={14}/> {new Date(v.date).toLocaleDateString()} at {v.time}</div>
                </div>
                <div className="rounded-lg bg-primary/10 px-3 py-1 font-bold text-primary">Grade {v.grade}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modals... */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border p-6 sm:p-8 rounded-3xl max-w-sm w-full max-h-[calc(100dvh-2rem)] overflow-y-auto shadow-2xl">
            <h2 className="text-xl font-bold mb-6 text-foreground">New Batch</h2>
            <form onSubmit={createBatch} className="space-y-4">
              <div>
                <label className="field-label">Batch Name</label>
                <input required className="field" placeholder="e.g. 2026/27 Scholarship Batch" onChange={e => setBatchForm({...batchForm, name: e.target.value})} />
              </div>
              <div>
                <label className="field-label">Exam year (used in index numbers, e.g. 2027 gives KEDA/27/…)</label>
                <input type="number" required className="field" placeholder="Year" value={batchForm.year} onChange={e => setBatchForm({...batchForm, year: Number(e.target.value)})} />
              </div>
              <div>
                <label className="field-label">Grades Covered</label>
                <div className="flex items-center gap-2 pt-1">
                  {[3, 4, 5].map(g => (
                    <button
                      type="button"
                      key={g}
                      onClick={() => toggleBatchGrade(g)}
                      className={`rounded-lg px-3 py-1 text-sm font-bold transition-colors ${batchForm.grades.includes(g) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border border-border"}`}
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
                  checked={batchForm.autoPromote}
                  onChange={e => setBatchForm({ ...batchForm, autoPromote: e.target.checked })}
                />
                Automatically promote students to the next grade each January (same
                students continue into next year&apos;s grade in this batch).
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsBatchModalOpen(false)} className="flex-1 py-2 border border-border bg-card rounded-xl font-medium text-foreground hover:bg-muted transition-colors">Cancel</button>
                <button type="submit" disabled={batchForm.grades.length === 0} className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground py-2 rounded-xl font-medium">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isClassModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border p-6 sm:p-8 rounded-3xl max-w-sm w-full max-h-[calc(100dvh-2rem)] overflow-y-auto shadow-2xl">
            <h2 className="text-xl font-bold mb-6 text-foreground">New Class Session</h2>
            <form onSubmit={createClass} className="space-y-4">
              <div>
                <label className="field-label">Batch</label>
                <select className="field" required onChange={e => setClassForm({...classForm, batchId: e.target.value})} value={classForm.batchId}>
                  {batches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Grade</label>
                <select className="field cursor-pointer" required onChange={e => setClassForm({...classForm, grade: e.target.value})}>
                  <option value="3">Grade 3</option><option value="4">Grade 4</option><option value="5">Grade 5</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div>
                  <label className="field-label">Date</label>
                  <input type="date" required className="field" onChange={e => setClassForm({...classForm, date: e.target.value})} />
                </div>
                 <div>
                  <label className="field-label">Time</label>
                  <input type="time" className="field" onChange={e => setClassForm({...classForm, time: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="field-label">Subject</label>
                <input type="text" className="field" placeholder="Optional e.g. Mathematics" onChange={e => setClassForm({...classForm, subject: e.target.value})} />
              </div>
              
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsClassModalOpen(false)} className="flex-1 py-2 border border-border bg-card rounded-xl font-medium text-foreground hover:bg-muted transition-colors">Cancel</button>
                <button type="submit" className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground py-2 rounded-xl font-medium">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
