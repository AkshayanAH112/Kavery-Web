"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft, CheckCircle2, CheckCheck, XCircle, Search, Pencil, Trash2, X, AlertTriangle, Lock, LockOpen } from "lucide-react";
import { ConfirmDialog, AlertModal, Modal } from "@/components/console/confirm-dialog";
import { searchText } from "@/lib/keda/bamini";

export default function ClassAttendancePage() {
  const params = useParams();
  const router = useRouter();
  const classId = params.id as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // End-of-class register close. The preview is fetched before the dialog opens
  // so the admin sees exactly who is about to be marked absent, and who that
  // pushes to a 2nd/3rd leave, before anything is written.
  const [endPreview, setEndPreview] = useState<any>(null);
  const [endOpen, setEndOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endDone, setEndDone] = useState(0);
  const [endResult, setEndResult] = useState<string | null>(null);
  const [markAllOpen, setMarkAllOpen] = useState(false);
  // Set while "Mark all present" is saving. The register is locked meanwhile, so
  // a toggle or End class cannot race the batches.
  const [markProgress, setMarkProgress] = useState<{ done: number; total: number } | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);

  const fetchClassData = useCallback(async () => {
    try {
      const res = await fetch(`/api/classes/${classId}`);
      const d = await res.json() as any;
      setData(d);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    fetchClassData();
  }, [fetchClassData]);

  const toggleAttendance = async (studentId: string, currentPresent: boolean) => {
    const isPresent = !currentPresent;

    // Optimistic UI update
    setData((prev: any) => ({
      ...prev,
      roster: prev.roster.map((r: any) =>
        r.student._id === studentId ? { ...r, isPresent, isRecorded: true } : r
      ),
    }));

    try {
      await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, classId, present: isPresent }),
      });
    } catch (e: any) {
      console.error("Failed to update attendance", e);
      fetchClassData(); // Revert on failure
    }
  };

  const handleMarkAllPresent = async (total: number) => {
    setMarkAllOpen(false);
    setMarkProgress({ done: 0, total });
    let done = 0;
    try {
      // The server handles a few students per request and says how many remain.
      for (;;) {
        const res = await fetch(`/api/classes/${classId}/mark-all-present`, { method: "POST" });
        const d = await res.json() as any;
        if (!res.ok) throw new Error(d.error);
        done += d.marked;
        setMarkProgress({ done, total });
        if (d.remaining === 0 || d.marked === 0) break;
      }
    } catch (e: any) {
      console.error("Failed to mark everyone present", e);
      setMarkError(`${done} of ${total} students were saved. Press Mark all present again to finish the rest.`);
    } finally {
      await fetchClassData();
      setMarkProgress(null);
    }
  };

  const openEndDialog = async () => {
    setEndPreview(null);
    setEndOpen(true);
    const res = await fetch(`/api/classes/${classId}/end`);
    setEndPreview(await res.json() as any);
  };

  const handleEndClass = async () => {
    setEnding(true);
    setEndDone(0);
    let done = 0;
    let warnings = 0;
    try {
      // The server handles a few students per request and says how many remain;
      // the class is only ended by the last request.
      for (;;) {
        const res = await fetch(`/api/classes/${classId}/end`, { method: "POST" });
        const d = await res.json() as any;
        if (!res.ok) throw new Error(d.error);
        done += d.markedAbsentCount;
        warnings += d.warningsRaised;
        setEndDone(done);
        if (d.remaining === 0) break;
      }
      setEndResult(
        done === 0
          ? "Class ended. Everyone was already marked, so no leaves were added."
          : `Class ended. ${done} student${done === 1 ? "" : "s"} marked absent` +
            (warnings > 0
              ? `, raising ${warnings} leave warning${warnings === 1 ? "" : "s"}.`
              : ".")
      );
    } catch (e: any) {
      console.error("Failed to end the class", e);
      setMarkError(`${done} of ${endPreview?.unmarkedCount ?? done} students were saved as absent, but the class has not ended yet. Press End class again to finish the rest.`);
    } finally {
      await fetchClassData();
      setEnding(false);
      setEndOpen(false);
    }
  };

  const handleReopen = async () => {
    await fetch(`/api/classes/${classId}/end`, { method: "DELETE" });
    fetchClassData();
  };

  const handleDelete = async () => {
    setConfirmDeleteOpen(false);
    const res = await fetch(`/api/classes/${classId}`, { method: "DELETE" });
    if (res.ok) {
      router.push(`/console/batches/${data.classSession.batchId?._id ?? data.classSession.batchId}`);
    } else {
      const err = await res.json() as any;
      setError(err.error);
    }
  };

  if (loading)
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin text-primary" size={40} />
      </div>
    );
  if (!data?.classSession)
    return <div className="p-12 text-center text-muted-foreground">Class not found</div>;

  const { classSession, roster } = data;

  const filteredRoster = roster.filter((r: any) =>
    searchText(r.student.name).includes(searchText(searchQuery))
  );

  const presentCount = roster.filter((r: any) => r.isPresent).length;
  // Explicitly marked absent, which is what actually becomes a leave — as
  // opposed to never scanned at all, which is counted separately below.
  const absentCount = roster.filter((r: any) => r.isRecorded && !r.isPresent).length;
  const unmarkedCount = roster.filter((r: any) => !r.isRecorded).length;
  // The roster keeps deactivated students so their history shows; only active ones are marked in bulk.
  const hasActiveStudents = roster.some((r: any) => r.student.isActive);
  const toMark = roster.filter((r: any) => r.student.isActive && !r.isPresent);
  const absentToChange = toMark.filter((r: any) => r.isRecorded).length;
  const isMarkingAll = markProgress !== null;

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.back()}
        className="flex cursor-pointer items-center gap-2 text-muted-foreground transition-colors duration-200 hover:text-foreground"
      >
        <ArrowLeft size={20} aria-hidden /> Back
      </button>

      <div className="flex flex-col justify-between gap-6 rounded-lg border border-border bg-card p-6 shadow-xs md:flex-row md:items-center md:p-8">
        <div>
          <span className="mb-3 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
            Grade {classSession.grade}
          </span>
          <h1 className="text-2xl text-foreground md:text-3xl">
            {classSession.subject || "General Session"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {new Date(classSession.date).toDateString()} at {classSession.time || "N/A"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex min-w-25 flex-col items-center justify-center rounded-lg bg-success/10 p-4">
            <span className="tabular text-2xl font-bold text-success">
              {presentCount}
              <span className="text-sm font-normal text-success/70">/{roster.length}</span>
            </span>
            <span className="mt-1 text-xs font-bold uppercase text-success">Present</span>
          </div>
          <div className="flex min-w-25 flex-col items-center justify-center rounded-lg bg-muted p-4">
            <span className="tabular text-2xl font-bold text-muted-foreground">{absentCount}</span>
            <span className="mt-1 text-xs font-bold uppercase text-muted-foreground">Absent</span>
          </div>
          {unmarkedCount > 0 && (
            <div className="flex min-w-25 flex-col items-center justify-center rounded-lg bg-warning/10 p-4">
              <span className="tabular text-2xl font-bold text-warning">{unmarkedCount}</span>
              <span className="mt-1 text-xs font-bold uppercase text-warning">Not marked</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            {classSession.endedAt ? (
              <button onClick={handleReopen} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 font-medium text-sm text-muted-foreground hover:bg-muted transition-colors">
                <LockOpen size={15} /> Reopen
              </button>
            ) : (
              <button onClick={openEndDialog} disabled={isMarkingAll} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 font-semibold text-sm text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                <Lock size={15} /> End class
              </button>
            )}
            <button onClick={() => setIsEditOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 font-medium text-sm text-foreground hover:bg-muted transition-colors">
              <Pencil size={15} /> Edit
            </button>
            <button onClick={() => setConfirmDeleteOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 font-medium text-sm text-destructive hover:bg-destructive/10 transition-colors">
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={20}
              aria-hidden
            />
            <label htmlFor="roster-search" className="sr-only">
              Search roster
            </label>
            <input
              id="roster-search"
              type="text"
              placeholder="Search roster..."
              className="field pl-12"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {hasActiveStudents && (
            <button
              onClick={() => setMarkAllOpen(true)}
              disabled={isMarkingAll || toMark.length === 0}
              className="tabular flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg bg-success px-4 py-2 font-bold text-on-danger shadow-xs transition-colors hover:bg-success/90 disabled:cursor-default disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
            >
              {isMarkingAll ? <Loader2 className="animate-spin" size={18} aria-hidden /> : <CheckCheck size={18} aria-hidden />}
              {isMarkingAll
                ? `Marking ${markProgress.done} of ${markProgress.total}...`
                : toMark.length === 0
                  ? "All present"
                  : "Mark all present"}
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-secondary font-medium text-secondary-foreground">
              <tr>
                <th className="px-6 py-3">Student Name</th>
                <th className="px-6 py-3">ID</th>
                <th className="px-6 py-3 text-center">Attendance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRoster.map((r: any) => (
                <tr key={r.student._id} className="transition-colors duration-200 hover:bg-muted">
                  <td className="px-6 py-2.5 font-semibold text-foreground">{r.student.name}</td>
                  <td className="px-6 py-2.5 font-mono text-xs text-muted-foreground">
                    {r.student.qrCode}
                  </td>
                  <td className="px-6 py-2.5 text-center">
                    <button
                      onClick={() => toggleAttendance(r.student._id, r.isPresent)}
                      disabled={isMarkingAll}
                      aria-pressed={r.isPresent}
                      className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 font-bold transition-all duration-200 disabled:cursor-default disabled:opacity-60 ${
                        r.isPresent
                          ? "bg-success text-on-danger shadow-xs"
                          : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      }`}
                    >
                      {r.isPresent ? (
                        <CheckCircle2 size={18} aria-hidden />
                      ) : (
                        <XCircle size={18} aria-hidden />
                      )}
                      {r.isPresent ? "Present" : "Absent"}
                    </button>
                  </td>
                </tr>
              ))}
              {filteredRoster.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-12 text-center text-muted-foreground">
                    No students found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isEditOpen && (
        <EditClassModal
          classSession={classSession}
          onClose={() => setIsEditOpen(false)}
          onSaved={() => { setIsEditOpen(false); fetchClassData(); }}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete this class session?"
        description="This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
      />
      <AlertModal open={error !== null} onClose={() => setError(null)} title="Failed to delete" description={error ?? undefined} tone="danger" />

      <ConfirmDialog
        open={markAllOpen}
        onClose={() => setMarkAllOpen(false)}
        onConfirm={() => handleMarkAllPresent(toMark.length)}
        title="Mark everyone present?"
        description={
          `${toMark.length} student${toMark.length === 1 ? "" : "s"} will be marked present.` +
          (absentToChange > 0
            ? ` This includes ${absentToChange} marked absent, whose leave${absentToChange === 1 ? "" : "s"} will be removed.`
            : "") +
          " You can still change any student afterwards."
        }
        confirmLabel={`Mark ${toMark.length} present`}
      />
      <AlertModal
        open={markError !== null}
        onClose={() => setMarkError(null)}
        title="Not everyone was marked"
        description={markError ?? undefined}
        tone="danger"
      />

      <Modal
        open={endOpen}
        onClose={() => { if (!ending) setEndOpen(false); }}
        title="End class and close the register?"
        description="Every student still without a mark will be recorded absent. That counts as a leave, exactly as marking them absent by hand would."
        footer={
          <>
            <button
              onClick={() => setEndOpen(false)}
              disabled={ending}
              className="rounded-lg border border-border px-4 py-2 font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              onClick={handleEndClass}
              disabled={ending || !endPreview}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {ending && <Loader2 className="animate-spin" size={16} />}
              {endPreview?.unmarkedCount > 0
                ? ending
                  ? `Marking ${endDone} of ${endPreview.unmarkedCount}...`
                  : `Mark ${endPreview.unmarkedCount} absent & end`
                : "End class"}
            </button>
          </>
        }
      >
        {!endPreview ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="animate-spin" size={16} /> Checking who is unmarked...
          </div>
        ) : endPreview.unmarkedCount === 0 ? (
          <p className="text-muted-foreground">
            Everyone on this roster is already marked. Ending the class will not add any leaves.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              These {endPreview.unmarkedCount} student
              {endPreview.unmarkedCount === 1 ? "" : "s"} will be marked absent:
            </p>
            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3 text-sm">
              {endPreview.unmarked.map((s: any) => {
                const next = (s.currentLeaveCycle ?? 0) + 1;
                return (
                  <li key={s._id} className="flex items-center justify-between gap-3 py-0.5">
                    <span className="text-foreground">
                      {s.name}
                      <span className="ml-2 text-xs text-muted-foreground">{s.registrationNumber || ""}</span>
                    </span>
                    {(next === 2 || next === 3) && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">
                        <AlertTriangle size={11} /> reaches {next} leaves
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted-foreground">
              Students reaching 2 leaves raise a parent warning; 3 raises an admin-critical alert. You can still
              correct any student afterwards by toggling them back to present.
            </p>
          </div>
        )}
      </Modal>

      <AlertModal
        open={endResult !== null}
        onClose={() => setEndResult(null)}
        title="Register closed"
        description={endResult ?? undefined}
      />
    </div>
  );
}

function EditClassModal({ classSession, onClose, onSaved }: { classSession: any; onClose: () => void; onSaved: () => void }) {
  const [batches, setBatches] = useState<any[]>([]);
  const [form, setForm] = useState({
    batchId: classSession.batchId?._id ?? classSession.batchId,
    grade: String(classSession.grade),
    date: new Date(classSession.date).toISOString().slice(0, 10),
    time: classSession.time ?? "",
    subject: classSession.subject ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/batches").then(r => r.json() as any).then(d => setBatches(d.batches || []));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/classes/${classSession._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, grade: Number(form.grade) }),
      });
      if (res.ok) onSaved();
      else { const err = await res.json() as any; setError(err.error); }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-h-[calc(100dvh-2rem)] overflow-y-auto max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-start justify-between">
          <h2 className="text-xl font-bold text-foreground">Edit Class Session</h2>
          <button onClick={onClose} className="cursor-pointer text-muted-foreground hover:text-foreground"><X size={20} /></button>
        </div>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Batch</label>
              <select className="field cursor-pointer" required value={form.batchId} onChange={e => setForm({ ...form, batchId: e.target.value })}>
                {batches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Grade</label>
              <select className="field cursor-pointer" value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })}>
                <option value="3">Grade 3</option>
                <option value="4">Grade 4</option>
                <option value="5">Grade 5</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label">Date</label><input type="date" required className="field" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div><label className="field-label">Time</label><input type="time" className="field" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} /></div>
          </div>
          <div><label className="field-label">Subject</label><input type="text" className="field" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} /></div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 border border-border bg-card rounded-xl font-medium text-foreground hover:bg-muted transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground py-2 rounded-xl font-medium">
              {saving ? <Loader2 className="animate-spin mx-auto" size={18} /> : "Save"}
            </button>
          </div>
        </form>
      </div>
      <AlertModal open={error !== null} onClose={() => setError(null)} title="Failed to save" description={error ?? undefined} tone="danger" />
    </div>
  );
}
