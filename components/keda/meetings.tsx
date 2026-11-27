"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { BellRing, CalendarDays, Check, ChevronRight, Copy, MapPin, MessageCircle, Plus, RotateCcw, UsersRound } from "lucide-react";
import type { MeetingDoc } from "@/lib/keda/meeting-input";
import type { ReminderItem } from "@/lib/keda/meetings";
import { whatsappMessage, whatsappNumber } from "@/lib/keda/meeting-text";
import { colomboToday } from "@/lib/push-schedule";
import { Modal } from "@/components/console/confirm-dialog";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Note, PageHeader, buttonClass, fieldClass } from "@/components/console/ui";

type Batch = { _id: string; name: string; grades: number[] };

const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", weekday: "short", day: "numeric", month: "short", year: "numeric" });
export const meetingDay = (iso: string) => dayFormat.format(new Date(iso));
export function clock(time: string | null) {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
export const audience = (m: Pick<MeetingDoc, "batchName" | "grade">) => [m.batchName ?? "All KEDA students", m.grade ? `Grade ${m.grade}` : m.batchName ? "all grades" : null].filter(Boolean).join(" · ");

/** The Sri Lanka date of a stored meeting day, as an input value. */
const inputDate = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);

export default function MeetingsScreen({ canManage }: { canManage: boolean }) {
  const [meetings, setMeetings] = useState<MeetingDoc[] | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [editing, setEditing] = useState<MeetingDoc | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/meetings", { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as { meetings?: MeetingDoc[]; error?: string };
    if (!res.ok) return setError(data.error ?? "Could not load the meetings.");
    setMeetings(data.meetings ?? []);
  }, []);

  useEffect(() => {
    void load();
    if (canManage)
      fetch("/api/batches")
        .then((r) => r.json() as Promise<{ batches?: Batch[] }>)
        .then((d) => setBatches(d.batches ?? []))
        .catch(() => {});
  }, [load, canManage]);

  const today = colomboToday();
  const upcoming = (meetings ?? []).filter((m) => !m.endedAt).sort((a, b) => a.date.localeCompare(b.date));
  const past = (meetings ?? []).filter((m) => m.endedAt);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Parent meetings"
        description="Set up a meeting for a batch, then scan each parent in with their child's card. Parents who miss two meetings in a row get a reminder in Tamil and English."
        action={
          canManage ? (
            <Button onClick={() => setEditing("new")}>
              <Plus size={18} aria-hidden /> New meeting
            </Button>
          ) : undefined
        }
      />
      {error && <Note tone="error">{error}</Note>}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-8">
          <Card className="p-6">
            <CardHeader title="Coming up" description="Open one to scan parents in. Each stays open until you end it." />
            {meetings === null ? (
              <p className="mt-4 text-muted-foreground">Loading…</p>
            ) : upcoming.length === 0 ? (
              <div className="mt-4">
                <EmptyState title="No meetings set up">{canManage ? "Choose “New meeting” to set one up." : "Ask an education manager to set one up."}</EmptyState>
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {upcoming.map((m) => (
                  <MeetingRow key={m.id} meeting={m} today={today} />
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-6">
            <CardHeader title="Past meetings" description="How many families came to each." />
            {past.length === 0 ? (
              <p className="mt-4 text-muted-foreground">None yet. A meeting moves here when its register is ended.</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {past.map((m) => (
                  <MeetingRow key={m.id} meeting={m} today={today} />
                ))}
              </ul>
            )}
          </Card>
        </div>

        {canManage && <Reminders />}
      </div>

      {editing && (
        <MeetingForm
          meeting={editing === "new" ? null : editing}
          batches={batches}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function MeetingRow({ meeting: m, today }: { meeting: MeetingDoc; today: string }) {
  const isToday = inputDate(m.date) === today;
  const rate = m.expected ? Math.round((m.present / m.expected) * 100) : null;
  return (
    <li>
      <Link href={`/console/meetings/${m.id}`} className="group flex items-center gap-4 py-4">
        <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-[var(--field-radius)] border border-line bg-surface text-center leading-none">
          <span className="text-[0.6875rem] font-semibold uppercase text-muted-foreground">{new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", month: "short" }).format(new Date(m.date))}</span>
          <span className="mt-1 text-xl font-bold tabular-nums">{new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", day: "numeric" }).format(new Date(m.date))}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold group-hover:underline">{m.title}</span>
            {m.endedAt ? <Badge>Ended</Badge> : isToday ? <Badge tone="brand">Today</Badge> : null}
          </span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            {[meetingDay(m.date), clock(m.time), m.venue].filter(Boolean).join(" · ")}
          </span>
          <span className="block text-sm text-muted-foreground">{audience(m)}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-lg font-bold tabular-nums">
            {m.present}
            <span className="text-sm font-medium text-muted-foreground">/{m.expected}</span>
          </span>
          <span className="block text-xs text-muted-foreground">{m.endedAt && rate !== null ? `${rate}% came` : "parents in"}</span>
        </span>
        <ChevronRight size={18} aria-hidden className="shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

/** Families to follow up: missed two or more meetings in a row. */
function Reminders() {
  const [status, setStatus] = useState<"open" | "contacted">("open");
  const [items, setItems] = useState<ReminderItem[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (which: "open" | "contacted") => {
    const res = await fetch(`/api/meetings/reminders?status=${which}`, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as { reminders?: ReminderItem[]; error?: string };
    if (!res.ok) return setError(data.error ?? "Could not load the reminders.");
    setItems(data.reminders ?? []);
  }, []);

  useEffect(() => {
    void load(status);
  }, [load, status]);

  async function mark(item: ReminderItem, next: "open" | "contacted") {
    const res = await fetch(`/api/meetings/reminders/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: next }) });
    if (!res.ok) return setError("Could not update it. Try again.");
    await load(status);
  }

  async function copy(item: ReminderItem) {
    try {
      await navigator.clipboard.writeText(whatsappMessage(item.text));
      setCopied(item.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Copying is blocked in this browser. Use the WhatsApp button instead.");
    }
  }

  return (
    <Card className="h-fit p-6">
      <CardHeader title="Parents to remind" description="Missed two or more meetings in a row. Their phone already got the reminder if notifications are on; send it on WhatsApp too, then mark them contacted." action={<BellRing size={20} aria-hidden className="text-muted-foreground" />} />
      <div className="mt-4 grid grid-cols-2 gap-2" role="tablist">
        {(["open", "contacted"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={status === s}
            onClick={() => setStatus(s)}
            className={`min-h-11 cursor-pointer rounded-[var(--field-radius)] border text-[0.9375rem] font-semibold transition-colors ${status === s ? "border-fg bg-surface text-fg" : "border-line bg-surface text-muted-foreground hover:bg-muted"}`}
          >
            {s === "open" ? "To contact" : "Contacted"}
          </button>
        ))}
      </div>
      {error && (
        <div className="mt-4">
          <Note tone="error">{error}</Note>
        </div>
      )}
      {items === null ? (
        <p className="mt-4 text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <div className="mt-4">
          <EmptyState title={status === "open" ? "Nobody to remind" : "Nobody marked contacted"}>
            {status === "open" ? "When a family misses two meetings in a row, they appear here as the register is ended." : "Families you contact move here until their parent comes to a meeting."}
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-4 space-y-4">
          {items.map((item) => {
            const phone = item.student.whatsapp || item.student.guardianPhone;
            const number = whatsappNumber(phone);
            return (
              <li key={item.id} className="rounded-[var(--field-radius)] border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{item.student.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Grade {item.student.grade}
                      {item.student.batchName ? ` · ${item.student.batchName}` : ""}
                      {item.student.registrationNumber ? ` · ${item.student.registrationNumber}` : ""}
                    </p>
                  </div>
                  <Badge tone="danger">Missed {item.missed} in a row</Badge>
                </div>
                <p className="mt-2 text-sm">
                  <span className="font-semibold">{item.student.guardianName || "Guardian"}</span>
                  {phone ? <span className="tabular-nums text-muted-foreground"> · {phone}</span> : <span className="text-danger"> · no phone on file</span>}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">Missed: {item.missedMeetings.map((m) => meetingDay(m.date)).join(", ")}</p>
                <details className="mt-3 rounded-[var(--field-radius)] bg-muted px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-semibold">The message</summary>
                  <p className="mt-2 leading-relaxed" lang="ta">
                    {item.text.ta}
                  </p>
                  <p className="mt-2 leading-relaxed">{item.text.en}</p>
                </details>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {number && (
                    <a href={`https://wa.me/${number}?text=${encodeURIComponent(whatsappMessage(item.text))}`} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "px-3")}>
                      <MessageCircle size={16} aria-hidden /> WhatsApp
                    </a>
                  )}
                  <Button variant="secondary" className="px-3" onClick={() => void copy(item)}>
                    {copied === item.id ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />} {copied === item.id ? "Copied" : "Copy"}
                  </Button>
                  {item.status === "open" ? (
                    <Button variant="secondary" className="px-3" onClick={() => void mark(item, "contacted")}>
                      <Check size={16} aria-hidden /> Contacted
                    </Button>
                  ) : (
                    <Button variant="secondary" className="px-3" onClick={() => void mark(item, "open")}>
                      <RotateCcw size={16} aria-hidden /> Not yet
                    </Button>
                  )}
                  {item.pushedAt && <span className="text-xs text-muted-foreground">Sent to their phone</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function MeetingForm({ meeting, batches, onClose, onSaved }: { meeting: MeetingDoc | null; batches: Batch[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [batchId, setBatchId] = useState(meeting?.batchId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const grades = batches.find((b) => b._id === batchId)?.grades ?? [3, 4, 5];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim() || null;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(meeting ? `/api/meetings/${meeting.id}` : "/api/meetings", {
        method: meeting ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: value("title") ?? "", batchId: value("batchId"), grade: value("grade") ? Number(value("grade")) : null, date: value("date") ?? "", time: value("time"), venue: value("venue"), notes: value("notes") }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save the meeting.");
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the meeting.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={meeting ? "Edit meeting" : "New parent meeting"}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="meeting-form" className="flex-1" disabled={busy}>
            {busy ? "Saving…" : meeting ? "Save changes" : "Create meeting"}
          </Button>
        </>
      }
    >
      <form id="meeting-form" onSubmit={submit} className="mt-6 space-y-5">
        <Field label="Title">
          <input name="title" required maxLength={100} defaultValue={meeting?.title ?? "Parent meeting"} className={fieldClass} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Batch">
            <select name="batchId" value={batchId} onChange={(e) => setBatchId(e.target.value)} className={fieldClass}>
              <option value="">All KEDA students</option>
              {batches.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Grade">
            <select name="grade" defaultValue={meeting?.grade ? String(meeting.grade) : ""} className={fieldClass}>
              <option value="">All grades</option>
              {grades.map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date">
            <input name="date" type="date" required defaultValue={meeting ? inputDate(meeting.date) : colomboToday()} className={fieldClass} />
          </Field>
          <Field label="Time (optional)">
            <input name="time" type="time" defaultValue={meeting?.time ?? ""} className={fieldClass} />
          </Field>
        </div>
        <Field label="Venue (optional)" hint="Shown in the reminder, for example “Main hall”.">
          <span className="relative block">
            <MapPin size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input name="venue" maxLength={100} defaultValue={meeting?.venue ?? ""} className={`${fieldClass} pl-9`} />
          </span>
        </Field>
        <Field label="Notes (optional)" hint="For staff only.">
          <textarea name="notes" rows={2} maxLength={500} defaultValue={meeting?.notes ?? ""} className={`${fieldClass} py-2.5`} />
        </Field>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <UsersRound size={16} aria-hidden className="mt-0.5 shrink-0" /> Every active student of the batch and grade is expected to send a parent. Brothers and sisters are counted together when one card is scanned.
        </p>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <CalendarDays size={16} aria-hidden className="mt-0.5 shrink-0" /> To tell parents about it, send or schedule a notification to KEDA parents from Notifications.
        </p>
        {error && <Note tone="error">{error}</Note>}
      </form>
    </Modal>
  );
}
