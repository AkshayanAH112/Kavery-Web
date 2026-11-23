"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { Loader2, AlertTriangle, Search, CheckCircle2, XCircle, X } from "lucide-react";

/** Attendance rate under this flags the student at check-in. Mirrors lib/attendanceStats.ts. */
const LOW_ATTENDANCE_PERCENT = 75;

export default function ScannerPage() {
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [scannedStudent, setScannedStudent] = useState<any>(null);
  const [attendanceRate, setAttendanceRate] = useState<number | null>(null);
  const [attendedCount, setAttendedCount] = useState(0);
  const [recordedCount, setRecordedCount] = useState(0);
  const [message, setMessage] = useState<{ text: string; kind: "error" | "success" } | null>(null);

  const [submitting, setSubmitting] = useState(false);

  // Manual fallback via ID
  const [manualCode, setManualCode] = useState("");
  const lastScannedCode = useRef<string | null>(null);

  // Inline "create new class" — reached from the class select below when today's
  // session hasn't been created yet, instead of having to leave to /console/batches.
  const [batches, setBatches] = useState<any[]>([]);
  const [isNewClassModalOpen, setIsNewClassModalOpen] = useState(false);
  const todayIso = new Date().toISOString().slice(0, 10);
  const [newClassForm, setNewClassForm] = useState({ batchId: "", grade: "3", date: todayIso, time: "", subject: "" });

  useEffect(() => {
    fetchClasses().then((list) => {
      if (list.length > 0) setSelectedClass(list[0]._id);
    });
    fetch("/api/batches")
      .then((r) => r.json() as any)
      .then((d) => {
        setBatches(d.batches || []);
        if (d.batches?.length > 0) setNewClassForm(prev => ({ ...prev, batchId: d.batches[0]._id }));
      });
  }, []);

  function fetchClasses() {
    return fetch("/api/classes")
      .then((r) => r.json() as any)
      .then((d) => {
        setClasses(d.classes || []);
        return d.classes || [];
      });
  }

  const handleQrScan = useCallback(
    async (qrCode: string) => {
      if (lastScannedCode.current === qrCode) return;
      lastScannedCode.current = qrCode;

      setScannedStudent(null);
      setMessage(null);
      try {
        const res = await fetch(`/api/students/lookup?qrCode=${qrCode}&classId=${selectedClass}`);
        const data = await res.json() as any;
        if (!res.ok) throw new Error(data.error);

        setScannedStudent(data.student);
        setAttendanceRate(data.attendanceRate);
        setAttendedCount(data.attendedCount ?? 0);
        setRecordedCount(data.recordedCount ?? 0);
      } catch (e: any) {
        setMessage({ text: e.message, kind: "error" });
      }
    },
    [selectedClass]
  );

  useEffect(() => {
    if (!selectedClass) return;

    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );

    scanner.render(
      (decodedText) => {
        handleQrScan(decodedText);
      },
      (_error) => {
        /* ignore normal errors */
      }
    );

    return () => {
      scanner.clear().catch((e) => console.error(e));
    };
  }, [selectedClass, handleQrScan]);

  // `present` is passed in from whichever button was pressed rather than read
  // from state: the modal offers Present and Absent as two explicit actions, so
  // there is no default left sitting around to be submitted by accident.
  const submitAttendance = async (present: boolean) => {
    if (!scannedStudent || !selectedClass) return;
    const studentName = scannedStudent.name;
    setSubmitting(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: scannedStudent._id,
          classId: selectedClass,
          present,
        }),
      });
      const d = ((await res.json().catch(() => ({}))) as any);
      if (res.ok) {
        setScannedStudent(null);
        lastScannedCode.current = null;
        setMessage({
          text: `${studentName} marked ${present ? "present" : "absent"}.`,
          kind: "success",
        });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ text: d.error || "Could not save attendance.", kind: "error" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleClassSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === "__new__") {
      setIsNewClassModalOpen(true);
      return;
    }
    setSelectedClass(e.target.value);
  };

  const createClassInline = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newClassForm),
      });
      const data = await res.json() as any;
      if (res.ok) {
        await fetchClasses();
        setSelectedClass(data.class._id);
        setIsNewClassModalOpen(false);
        setNewClassForm({ batchId: batches[0]?._id || "", grade: "3", date: todayIso, time: "", subject: "" });
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  const isLowAttendance = attendanceRate !== null && attendanceRate < LOW_ATTENDANCE_PERCENT;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-6 shadow-xs">
        <h1 className="mb-4 text-2xl text-foreground">Scanner &amp; Attendance</h1>

        <div className="mb-2 flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <label htmlFor="class-select" className="field-label">
              Active Class Session
            </label>
            <select
              id="class-select"
              className="field cursor-pointer"
              value={selectedClass}
              onChange={handleClassSelect}
            >
              <option value="" disabled>
                Select a class...
              </option>
              {classes.map((c) => (
                <option key={c._id} value={c._id}>
                  Grade {c.grade} - {c.subject || "Session"} (
                  {new Date(c.date).toLocaleDateString()})
                </option>
              ))}
              <option value="__new__">+ Add New Class</option>
            </select>
          </div>

          <div className="flex-1">
            <label htmlFor="manual-code" className="field-label">
              Manual Override
            </label>
            <div className="flex gap-2">
              <input
                id="manual-code"
                type="text"
                className="field"
                placeholder="Enter QR data manually"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleQrScan(manualCode)}
              />
              <button
                onClick={() => handleQrScan(manualCode)}
                aria-label="Look up student by code"
                className="cursor-pointer rounded-lg bg-secondary px-4 text-secondary-foreground transition-colors duration-200 hover:bg-accent hover:text-accent-foreground"
              >
                <Search size={20} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Single column: the scan result is a modal, not a side panel. On a phone
          a side panel renders *below* the camera, so the person scanning has to
          scroll away from the viewfinder to confirm each student — with a queue
          of students that is the slowest part of the flow. */}
      <div className="mx-auto grid w-full max-w-2xl gap-6">
        {/* Camera scanner view */}
        <div className="rounded-lg border border-border bg-card p-6 shadow-xs">
          <h3 className="mb-4 font-bold text-foreground">Live Camera Feed</h3>
          {/* html5-qrcode injects its own unstyled controls; theme them to the club palette. */}
          <style>{`
            #qr-reader button {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              padding: 8px 18px;
              border-radius: 10px;
              font-weight: 600;
              font-size: 14px;
              cursor: pointer;
              border: none;
              transition: background 0.2s, transform 0.1s;
            }
            #qr-reader button:active { transform: scale(0.97); }
            #qr-reader__scan_region + #qr-reader__dashboard button,
            #qr-reader__dashboard_section_csr button,
            #qr-reader__dashboard_section_fsr button {
              background: var(--primary);
              color: var(--primary-foreground);
              margin: 4px 4px;
            }
            #qr-reader__dashboard_section_csr button:hover,
            #qr-reader__dashboard_section_fsr button:hover {
              background: var(--gold);
              color: var(--gold-foreground);
            }
            #qr-reader__status_span { font-size: 13px; color: var(--muted-foreground); }
            #qr-reader select {
              padding: 6px 10px;
              border-radius: 8px;
              border: 1px solid var(--input);
              font-size: 14px;
              margin: 4px 0;
            }
          `}</style>
          {!selectedClass ? (
            <div className="p-12 text-center text-muted-foreground">
              Please select a class session first.
            </div>
          ) : (
            <div id="qr-reader" className="w-full overflow-hidden rounded-lg border-none" />
          )}
        </div>

        {/* Status line under the viewfinder: the last save's outcome stays
            visible here after its modal closes, so a run of scans reads as a
            continuous log rather than a modal flashing in and out. */}
        {message && (
          <div
            role="status"
            className={`flex items-center gap-2 rounded-lg p-4 ${
              message.kind === "success"
                ? "bg-success/10 text-success"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {message.kind === "success" ? (
              <CheckCircle2 size={18} aria-hidden />
            ) : (
              <AlertTriangle size={18} aria-hidden />
            )}
            {message.text}
          </div>
        )}

        {!scannedStudent && !message && selectedClass && (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 text-muted-foreground">
            <Search size={18} aria-hidden /> Scan a student card to begin
          </div>
        )}
      </div>

      {/* Scan confirmation. Overlays the viewfinder so the details land in the
          middle of the screen at the moment of the scan, with no scrolling. */}
      {scannedStudent && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setScannedStudent(null)}
        >
          <div
            className="w-full max-h-[calc(100dvh-2rem)] overflow-y-auto max-w-sm rounded-3xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="truncate text-2xl text-foreground">{scannedStudent.name}</h2>
                <p className="font-medium text-primary">Grade {scannedStudent.grade}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Guardian: {scannedStudent.guardianName} ({scannedStudent.guardianPhone})
                </p>
              </div>
              <button
                onClick={() => setScannedStudent(null)}
                aria-label="Cancel"
                className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted"
              >
                <X size={20} />
              </button>
            </div>

            {isLowAttendance && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-warning/15 px-3 py-2 font-bold text-warning">
                <AlertTriangle size={18} aria-hidden /> {attendanceRate}% attendance
              </div>
            )}

            {recordedCount > 0 && (
              <p className="mb-4 text-sm text-muted-foreground">
                Attended{" "}
                <span className="tabular font-semibold text-foreground">
                  {attendedCount} of {recordedCount}
                </span>{" "}
                recorded sessions.
              </p>
            )}

            {/* Two explicit buttons rather than a toggle plus a save: at the
                moment of a scan the choice IS present-or-absent, and a toggle
                left on its default is the easiest way to record the wrong one. */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => submitAttendance(false)}
                disabled={submitting}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-destructive/40 py-4 font-bold text-destructive transition-all hover:bg-destructive/10 active:scale-95 disabled:opacity-60"
              >
                <XCircle size={20} aria-hidden /> Absent
              </button>
              <button
                onClick={() => submitAttendance(true)}
                disabled={submitting}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-success py-4 font-bold text-on-danger transition-all hover:bg-success/90 active:scale-95 disabled:opacity-60"
              >
                {submitting ? <Loader2 className="animate-spin" size={20} aria-hidden /> : <CheckCircle2 size={20} aria-hidden />}
                Present
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline "New Class" — reached from the class select above so marking
          attendance never has to be blocked on leaving to /console/batches first. */}
      {isNewClassModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border p-6 sm:p-8 rounded-3xl max-w-sm w-full max-h-[calc(100dvh-2rem)] overflow-y-auto shadow-2xl">
            <h2 className="text-xl font-bold mb-6 text-foreground">New Class Session</h2>
            <form onSubmit={createClassInline} className="space-y-4">
              <div>
                <label className="field-label">Batch</label>
                <select
                  className="field cursor-pointer"
                  required
                  value={newClassForm.batchId}
                  onChange={(e) => setNewClassForm({ ...newClassForm, batchId: e.target.value })}
                >
                  {batches.length === 0 && <option value="" disabled>No batches yet</option>}
                  {batches.map((b) => (
                    <option key={b._id} value={b._id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Grade</label>
                <select
                  className="field cursor-pointer"
                  required
                  value={newClassForm.grade}
                  onChange={(e) => setNewClassForm({ ...newClassForm, grade: e.target.value })}
                >
                  <option value="3">Grade 3</option>
                  <option value="4">Grade 4</option>
                  <option value="5">Grade 5</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Date</label>
                  <input
                    type="date"
                    required
                    className="field"
                    value={newClassForm.date}
                    onChange={(e) => setNewClassForm({ ...newClassForm, date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="field-label">Time</label>
                  <input
                    type="time"
                    className="field"
                    value={newClassForm.time}
                    onChange={(e) => setNewClassForm({ ...newClassForm, time: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="field-label">Subject</label>
                <input
                  type="text"
                  className="field"
                  placeholder="Optional e.g. Mathematics"
                  value={newClassForm.subject}
                  onChange={(e) => setNewClassForm({ ...newClassForm, subject: e.target.value })}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewClassModalOpen(false)}
                  className="flex-1 py-2 border border-border bg-card rounded-xl font-medium text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button type="submit" className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground py-2 rounded-xl font-medium">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
