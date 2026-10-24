"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Download, FileSpreadsheet, Plus, Search, Loader2, QrCode as QrIcon, Power, PowerOff, Trash2 } from "lucide-react";
import { StudentIdCardModal } from "@/components/keda/student-id-card-modal";
import { downloadStudentSheet } from "@/components/keda/student-sheet";
import { Modal, ConfirmDialog, AlertModal } from "@/components/console/confirm-dialog";
import { useCurrentUser } from "@/components/console/current-user";
import { isValidPhoneLocal, PHONE_HINT } from "@/lib/phone";
import { shrinkImage } from "@/lib/upload-client";
import { PhotoSource } from "@/components/console/photo-editor";
import { BaminiInput, BaminiToggle, useBaminiTyping } from "@/components/keda/bamini-input";
import { ChoiceInput, useStudentChoices } from "@/components/keda/choice-input";
import { searchText } from "@/lib/keda/bamini";

export default function StudentsPage() {
  return (
    <Suspense>
      <StudentsPageContent />
    </Suspense>
  );
}

function StudentsPageContent() {
  const [students, setStudents] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeStudent, setActiveStudent] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBatch, setFilterBatch] = useState("");
  const searchParams = useSearchParams();
  const [filterGrade, setFilterGrade] = useState(searchParams.get("grade") ?? "");
  const router = useRouter();
  const { user } = useCurrentUser();
  // Names, schools and addresses are kept in Tamil, typed with Bamini keys.
  const [bamini, setBamini] = useBaminiTyping();
  const [choices, reloadChoices] = useStudentChoices();

  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [blockedDeleteMessage, setBlockedDeleteMessage] = useState<string | null>(null);
  const [deleteAlert, setDeleteAlert] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    school: "",
    address: "",
    guardianName: "",
    guardianPhone: "",
    batchId: "",
    grade: "3",
  });
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  // Optional photo for the ID card. It is kept in the browser until the student
  // exists, then sent to the same private route the student's page uses.
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);

  const pickPhoto = (file?: File | null) => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(file ?? null);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  };

  const closeRegistration = () => {
    setIsModalOpen(false);
    setPhoneError(null);
    pickPhoto(null);
  };

  // Inline "create new batch" — reached from the Batch select below when no
  // batch fits yet, instead of having to leave the registration form.
  const [isNewBatchModalOpen, setIsNewBatchModalOpen] = useState(false);
  const [newBatchForm, setNewBatchForm] = useState({ name: "", year: new Date().getFullYear() + 1, grades: [4, 5] as number[] });

  const toggleNewBatchGrade = (g: number) => {
    setNewBatchForm(prev => ({
      ...prev,
      grades: prev.grades.includes(g) ? prev.grades.filter(x => x !== g) : [...prev.grades, g].sort()
    }));
  };

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [sRes, bRes] = await Promise.all([
        fetch("/api/students"),
        fetch("/api/batches")
      ]);
      const sData = await sRes.json() as any;
      const bData = await bRes.json() as any;
      setStudents(sData.students || []);
      setBatches(bData.batches || []);
      if (bData.batches?.length > 0) {
        setFormData(prev => ({ ...prev, batchId: bData.batches[0]._id }));
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidPhoneLocal(formData.guardianPhone)) {
      setPhoneError(PHONE_HINT);
      return;
    }
    setPhoneError(null);
    setRegistering(true);
    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, grade: Number(formData.grade) }),
      });
      if (res.ok) {
        const { student } = await res.json() as any;
        // The student is registered whatever happens to the photo; a failed upload is reported, not rolled back.
        if (photo) {
          const failure = await uploadPhoto(student._id, photo);
          if (failure) setPhotoWarning(`${student.name} was registered, but the photo was not saved: ${failure} Add it from the student's page.`);
        }
        closeRegistration();
        setFormData({ name: "", school: "", address: "", guardianName: "", guardianPhone: "", batchId: batches[0]?._id || "", grade: "3" });
        fetchData();
        reloadChoices();
      } else {
        const err = await res.json() as any;
        setFormError(err.error);
      }
    } catch (e: any) {
      setFormError(e instanceof Error ? e.message : "Failed to register student");
    } finally {
      setRegistering(false);
    }
  };

  // A phone photo is shrunk in the browser first; the server then checks it really is an image.
  const uploadPhoto = async (studentId: string, file: File): Promise<string | null> => {
    try {
      const body = new FormData();
      body.append("photo", await shrinkImage(file));
      const res = await fetch(`/api/students/${studentId}/photo`, { method: "POST", body });
      if (res.ok) return null;
      return ((await res.json().catch(() => ({}))) as any).error || "The photo could not be uploaded.";
    } catch {
      return "The photo could not be uploaded.";
    }
  };

  const handleBatchSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === "__new__") {
      setIsNewBatchModalOpen(true);
      return;
    }
    setFormData({ ...formData, batchId: e.target.value });
  };

  const createBatchInline = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newBatchForm),
      });
      const data = await res.json() as any;
      if (res.ok) {
        setBatches(prev => [data.batch, ...prev]);
        setFormData(prev => ({ ...prev, batchId: data.batch._id }));
        setIsNewBatchModalOpen(false);
        setNewBatchForm({ name: "", year: new Date().getFullYear() + 1, grades: [4, 5] });
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  const filteredStudents = students.filter(s =>
    searchText(s.name).includes(searchText(searchQuery)) &&
    (filterBatch === "" || s.batchId?._id === filterBatch) &&
    (filterGrade === "" || String(s.grade) === filterGrade)
  );

  const toggleActive = async (student: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextActive = student.isActive === false;
    await fetch(`/api/students/${student._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: nextActive }),
    });
    fetchData();
  };

  const performDelete = async (student: any, force = false) => {
    const res = await fetch(`/api/students/${student._id}${force ? "?force=true" : ""}`, { method: "DELETE" });
    if (res.ok) {
      setDeleteTarget(null);
      fetchData();
      return;
    }
    const err = await res.json() as any;
    if (res.status === 409) {
      // Keep deleteTarget set — the follow-up modal (Deactivate/Force Delete) needs it.
      setBlockedDeleteMessage(err.error);
    } else {
      setDeleteTarget(null);
      setDeleteAlert(err.error);
    }
  };

  const deactivateInstead = async (student: any) => {
    setBlockedDeleteMessage(null);
    setDeleteTarget(null);
    await fetch(`/api/students/${student._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    fetchData();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Student Management</h1>
          <p className="text-muted-foreground">Register students and generate physical QR ID cards.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* For a class list that already has index numbers on paper. */}
          <Link href="/console/students/import" className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 font-medium text-foreground transition-colors hover:bg-muted">
            <FileSpreadsheet size={18} aria-hidden /> Import from Excel
          </Link>
          {/* The sheet the import page reads back: edit the details in Excel, then upload it there. */}
          <button
            type="button"
            disabled={filteredStudents.length === 0}
            onClick={() => downloadStudentSheet(filteredStudents, `KEDA students ${new Date().toISOString().slice(0, 10)}.xlsx`)}
            className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={18} aria-hidden /> Download Excel
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-xl flex items-center justify-center gap-2 transition-colors font-medium"
          >
            <Plus size={20} /> Register Student
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
          <BaminiInput
            bamini={bamini}
            placeholder="Search students by name..."
            className="field pl-10"
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
        </div>
        <select
          className="field sm:w-40"
          value={filterGrade}
          onChange={(e) => setFilterGrade(e.target.value)}
        >
          <option value="">All Grades</option>
          <option value="3">Grade 3</option>
          <option value="4">Grade 4</option>
          <option value="5">Grade 5</option>
        </select>
        <select
          className="field sm:w-48"
          value={filterBatch}
          onChange={(e) => setFilterBatch(e.target.value)}
        >
          <option value="">All Batches</option>
          {batches.map(b => (
            <option key={b._id} value={b._id}>{b.name} ({b.year})</option>
          ))}
        </select>
      </div>
      {/* Also decides how the search box reads the keys. */}
      <BaminiToggle on={bamini} onChange={setBamini} className="-mt-2" />

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-muted-foreground" size={32} /></div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted text-muted-foreground font-medium">
                <tr>
                  <th className="px-6 py-4">Reg. Number</th>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Batch / Grade</th>
                  <th className="px-6 py-4">Registered</th>
                  <th className="px-6 py-4">Leaves</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredStudents.map((sys) => {
                  const isActive = sys.isActive !== false;
                  return (
                  <tr
                    key={sys._id}
                    onClick={() => router.push(`/console/students/${sys._id}`)}
                    className="hover:bg-muted transition-colors text-foreground cursor-pointer"
                  >
                    <td className="px-6 py-4 font-mono text-xs">{sys.registrationNumber ?? "—"}</td>
                    <td className="px-6 py-4 font-medium">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-bold text-primary">
                          {sys.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- a private file behind the signed-in route
                            <img src={sys.photoUrl} alt={sys.name} loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            sys.name.charAt(0)
                          )}
                        </span>
                        {sys.name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-foreground">{sys.batchId?.name || 'No Batch'}</span>
                        <span className="bg-primary/10 text-primary px-2 py-1 rounded-md text-xs w-fit">Grade {sys.grade}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {sys.registrationDate ? new Date(sys.registrationDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className="tabular">{sys.totalLeaves ?? 0} total</span>
                      {(sys.currentLeaveCycle ?? 0) >= 2 && (
                        <span className={`ml-2 rounded-md px-2 py-0.5 text-xs font-bold ${sys.currentLeaveCycle >= 3 ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-warning"}`}>
                          Cycle {sys.currentLeaveCycle}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${isActive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                        {isActive ? "Active" : "Deactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setActiveStudent(sys); }}
                          aria-label="Get ID card"
                          className="text-primary hover:text-primary/80 font-medium flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <QrIcon size={16} />
                        </button>
                        <button
                          onClick={(e) => toggleActive(sys, e)}
                          aria-label={isActive ? "Deactivate" : "Activate"}
                          title={isActive ? "Deactivate" : "Activate"}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${isActive ? "text-destructive hover:text-destructive/80 bg-destructive/10" : "text-success hover:text-success/80 bg-success/10"}`}
                        >
                          {isActive ? <PowerOff size={16} /> : <Power size={16} />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(sys); }}
                          aria-label="Delete"
                          title="Delete"
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-destructive hover:text-destructive/80 bg-destructive/10 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {students.length === 0 && (
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">No students registered yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Registration Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-3xl max-w-lg w-full max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 sm:p-8 border border-border shadow-2xl">
            <h3 className="text-xl font-bold text-foreground mb-6">Register New Student</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              {/* The photo is printed on the ID card, so it is cropped to the card's frame. */}
              <div className="flex items-center gap-4">
                <div className="flex aspect-[210/276] w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                  {photoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a local preview of the cropped photo
                    <img src={photoPreview} alt="Student photo preview" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-primary">{formData.name.trim().charAt(0)}</span>
                  )}
                </div>
                <div className="min-w-0 text-sm">
                  <PhotoSource onPhoto={pickPhoto} uploadLabel={photo ? "Change" : "Upload"} />
                  <p className="mt-1.5 text-muted-foreground">
                    Printed on the ID card. It can be added later.
                    {photo && (
                      <button type="button" onClick={() => pickPhoto(null)} className="ml-2 cursor-pointer underline underline-offset-4 hover:text-destructive">
                        Remove
                      </button>
                    )}
                  </p>
                </div>
              </div>
              <BaminiToggle on={bamini} onChange={setBamini} />
              <div><label className="field-label">Full Name</label><BaminiInput bamini={bamini} required className="field" value={formData.name} onValueChange={v => setFormData(prev => ({ ...prev, name: v }))} /></div>
              <div><label className="field-label">School</label><ChoiceInput options={choices.schools} bamini={bamini} className="field" value={formData.school} onValueChange={v => setFormData(prev => ({ ...prev, school: v }))} /></div>
              <div><label className="field-label">Address</label><ChoiceInput options={choices.addresses} bamini={bamini} className="field" value={formData.address} onValueChange={v => setFormData(prev => ({ ...prev, address: v }))} /></div>
              <div><label className="field-label">Guardian Name</label><BaminiInput bamini={bamini} required className="field" value={formData.guardianName} onValueChange={v => setFormData(prev => ({ ...prev, guardianName: v }))} /></div>
              <div>
                <label className="field-label">Guardian Phone</label>
                <input
                  type="tel"
                  required
                  className={`field ${phoneError ? "border-destructive focus:ring-destructive" : ""}`}
                  placeholder="e.g. 0701212234"
                  value={formData.guardianPhone}
                  onChange={e => { setFormData({...formData, guardianPhone: e.target.value}); if (phoneError) setPhoneError(null); }}
                  onBlur={e => setPhoneError(e.target.value && !isValidPhoneLocal(e.target.value) ? PHONE_HINT : null)}
                />
                {phoneError && <p className="mt-1 text-xs text-destructive">{phoneError}</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Batch</label>
                  <select required className="field cursor-pointer" value={formData.batchId} onChange={handleBatchSelect}>
                    {batches.length === 0 && <option value="" disabled>No batches yet</option>}
                    {batches.map(b => (
                      <option key={b._id} value={b._id}>{b.name} ({b.year})</option>
                    ))}
                    <option value="__new__">+ Add New Batch</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Current Grade</label>
                  <select className="field" value={formData.grade} onChange={e => setFormData({...formData, grade: e.target.value})}>
                    <option value="3">Grade 3</option>
                    <option value="4">Grade 4</option>
                    <option value="5">Grade 5</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={closeRegistration} disabled={registering} className="flex-1 px-4 py-2 border border-border bg-card rounded-xl font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={registering} className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-medium">
                  {registering ? <Loader2 className="animate-spin mx-auto" size={18} /> : "Create & Generate QR"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inline "New Batch" — reached from the Batch select above so registering a
          student never has to be blocked on leaving to /console/batches first. */}
      {isNewBatchModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border p-6 sm:p-8 rounded-3xl max-w-sm w-full max-h-[calc(100dvh-2rem)] overflow-y-auto shadow-2xl">
            <h2 className="text-xl font-bold mb-6 text-foreground">New Batch</h2>
            <form onSubmit={createBatchInline} className="space-y-4">
              <div>
                <label className="field-label">Batch Name</label>
                <input required autoFocus className="field" placeholder="e.g. 2026/27 Scholarship Batch" value={newBatchForm.name} onChange={e => setNewBatchForm({ ...newBatchForm, name: e.target.value })} />
              </div>
              <div>
                <label className="field-label">Exam year (used in index numbers, e.g. 2027 gives KEDA/27/…)</label>
                <input type="number" required className="field" value={newBatchForm.year} onChange={e => setNewBatchForm({ ...newBatchForm, year: Number(e.target.value) })} />
              </div>
              <div>
                <label className="field-label">Grades Covered</label>
                <div className="flex items-center gap-2 pt-1">
                  {[3, 4, 5].map(g => (
                    <button
                      type="button"
                      key={g}
                      onClick={() => toggleNewBatchGrade(g)}
                      className={`rounded-lg px-3 py-1 text-sm font-bold transition-colors ${newBatchForm.grades.includes(g) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border border-border"}`}
                    >
                      Grade {g}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setIsNewBatchModalOpen(false); setFormData(prev => ({ ...prev, batchId: batches[0]?._id || "" })); }}
                  className="flex-1 py-2 border border-border bg-card rounded-xl font-medium text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button type="submit" disabled={newBatchForm.grades.length === 0} className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground py-2 rounded-xl font-medium">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeStudent && (
        <StudentIdCardModal student={activeStudent} onClose={() => setActiveStudent(null)} />
      )}

      <ConfirmDialog
        open={deleteTarget !== null && blockedDeleteMessage === null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => performDelete(deleteTarget, false)}
        title="Delete this student?"
        description={deleteTarget ? `Delete ${deleteTarget.name}? This cannot be undone.` : undefined}
        confirmLabel="Delete"
        tone="danger"
      />

      <Modal
        open={blockedDeleteMessage !== null}
        onClose={() => { setBlockedDeleteMessage(null); setDeleteTarget(null); }}
        title="Cannot delete this student"
        description={blockedDeleteMessage ?? undefined}
        tone="danger"
        footer={
          <div className="flex w-full flex-col gap-2">
            <button
              onClick={() => deactivateInstead(deleteTarget)}
              className="w-full py-2 rounded-xl font-medium text-primary-foreground bg-primary hover:bg-primary/90 transition-colors"
            >
              Deactivate Instead
            </button>
            {user?.isAdmin && (
              <button
                onClick={() => { setBlockedDeleteMessage(null); performDelete(deleteTarget, true); }}
                className="w-full py-2 rounded-xl font-medium text-on-danger bg-destructive hover:bg-destructive/90 transition-colors"
              >
                Force Delete Everything (Admin Only)
              </button>
            )}
            <button
              onClick={() => { setBlockedDeleteMessage(null); setDeleteTarget(null); }}
              className="w-full py-2 border border-border bg-card rounded-xl font-medium text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        }
      />

      <AlertModal open={deleteAlert !== null} onClose={() => setDeleteAlert(null)} title="Something went wrong" description={deleteAlert ?? undefined} tone="danger" />
      <AlertModal open={formError !== null} onClose={() => setFormError(null)} title="Failed to register student" description={formError ?? undefined} tone="danger" />
      <AlertModal open={photoWarning !== null} onClose={() => setPhotoWarning(null)} title="Registered without a photo" description={photoWarning ?? undefined} />
    </div>
  );
}
