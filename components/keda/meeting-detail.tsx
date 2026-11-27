"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, CameraOff, CheckCircle2, Flag, Pencil, Search, Trash2, TriangleAlert, X } from "lucide-react";
import type { MeetingDoc } from "@/lib/keda/meeting-input";
import { ConfirmDialog } from "@/components/console/confirm-dialog";
import { Badge, Button, Card, CardHeader, Note, fieldClass } from "@/components/console/ui";
import { MeetingForm, audience, clock, meetingDay } from "./meetings";

type Family = {
  id: string;
  name: string;
  grade: number;
  registrationNumber: string | null;
  guardianName?: string;
  guardianPhone?: string;
  status: "present" | "absent" | "unmarked";
  markedAt: number | null;
};
type Batch = { _id: string; name: string; grades: number[] };
type Flash = { tone: "ok" | "error"; text: string; at: number };

const SCANNER_ID = "meeting-scanner";
/** The same card read again within this long is the camera seeing it twice, not a second parent. */
const REPEAT_MS = 4000;

let flashes = 0;
/** A fresh key for each message, so the same text shown twice still reads as new. */
const nextFlash = () => ++flashes;

export default function MeetingDetailScreen({ id, canManage }: { id: string; canManage: boolean }) {
  const [meeting, setMeeting] = useState<MeetingDoc | null>(null);
  const [register, setRegister] = useState<Family[]>([]);
  const [missing, setMissing] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<"all" | "present" | "unmarked" | "absent">("all");
  const [query, setQuery] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [ended, setEnded] = useState<{ markedAbsent: number; reminders: number } | null>(null);
  const lastScan = useRef<{ code: string; at: number } | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    const res = await fetch(`/api/meetings/${id}`, { cache: "no-store" });
    if (res.status === 404) return setMissing(true);
    const data = (await res.json().catch(() => ({}))) as { meeting?: MeetingDoc; register?: Family[] };
    if (data.meeting) setMeeting(data.meeting);
    setRegister(data.register ?? []);
  }, [id]);

  useEffect(() => {
    void load();
    if (canManage)
      fetch("/api/batches")
        .then((r) => r.json() as Promise<{ batches?: Batch[] }>)
        .then((d) => setBatches(d.batches ?? []))
        .catch(() => {});
  }, [load, canManage]);

  const scan = useCallback(
    async (code: string) => {
      const now = Date.now();
      if (lastScan.current && lastScan.current.code === code && now - lastScan.current.at < REPEAT_MS) return;
      lastScan.current = { code, at: now };
      const res = await fetch(`/api/meetings/${id}/attendance`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ qrCode: code }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; marked?: { name: string }[]; shared?: number };
      if (!res.ok || !data.marked) {
        setFlash({ tone: "error", text: data.error ?? "That card could not be read. Try again.", at: nextFlash() });
        return;
      }
      const [first, ...others] = data.marked;
      setFlash({ tone: "ok", text: `Parent of ${first.name} is here.${others.length ? ` Also marked: ${others.map((o) => o.name).join(", ")}.` : ""}${data.shared ? ` Their guardian phone is on ${data.shared} other students, so brothers and sisters were not marked automatically.` : ""}`, at: nextFlash() });
      navigator.vibrate?.(80);
      await load();
    },
    [id, load],
  );

  // The camera stays on between parents, so a queue can be scanned one after another.
  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    let stop: (() => Promise<void>) | null = null;
    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Html5Qrcode(SCANNER_ID);
        let stopped = false;
        stop = async () => {
          if (stopped) return;
          stopped = true;
          await scanner.stop().catch(() => {});
          scanner.clear();
        };
        await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 230, height: 230 } }, (text) => void scan(text), () => {});
        if (cancelled) await stop();
      } catch {
        if (!cancelled) {
          setScanning(false);
          setFlash({ tone: "error", text: "The camera could not start. Allow camera access for this site, or mark parents from the list below.", at: nextFlash() });
        }
      }
    })();
    return () => {
      cancelled = true;
      void stop?.();
    };
  }, [scanning, scan]);

  async function setStatus(family: Family, present: boolean) {
    const res = await fetch(`/api/meetings/${id}/attendance`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ studentId: family.id, present }) });
    if (!res.ok) return setFlash({ tone: "error", text: "Could not save that. Try again.", at: nextFlash() });
    await load();
  }

  async function end() {
    setConfirmEnd(false);
    setScanning(false);
    const res = await fetch(`/api/meetings/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "end" }) });
    const data = (await res.json().catch(() => ({}))) as { markedAbsent?: number; reminders?: number; error?: string };
    if (!res.ok) return setFlash({ tone: "error", text: data.error ?? "Could not end the meeting.", at: nextFlash() });
    setEnded({ markedAbsent: data.markedAbsent ?? 0, reminders: data.reminders ?? 0 });
    await load();
  }

  async function remove() {
    setConfirmDelete(false);
    const res = await fetch(`/api/meetings/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/console/meetings");
    else setFlash({ tone: "error", text: "Could not delete the meeting.", at: nextFlash() });
  }

  if (missing)
    return (
      <div className="space-y-4">
        <Note tone="error">That meeting no longer exists.</Note>
        <Link href="/console/meetings" className="font-semibold underline">
          Back to parent meetings
        </Link>
      </div>
    );
  if (!meeting) return <p className="p-8 text-muted-foreground">Loading…</p>;

  const counts = { present: 0, absent: 0, unmarked: 0 };
  for (const f of register) counts[f.status]++;
  const q = query.trim().toLowerCase();
  const shown = register.filter((f) => (filter === "all" || f.status === filter) && (!q || f.name.toLowerCase().includes(q) || (f.registrationNumber ?? "").toLowerCase().includes(q)));

  return (
    <div className="space-y-6">
      <Link href="/console/meetings" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-fg">
        <ArrowLeft size={16} aria-hidden /> Parent meetings
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{meeting.title}</h1>
            {meeting.endedAt && <Badge>Ended</Badge>}
          </div>
          <p className="mt-1 text-muted-foreground">{[meetingDay(meeting.date), clock(meeting.time), meeting.venue].filter(Boolean).join(" · ")}</p>
          <p className="text-muted-foreground">{audience(meeting)}</p>
          {meeting.notes && <p className="mt-2 text-sm">{meeting.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil size={16} aria-hidden /> Edit
              </Button>
              <Button variant="danger" onClick={() => setConfirmDelete(true)} aria-label="Delete meeting">
                <Trash2 size={16} aria-hidden />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(
          [
            ["Here", counts.present, "text-ok"],
            [meeting.endedAt ? "Did not come" : "Not yet", meeting.endedAt ? counts.absent : counts.unmarked + counts.absent, meeting.endedAt ? "text-danger" : "text-fg"],
            ["Families", register.length, "text-fg"],
          ] as const
        ).map(([label, value, tone]) => (
          <Card key={label} className="p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`mt-1 text-3xl font-bold tabular-nums ${tone}`}>{value}</p>
          </Card>
        ))}
      </div>

      {ended && (
        <Note tone="success">
          Meeting ended. {ended.markedAbsent} famil{ended.markedAbsent === 1 ? "y was" : "ies were"} marked absent.{" "}
          {ended.reminders ? `${ended.reminders} ${ended.reminders === 1 ? "has" : "have"} now missed two in a row and got a reminder; see Parents to remind.` : "Nobody has missed two in a row."}
        </Note>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card className="h-fit p-6">
          <CardHeader title="Scan parents in" description="Scan the child's card as each parent arrives. Brothers and sisters are marked together." />
          <div id={SCANNER_ID} className={`mt-4 overflow-hidden rounded-[var(--field-radius)] bg-black ${scanning ? "" : "hidden"}`} />
          {flash && (
            <div className="mt-4" key={flash.at}>
              <p role={flash.tone === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-[var(--field-radius)] border-l-4 bg-muted px-4 py-3 font-semibold ${flash.tone === "ok" ? "border-ok text-ok" : "border-danger text-danger"}`}>
                {flash.tone === "ok" ? <CheckCircle2 size={18} aria-hidden className="mt-0.5 shrink-0" /> : <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />}
                {flash.text}
              </p>
            </div>
          )}
          <Button className="mt-4 w-full" variant={scanning ? "secondary" : "primary"} onClick={() => setScanning((s) => !s)}>
            {scanning ? <CameraOff size={18} aria-hidden /> : <Camera size={18} aria-hidden />} {scanning ? "Stop camera" : "Start scanning"}
          </Button>
          {!meeting.endedAt && (
            <>
              <Button variant="secondary" className="mt-3 w-full" onClick={() => setConfirmEnd(true)}>
                <Flag size={18} aria-hidden /> End meeting
              </Button>
              <p className="mt-2 text-sm text-muted-foreground">Ending marks every family not scanned as absent and sends the missed-meetings reminders.</p>
            </>
          )}
        </Card>

        <Card className="p-6">
          <CardHeader title="Register" description={meeting.endedAt ? "Marks can still be corrected; reminders follow the corrected marks." : "Tap a name to mark a parent without their card."} />
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <label className="relative block flex-1">
              <span className="sr-only">Find a student</span>
              <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or index number" className={`${fieldClass} pl-9`} />
            </label>
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className={`${fieldClass} sm:w-44`} aria-label="Show">
              <option value="all">Everyone ({register.length})</option>
              <option value="present">Here ({counts.present})</option>
              <option value="unmarked">Not yet ({counts.unmarked})</option>
              <option value="absent">Absent ({counts.absent})</option>
            </select>
          </div>
          {shown.length === 0 ? (
            <p className="mt-6 text-muted-foreground">{register.length === 0 ? "No active students match this meeting's batch and grade." : "Nobody matches."}</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {shown.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{f.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Grade {f.grade}
                      {f.registrationNumber ? ` · ${f.registrationNumber}` : ""}
                      {f.guardianName ? ` · ${f.guardianName}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2" role="group" aria-label={`Parent of ${f.name}`}>
                    <button
                      type="button"
                      aria-pressed={f.status === "present"}
                      onClick={() => void setStatus(f, true)}
                      className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[var(--field-radius)] border px-3 text-sm font-semibold transition-colors ${f.status === "present" ? "border-ok bg-ok text-white" : "border-line bg-surface text-fg hover:bg-muted"}`}
                    >
                      <CheckCircle2 size={16} aria-hidden /> Here
                    </button>
                    <button
                      type="button"
                      aria-pressed={f.status === "absent"}
                      onClick={() => void setStatus(f, false)}
                      className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[var(--field-radius)] border px-3 text-sm font-semibold transition-colors ${f.status === "absent" ? "border-danger bg-danger text-white" : "border-line bg-surface text-fg hover:bg-muted"}`}
                    >
                      <X size={16} aria-hidden /> Absent
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        onConfirm={() => void end()}
        title="End this meeting?"
        description={`${counts.unmarked} famil${counts.unmarked === 1 ? "y has" : "ies have"} not been scanned and will be marked absent. Any family that has now missed two meetings in a row gets a reminder in Tamil and English.\n\nYou can still correct marks afterwards.`}
        confirmLabel="End meeting"
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        tone="danger"
        title="Delete this meeting?"
        description="Its register and any reminders it raised are deleted for good."
        confirmLabel="Delete"
      />
      {editing && (
        <MeetingForm
          meeting={meeting}
          batches={batches}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await load();
          }}
        />
      )}
    </div>
  );
}
