"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarClock, ImagePlus, Loader2, Pause, Pencil, Play, Repeat, Send, Trash2 } from "lucide-react";
import type { ScheduleItem } from "@/lib/push-schedules";
import { describeRule } from "@/lib/push-schedule";
import { PUSH_TOPICS, type PushTopic } from "@/lib/push-topics";
import { POSTER, uploadImage } from "@/lib/upload-client";
import { ConfirmDialog, Modal } from "./confirm-dialog";
import { ScheduleFields, draftFrom, formatWhen, ruleFrom, type ScheduleDraft } from "./ScheduleFields";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Note, fieldClass } from "./ui";

const shortFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

type Message = { tone: "error" | "success"; text: string } | null;

/** Notifications waiting to go out, once or on a repeat, with pause, edit, send now and delete. */
export function ScheduleManager({ schedules, topicLabels, configured, onChanged }: { schedules: ScheduleItem[]; topicLabels: Record<PushTopic, string>; configured: boolean; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState<ScheduleItem | null>(null);
  const [deleting, setDeleting] = useState<ScheduleItem | null>(null);
  const [sending, setSending] = useState<ScheduleItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);

  async function call(item: ScheduleItem, path: string, init: RequestInit, success: (data: { delivered?: number }) => string) {
    setBusy(item.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/push/schedules/${item.id}${path}`, init);
      const data = (await res.json().catch(() => ({}))) as { error?: string; delivered?: number };
      if (!res.ok) throw new Error(data.error ?? "That did not work. Try again.");
      setMessage({ tone: "success", text: success(data) });
      await onChanged();
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "That did not work. Try again." });
    } finally {
      setBusy(null);
    }
  }

  const json = (body: unknown): RequestInit => ({ method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  return (
    <Card className="p-6">
      <CardHeader title="Scheduled" description="Notifications waiting for their time. Times are Sri Lanka time; each goes out within a minute of it." action={<CalendarClock size={20} aria-hidden className="text-muted-foreground" />} />
      {message && (
        <div className="mt-4">
          <Note tone={message.tone}>{message.text}</Note>
        </div>
      )}
      {schedules.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Nothing scheduled">Choose “Schedule” above to send a notification later, or on a repeat such as every practice day.</EmptyState>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {schedules.map((item) => {
            const working = busy === item.id;
            return (
              <li key={item.id} className="flex flex-col gap-3 py-4">
                <div className="flex min-w-0 items-start gap-3">
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a stored poster
                    <img src={item.image} alt="" className="h-16 w-12 shrink-0 rounded-md border border-line bg-muted object-cover object-top" />
                  ) : (
                    <span className="flex h-16 w-12 shrink-0 items-center justify-center rounded-md border border-line bg-muted text-muted-foreground">{item.repeat === "once" ? <CalendarClock size={18} aria-hidden /> : <Repeat size={18} aria-hidden />}</span>
                  )}
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{item.title}</p>
                      {item.status === "paused" && <Badge tone="warn">Paused</Badge>}
                      {item.status === "missed" && <Badge tone="danger">Missed</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {topicLabels[item.topic as PushTopic] ?? item.topic} · {describeRule(item)}
                    </p>
                    <p className="text-sm">
                      {item.status === "active" && item.nextAt ? (
                        <>
                          <span className="font-semibold">Next:</span> {formatWhen(item.nextAt)}
                        </>
                      ) : item.status === "paused" ? (
                        <span className="text-muted-foreground">Will not go out until you resume it.</span>
                      ) : item.status === "missed" ? (
                        <span className="text-danger">Its time passed before it could go out. Send it now, or edit it to pick a new time.</span>
                      ) : null}
                    </p>
                    {(item.sends > 0 || item.lastMissedAt) && (
                      <p className="text-xs text-muted-foreground">
                        {item.sends > 0 && `Sent ${item.sends} time${item.sends === 1 ? "" : "s"}${item.lastSentAt ? `, last ${shortFormat.format(item.lastSentAt)} to ${item.lastDelivered ?? 0} device${item.lastDelivered === 1 ? "" : "s"}` : ""}.`}
                        {item.status !== "missed" && item.lastMissedAt && ` One was skipped on ${shortFormat.format(item.lastMissedAt)} because it could not go out on time.`}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 sm:pl-15">
                  {item.status === "active" && (
                    <Button variant="secondary" className="px-3" disabled={working} onClick={() => void call(item, "", json({ action: "pause" }), () => `“${item.title}” is paused.`)}>
                      <Pause size={16} aria-hidden /> Pause
                    </Button>
                  )}
                  {item.status === "paused" && (
                    <Button variant="secondary" className="px-3" disabled={working} onClick={() => void call(item, "", json({ action: "resume" }), () => `“${item.title}” is back on.`)}>
                      <Play size={16} aria-hidden /> Resume
                    </Button>
                  )}
                  <Button variant="secondary" className="px-3" disabled={working || !configured} onClick={() => setSending(item)}>
                    <Send size={16} aria-hidden /> Send now
                  </Button>
                  <Button variant="secondary" className="px-3" disabled={working} onClick={() => setEditing(item)}>
                    <Pencil size={16} aria-hidden /> Edit
                  </Button>
                  <Button variant="danger" className="px-3" disabled={working} onClick={() => setDeleting(item)} aria-label={`Delete ${item.title}`}>
                    <Trash2 size={16} aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <EditSchedule
          key={editing.id}
          item={editing}
          topicLabels={topicLabels}
          onClose={() => setEditing(null)}
          onSaved={async (nextAt) => {
            setEditing(null);
            setMessage({ tone: "success", text: editing.status === "paused" ? "Saved. It stays paused until you resume it." : `Saved. Next one goes out ${formatWhen(nextAt)}.` });
            await onChanged();
          }}
        />
      )}

      <ConfirmDialog
        open={!!sending}
        onClose={() => setSending(null)}
        onConfirm={() => {
          const item = sending;
          setSending(null);
          if (item)
            void call(item, "/send", { method: "POST" }, (data) =>
              `Sent to ${data.delivered ?? 0} device${data.delivered === 1 ? "" : "s"}.${item.repeat === "once" ? " It has been taken off the schedule." : " The repeat carries on as before."}`,
            );
        }}
        title="Send it now?"
        description={`“${sending?.title ?? ""}” goes out straight away.${sending?.repeat === "once" ? " It will not go out again at its scheduled time." : " Its repeat carries on as planned."}`}
        confirmLabel="Send now"
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          const item = deleting;
          setDeleting(null);
          if (item) void call(item, "", { method: "DELETE" }, () => `“${item.title}” was deleted. Nothing more will be sent from it.`);
        }}
        tone="danger"
        title="Delete this scheduled notification?"
        description={`“${deleting?.title ?? ""}” will not go out again. Notifications it already sent stay in the history${deleting?.noticeId ? ", and its notice page stays up (delete that under Notice pages)" : ""}.`}
        confirmLabel="Delete"
      />
    </Card>
  );
}

type Poster = { url: string; publicId: string } | null;

function EditSchedule({ item, topicLabels, onClose, onSaved }: { item: ScheduleItem; topicLabels: Record<PushTopic, string>; onClose: () => void; onSaved: (nextAt: number) => Promise<void> }) {
  const [topic, setTopic] = useState(item.topic as PushTopic);
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const [url, setUrl] = useState(item.url);
  const [draft, setDraft] = useState<ScheduleDraft>(() => draftFrom(item));
  const [poster, setPoster] = useState<Poster>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  async function replace(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setError("Choose a JPEG, PNG or WebP image for the poster.");
    setError(null);
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      setPoster(await uploadImage(file, "notices", POSTER));
    } catch (e) {
      setPoster(null);
      setPreview(null);
      setError(e instanceof Error ? e.message : "The poster could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  const rule = ruleFrom(draft);

  async function save() {
    if (!rule) return setError("Choose the date and time it should go out.");
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/push/schedules/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, title, body, url, image: poster ?? undefined, rule }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; nextAt?: number };
      if (!res.ok) throw new Error(data.error ?? "Could not save. Try again.");
      await onSaved(data.nextAt!);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const image = preview ?? item.image;

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Edit scheduled notification"
      description={item.sends > 0 ? "Changes apply to the next sends. Notifications already on phones keep their old text." : undefined}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={save} disabled={saving || uploading || !title.trim() || !rule}>
            {saving ? "Saving…" : uploading ? "Waiting for the poster…" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="mt-6 space-y-5">
        <Field label="Send to">
          <select className={fieldClass} value={topic} onChange={(e) => setTopic(e.target.value as PushTopic)}>
            {PUSH_TOPICS.map((t) => (
              <option key={t} value={t}>
                {topicLabels[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title" hint={`${title.length}/80`}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} className={fieldClass} />
        </Field>
        <Field label="Message (optional)" hint={`${body.length}/240`}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={240} rows={3} className={`${fieldClass} py-2.5`} />
        </Field>

        <div className="flex gap-4">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- the stored poster or a local preview
            <img src={image} alt="Poster" className="h-32 w-24 shrink-0 rounded-[var(--field-radius)] border border-line bg-muted object-contain" />
          ) : (
            <span className="flex h-32 w-24 shrink-0 items-center justify-center rounded-[var(--field-radius)] border border-dashed border-line text-center text-xs text-muted-foreground">No poster</span>
          )}
          <div className="flex min-w-0 flex-col justify-center gap-2">
            {uploading ? (
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Loader2 size={16} className="animate-spin" aria-hidden /> Uploading…
              </p>
            ) : poster ? (
              <Badge tone="ok">New poster ready</Badge>
            ) : (
              <p className="text-sm text-muted-foreground">{item.noticeId ? "Changing it also changes the notice page it opens." : "Optional. Parents open it full size."}</p>
            )}
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void replace(e.target.files?.[0])} />
            <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={uploading}>
              <ImagePlus size={16} aria-hidden /> {image ? "Replace poster" : "Add a poster"}
            </Button>
          </div>
        </div>

        <Field label={image ? "More details link (optional)" : "Opens (optional)"} hint="A page on this site, starting with a slash.">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/en/news" maxLength={300} className={fieldClass} />
        </Field>

        <ScheduleFields value={draft} onChange={setDraft} />
        {error && <Note tone="error">{error}</Note>}
      </div>
    </Modal>
  );
}
