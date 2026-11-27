"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, ImagePlus, Loader2, Pencil, Trash2 } from "lucide-react";
import type { PushOverview } from "@/lib/push";
import type { PushTopic } from "@/lib/push-topics";
import { POSTER, uploadImage } from "@/lib/upload-client";
import { ConfirmDialog, Modal } from "./confirm-dialog";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Note, buttonClass, fieldClass } from "./ui";

type Notice = PushOverview["notices"][number];

const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * The notice pages that posters opened, with edit and delete. What is on phones
 * already cannot be changed; this changes the page a notification opens.
 */
export function NoticeManager({ notices, topicLabels, onChanged }: { notices: Notice[]; topicLabels: Record<PushTopic, string>; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState<Notice | null>(null);
  const [deleting, setDeleting] = useState<Notice | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function remove(notice: Notice) {
    setDeleting(null);
    setMessage(null);
    const res = await fetch(`/api/push/notices/${notice.id}`, { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return setMessage({ tone: "error", text: data.error ?? "Could not delete it. Try again." });
    setMessage({ tone: "success", text: `“${notice.title}” was deleted. Its page and poster are gone.` });
    await onChanged();
  }

  return (
    <Card className="p-6">
      <CardHeader title="Notice pages" description="Every notification sent with a poster opens one of these pages. Edit or delete them here." />
      {message && (
        <div className="mt-4">
          <Note tone={message.tone}>{message.text}</Note>
        </div>
      )}
      {notices.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No notice pages yet">Send a notification with a poster and its page appears here.</EmptyState>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {notices.map((notice) => (
            <li key={notice.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- a stored poster */}
                <img src={notice.image} alt="" className="h-16 w-12 shrink-0 rounded-md border border-line bg-muted object-cover object-top" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{notice.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {topicLabels[notice.topic as PushTopic] ?? notice.topic} · {timeFormat.format(notice.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <a href={`/en/notices/${notice.id}`} target="_blank" rel="noopener" className={buttonClass("secondary", "px-3")} aria-label={`View the page for ${notice.title}`}>
                  <ExternalLink size={16} aria-hidden /> View
                </a>
                <Button variant="secondary" className="px-3" onClick={() => setEditing(notice)}>
                  <Pencil size={16} aria-hidden /> Edit
                </Button>
                <Button variant="danger" className="px-3" onClick={() => setDeleting(notice)}>
                  <Trash2 size={16} aria-hidden /> Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <EditNotice
          key={editing.id}
          notice={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            setMessage({ tone: "success", text: "Saved. The notice page shows the changes now." });
            await onChanged();
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && void remove(deleting)}
        tone="danger"
        title="Delete this notice?"
        description={`“${deleting?.title ?? ""}”: its page and poster are deleted for good, and it leaves the Notices list and the parent page.\n\nPhones that already got the notification keep it; tapping it will say the page was not found.`}
        confirmLabel="Delete"
      />
    </Card>
  );
}

type Poster = { url: string; publicId: string } | null;

function EditNotice({ notice, onClose, onSaved }: { notice: Notice; onClose: () => void; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(notice.title);
  const [body, setBody] = useState(notice.body);
  const [url, setUrl] = useState(notice.url);
  const [poster, setPoster] = useState<Poster>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

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

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/push/notices/${notice.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body, url, image: poster ?? undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save. Try again.");
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Edit notice"
      description="This changes the notice page. A notification already on people's phones keeps its old text."
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={save} disabled={saving || uploading || !title.trim()}>
            {saving ? "Saving…" : uploading ? "Waiting for the poster…" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="mt-6 space-y-5">
        <div className="flex gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- the stored poster or a local preview */}
          <img src={preview ?? notice.image} alt="Poster" className="h-40 w-28 shrink-0 rounded-[var(--field-radius)] border border-line bg-muted object-contain" />
          <div className="flex min-w-0 flex-col justify-center gap-2">
            {uploading ? (
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Loader2 size={16} className="animate-spin" aria-hidden /> Uploading…
              </p>
            ) : poster ? (
              <Badge tone="ok">New poster ready</Badge>
            ) : (
              <p className="text-sm text-muted-foreground">Current poster</p>
            )}
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void replace(e.target.files?.[0])} />
            <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={uploading}>
              <ImagePlus size={16} aria-hidden /> Replace poster
            </Button>
          </div>
        </div>
        <Field label="Title" hint={`${title.length}/80`}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} className={fieldClass} />
        </Field>
        <Field label="Message (optional)" hint={`${body.length}/240`}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={240} rows={3} className={`${fieldClass} py-2.5`} />
        </Field>
        <Field label="More details link (optional)" hint="A page on this site, starting with a slash. Leave empty for no button.">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/en/news" maxLength={300} className={fieldClass} />
        </Field>
        {error && <Note tone="error">{error}</Note>}
      </div>
    </Modal>
  );
}
