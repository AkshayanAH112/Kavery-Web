"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line } from "recharts";
import { Loader2, ArrowLeft, AlertTriangle, GraduationCap, QrCode as QrIcon, Pencil, Trash2, X } from "lucide-react";
import { StudentIdCardModal } from "@/components/keda/student-id-card-modal";
import { shrinkImage } from "@/lib/upload-client";
import { PhotoSource } from "@/components/console/photo-editor";
import { Modal, ConfirmDialog, AlertModal } from "@/components/console/confirm-dialog";
import { useCurrentUser } from "@/components/console/current-user";
import { isValidPhoneLocal, PHONE_HINT } from "@/lib/phone";
import { BaminiInput, BaminiToggle, useBaminiTyping } from "@/components/keda/bamini-input";
import { ChoiceInput, useStudentChoices } from "@/components/keda/choice-input";

export default function StudentProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useCurrentUser();
  const studentId = params.id as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showIdCard, setShowIdCard] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [leaveHistory, setLeaveHistory] = useState<any[]>([]);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [blockedDeleteMessage, setBlockedDeleteMessage] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(() => {
    fetch(`/api/students/${studentId}`).then(r => r.json() as any).then(d => {
      setData(d);
      setLoading(false);
    });
    fetch(`/api/students/${studentId}/leave-history`).then(r => r.json() as any).then(d => setLeaveHistory(d.leaves || []));
  }, [studentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const performDelete = async (force = false) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/students/${studentId}${force ? "?force=true" : ""}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/console/students");
        return;
      }
      const err = await res.json() as any;
      if (res.status === 409) {
        setBlockedDeleteMessage(err.error);
      } else {
        setAlertMessage(err.error);
      }
    } finally {
      setDeleting(false);
    }
  };

  // A phone photo is shrunk in the browser first; the server then checks it really is an image.
  const uploadPhoto = async (file?: File) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const body = new FormData();
      body.append("photo", await shrinkImage(file));
      const res = await fetch(`/api/students/${studentId}/photo`, { method: "POST", body });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as any).error || "The photo could not be uploaded.");
      fetchData();
    } catch (e: any) {
      setAlertMessage(e.message);
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    await fetch(`/api/students/${studentId}/photo`, { method: "DELETE" }).catch(() => {});
    setPhotoBusy(false);
    fetchData();
  };

  const deactivateInstead = async () => {
    setBlockedDeleteMessage(null);
    await fetch(`/api/students/${studentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    fetchData();
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-primary" size={40} /></div>;
  if (!data?.student) return <div className="p-12 text-center">Student not found</div>;

  const { student, analytics, marks } = data;

  // Absent entries have no score, so they're excluded from both charts below
  // rather than plotting as a misleading 0%.
  const scoredMarks = marks.filter((m: any) => !m.isAbsent);

  const chartData = scoredMarks.slice().reverse().map((m: any) => ({
    name: m.subject,
    percentage: Math.round((m.marks / m.maxMarks) * 100)
  }));

  // Same records, ordered oldest-to-newest by exam date instead of grouped by
  // subject, so the line reads as a trend over time rather than a comparison.
  const trendData = scoredMarks.slice().reverse().map((m: any) => ({
    date: new Date(m.examDate).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    percentage: Math.round((m.marks / m.maxMarks) * 100),
  }));

  return (
    <div className="space-y-6">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft size={20} /> Back
      </button>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="lg:col-span-1 bg-card p-6 rounded-3xl border border-border shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-24 bg-primary"></div>
          <div className="relative mt-8 flex flex-col items-center">
            <div className="w-24 h-24 bg-card rounded-full border-4 border-white flex items-center justify-center shadow-lg mb-3 overflow-hidden">
              {student.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a private file behind the signed-in route
                <img src={student.photoUrl} alt={student.name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-primary">{student.name.charAt(0)}</span>
              )}
            </div>
            {/* The photo is printed on the ID card, so it is cropped to the card's frame. */}
            <div className="mb-4 flex flex-col items-center gap-2 text-sm">
              <PhotoSource onPhoto={uploadPhoto} busy={photoBusy} uploadLabel={student.photoUrl ? "Change" : "Upload"} className="justify-center" />
              {photoBusy ? (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Loader2 className="animate-spin" size={14} aria-hidden /> Uploading…</span>
              ) : student.photoUrl && (
                <button type="button" onClick={removePhoto} className="cursor-pointer text-muted-foreground underline underline-offset-4 hover:text-destructive">
                  Remove photo
                </button>
              )}
            </div>
            <h2 className="text-2xl font-bold">{student.name}</h2>
            <p className="font-mono text-xs text-muted-foreground mt-1">{student.registrationNumber ?? "No registration number"}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="bg-primary/10 text-primary font-bold px-3 py-1 rounded-full text-sm">Grade {student.grade}</span>
              {student.isActive === false ? (
                <span className="bg-destructive/10 text-destructive font-bold px-3 py-1 rounded-full text-sm">Inactive</span>
              ) : (
                <span className="bg-success/10 text-success font-bold px-3 py-1 rounded-full text-sm">Active</span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-6 w-full">
              <button onClick={() => setShowIdCard(true)} className="flex-1 flex items-center justify-center gap-1.5 text-primary bg-primary/10 hover:bg-primary/15 px-3 py-2 rounded-lg font-bold text-sm transition-colors">
                <QrIcon size={15} /> ID Card
              </button>
              <button onClick={() => setIsEditOpen(true)} className="flex items-center justify-center gap-1.5 border border-border px-3 py-2 rounded-lg font-medium text-sm text-foreground hover:bg-muted transition-colors">
                <Pencil size={15} /> Edit
              </button>
              <button onClick={() => setConfirmDeleteOpen(true)} className="flex items-center justify-center gap-1.5 border border-destructive/30 px-3 py-2 rounded-lg font-medium text-sm text-destructive hover:bg-destructive/10 transition-colors">
                <Trash2 size={15} />
              </button>
            </div>

            <div className="w-full mt-8 space-y-4">
              {student.school && (
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">School</span>
                  <span className="font-medium">{student.school}</span>
                </div>
              )}
              {student.address && (
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Address</span>
                  <span className="font-medium text-right">{student.address}</span>
                </div>
              )}
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Guardian</span>
                <span className="font-medium">{student.guardianName}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Phone</span>
                <span className="font-medium">{student.guardianPhone}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">QR ID</span>
                <span className="font-medium">{student.qrCode}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Registered</span>
                <span className="font-medium">
                  {student.registrationDate ? new Date(student.registrationDate).toLocaleDateString() : "—"}
                </span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Total Leaves</span>
                <span className="font-medium tabular">{student.totalLeaves ?? 0}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Current Leave Cycle</span>
                <span className={`font-bold tabular ${(student.currentLeaveCycle ?? 0) >= 3 ? "text-destructive" : (student.currentLeaveCycle ?? 0) >= 2 ? "text-warning" : ""}`}>
                  {student.currentLeaveCycle ?? 0}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Analytics Grid */}
        <div className="lg:col-span-2 grid sm:grid-cols-2 gap-4">
          <div className="card-gold-rule flex flex-col justify-center p-6 shadow-xs">
            <h3 className="mb-2 font-medium text-muted-foreground">Overall Attendance</h3>
            <div className="flex items-center gap-3">
              <span
                className={`tabular text-4xl font-bold ${
                  analytics.attendancePercentage >= 75 ? "text-success" : "text-warning"
                }`}
              >
                {analytics.attendancePercentage}%
              </span>
              {analytics.attendancePercentage < 75 && (
                <AlertTriangle className="text-warning" size={28} aria-hidden />
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Present for {analytics.classesPresent} of {analytics.totalClasses} recorded sessions
            </p>
          </div>

          <div className="card-gold-rule flex flex-col justify-center p-6 shadow-xs">
            <h3 className="mb-2 font-medium text-muted-foreground">Average Marks</h3>
            <div className="flex items-center gap-3">
              <span className="tabular text-4xl font-bold text-primary">
                {analytics.averageMarks}%
              </span>
              <GraduationCap className="text-brand-text" size={28} aria-hidden />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Across {marks.length} recorded {marks.length === 1 ? "result" : "results"}
            </p>
          </div>

          <div className="sm:col-span-2 rounded-lg border border-border bg-card p-6 shadow-xs">
            <h3 className="mb-6 font-medium text-muted-foreground">Subject Performance History</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="var(--border)"
                  />
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" domain={[0, 100]} fontSize={12} />
                  <Tooltip
                    formatter={(value: any) => [`${value}%`, "Score"]}
                    contentStyle={{
                      borderRadius: "10px",
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                      color: "var(--card-foreground)",
                    }}
                  />
                  <Bar dataKey="percentage" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {marks.length > 0 && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-lg border border-border bg-card p-6 shadow-xs">
            <h3 className="mb-6 font-medium text-muted-foreground">Marks Trend Over Time</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" domain={[0, 100]} fontSize={12} />
                  <Tooltip
                    formatter={(value: any) => [`${value}%`, "Score"]}
                    contentStyle={{
                      borderRadius: "10px",
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                      color: "var(--card-foreground)",
                    }}
                  />
                  <Line type="monotone" dataKey="percentage" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-1 rounded-lg border border-border bg-card p-6 shadow-xs">
            <h3 className="mb-4 font-medium text-muted-foreground">All Marks</h3>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {marks.map((m: any) => (
                <div key={m._id} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm odd:bg-muted/50">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{m.examName ? `${m.examName} · ${m.subject}` : m.subject}</p>
                    <p className="text-xs text-muted-foreground">{new Date(m.examDate).toLocaleDateString()}</p>
                  </div>
                  <span className={`tabular shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${m.isAbsent ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                    {m.isAbsent ? "Absent" : `${m.marks}/${m.maxMarks}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {leaveHistory.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-6 shadow-xs">
          <h3 className="mb-4 font-medium text-muted-foreground">Leave History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary font-medium text-secondary-foreground">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Class</th>
                  <th className="px-4 py-2">Leave Cycle</th>
                  <th className="px-4 py-2">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leaveHistory.map((l: any) => {
                  const classDate = l.classId?.date || l.date;
                  const classId = typeof l.classId === "object" ? l.classId?._id : l.classId;
                  const subject = typeof l.classId === "object" ? l.classId?.subject : null;

                  return (
                    <tr key={l._id}>
                      <td className="px-4 py-2 font-medium">{new Date(classDate).toLocaleDateString()}</td>
                      <td className="px-4 py-2">
                        {classId ? (
                          <Link
                            href={`/console/classes/${classId}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {subject || "General Session"}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">{subject || "General Session"}</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-bold text-warning">
                          Cycle {l.leaveCycleAtRecord ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{l.remarks || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showIdCard && (
        <StudentIdCardModal student={student} onClose={() => setShowIdCard(false)} />
      )}

      {isEditOpen && (
        <EditStudentModal
          student={student}
          onClose={() => setIsEditOpen(false)}
          onSaved={() => { setIsEditOpen(false); fetchData(); }}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={() => { setConfirmDeleteOpen(false); performDelete(false); }}
        title="Delete this student?"
        description="This cannot be undone."
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        tone="danger"
      />

      <Modal
        open={blockedDeleteMessage !== null}
        onClose={() => setBlockedDeleteMessage(null)}
        title="Cannot delete this student"
        description={blockedDeleteMessage ?? undefined}
        tone="danger"
        footer={
          <div className="flex w-full flex-col gap-2">
            <button
              onClick={deactivateInstead}
              className="w-full py-2 rounded-xl font-medium text-primary-foreground bg-primary hover:bg-primary/90 transition-colors"
            >
              Deactivate Instead
            </button>
            {user?.isAdmin && (
              <button
                onClick={() => { setBlockedDeleteMessage(null); performDelete(true); }}
                className="w-full py-2 rounded-xl font-medium text-on-danger bg-destructive hover:bg-destructive/90 transition-colors"
              >
                Force Delete Everything (Admin Only)
              </button>
            )}
            <button
              onClick={() => setBlockedDeleteMessage(null)}
              className="w-full py-2 border border-border bg-card rounded-xl font-medium text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        }
      />

      <AlertModal
        open={alertMessage !== null}
        onClose={() => setAlertMessage(null)}
        title="Something went wrong"
        description={alertMessage ?? undefined}
        tone="danger"
      />
    </div>
  );
}

function EditStudentModal({ student, onClose, onSaved }: { student: any; onClose: () => void; onSaved: () => void }) {
  const [batches, setBatches] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: student.name,
    school: student.school ?? "",
    address: student.address ?? "",
    // Empty for a student brought in from a class list: only the name and index number are known.
    guardianName: student.guardianName ?? "",
    guardianPhone: student.guardianPhone ?? "",
    grade: String(student.grade),
    batchId: student.batchId?._id ?? "",
    isActive: student.isActive !== false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [bamini, setBamini] = useBaminiTyping();
  const [choices] = useStudentChoices();

  useEffect(() => {
    fetch("/api/batches").then(r => r.json() as any).then(d => setBatches(d.batches || []));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidPhoneLocal(form.guardianPhone)) {
      setPhoneError(PHONE_HINT);
      return;
    }
    setPhoneError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/students/${student._id}`, {
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
          <h2 className="text-xl font-bold text-foreground">Edit Student</h2>
          <button onClick={onClose} className="cursor-pointer text-muted-foreground hover:text-foreground"><X size={20} /></button>
        </div>
        <form onSubmit={save} className="space-y-4">
          <BaminiToggle on={bamini} onChange={setBamini} />
          <div><label className="field-label">Full Name</label><BaminiInput bamini={bamini} required className="field" value={form.name} onValueChange={v => setForm(prev => ({ ...prev, name: v }))} /></div>
          <div><label className="field-label">School</label><ChoiceInput options={choices.schools} bamini={bamini} className="field" value={form.school} onValueChange={v => setForm(prev => ({ ...prev, school: v }))} /></div>
          <div><label className="field-label">Address</label><ChoiceInput options={choices.addresses} bamini={bamini} className="field" value={form.address} onValueChange={v => setForm(prev => ({ ...prev, address: v }))} /></div>
          <div><label className="field-label">Guardian Name</label><BaminiInput bamini={bamini} required className="field" value={form.guardianName} onValueChange={v => setForm(prev => ({ ...prev, guardianName: v }))} /></div>
          <div>
            <label className="field-label">Guardian Phone</label>
            <input
              type="tel"
              required
              className={`field ${phoneError ? "border-destructive focus:ring-destructive" : ""}`}
              placeholder="e.g. 0701212234"
              value={form.guardianPhone}
              onChange={e => { setForm({ ...form, guardianPhone: e.target.value }); if (phoneError) setPhoneError(null); }}
              onBlur={e => setPhoneError(e.target.value && !isValidPhoneLocal(e.target.value) ? PHONE_HINT : null)}
            />
            {phoneError && <p className="mt-1 text-xs text-destructive">{phoneError}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Batch</label>
              <select className="field cursor-pointer" value={form.batchId} onChange={e => setForm({ ...form, batchId: e.target.value })}>
                <option value="">No Batch</option>
                {batches.map(b => <option key={b._id} value={b._id}>{b.name} ({b.year})</option>)}
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
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />
            Active in the programme
          </label>
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
