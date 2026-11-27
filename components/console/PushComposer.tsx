"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { ExternalLink, ImagePlus, Loader2, RefreshCw, Smartphone, Trash2 } from "lucide-react";
import type { PushOverview } from "@/lib/push";
import { PUSH_TOPICS, type PushTopic } from "@/lib/push-topics";
import { POSTER, uploadImage } from "@/lib/upload-client";
import { NoticeManager } from "./NoticeManager";
import { Badge, Button, Card, CardHeader, Field, Note, fieldClass } from "./ui";

const TOPIC_LABELS: Record<PushTopic, string> = {
  cricket: "Cricket followers",
  news: "Club news followers",
  keda: "KEDA parents and students",
  staff: "Staff only",
};

type PosterState =
  | { status: "none" }
  | { status: "uploading"; preview: string }
  | { status: "ready"; preview: string; url: string; publicId: string }
  | { status: "failed"; preview: string; error: string; file: File };

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Colombo",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

export function PushComposer({ initial }: { initial: PushOverview }) {
  const [overview, setOverview] = useState(initial);
  const [topic, setTopic] = useState<PushTopic>("cricket");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [poster, setPoster] = useState<PosterState>({ status: "none" });
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "error" | "success";
    text: string;
    notice?: string | null;
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // The local preview is an object URL; let it go when it is replaced or the page closes.
  const preview = poster.status === "none" ? null : poster.preview;
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  async function refresh() {
    const res = await fetch("/api/push/send");
    if (res.ok) setOverview((await res.json()) as PushOverview);
  }

  async function choosePoster(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setMessage({
        tone: "error",
        text: "Choose a JPEG, PNG or WebP image for the poster.",
      });
      return;
    }
    setMessage(null);
    const local = URL.createObjectURL(file);
    setPoster({ status: "uploading", preview: local });
    try {
      // Kept larger and sharper than a photo, so the small print on a poster stays readable.
      const uploaded = await uploadImage(file, "notices", POSTER);
      setPoster({ status: "ready", preview: local, ...uploaded });
    } catch (e) {
      setPoster({
        status: "failed",
        preview: local,
        file,
        error: e instanceof Error ? e.message : "The poster could not be uploaded.",
      });
    }
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    void choosePoster(event.dataTransfer.files[0]);
  }

  function removePoster() {
    setPoster({ status: "none" });
    if (fileInput.current) fileInput.current.value = "";
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic,
          title,
          body: body || undefined,
          url: form.get("url") || undefined,
          image: poster.status === "ready" ? { url: poster.url, publicId: poster.publicId } : undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        delivered?: number;
        failed?: number;
        skipped?: number;
        notice?: string | null;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not send. Try again.");
      const parts = [`Delivered to ${data.delivered} device${data.delivered === 1 ? "" : "s"}.`];
      if (data.failed) parts.push(`${data.failed} failed or had expired.`);
      if (data.skipped) parts.push(`${data.skipped} were not sent because of the per-send limit.`);
      setMessage({
        tone: "success",
        text: parts.join(" "),
        notice: data.notice,
      });
      formEl.reset();
      setTitle("");
      setBody("");
      removePoster();
      await refresh();
    } catch (e) {
      setMessage({
        tone: "error",
        text: e instanceof Error ? e.message : "Could not send. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  const audience = overview.counts[topic];
  const uploading = poster.status === "uploading";
  const posterProblem = poster.status === "failed";

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 space-y-8">
        <Card className="p-6">
          {!overview.configured && (
            <div className="mb-5">
              <Note tone="error">Push keys are not set on this deployment, so nothing can be sent yet.</Note>
            </div>
          )}
          <form onSubmit={send} className="space-y-5">
            <Field label="Send to" hint={`${audience} device${audience === 1 ? "" : "s"} follow this topic.`}>
              <select className={fieldClass} value={topic} onChange={(e) => setTopic(e.target.value as PushTopic)}>
                {PUSH_TOPICS.map((t) => (
                  <option key={t} value={t}>
                    {TOPIC_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title" hint={`Shown in bold on the lock screen. Keep it under about 40 characters (${title.length}/80).`}>
              <input name="title" required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} />
            </Field>
            <Field label="Message (optional)" hint={`${body.length}/240`}>
              <textarea name="body" maxLength={240} rows={3} value={body} onChange={(e) => setBody(e.target.value)} className={`${fieldClass} py-2.5`} />
            </Field>

            <div>
              <span className="mb-1.5 block text-sm font-semibold">Poster (optional)</span>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                id="push-poster"
                onChange={(e: ChangeEvent<HTMLInputElement>) => void choosePoster(e.target.files?.[0])}
              />
              {poster.status === "none" ? (
                <label
                  htmlFor="push-poster"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--field-radius)] border-2 border-dashed px-6 py-8 text-center transition-colors ${dragging ? "border-fg bg-muted" : "border-line hover:bg-muted"}`}
                >
                  <ImagePlus size={28} aria-hidden className="text-muted-foreground" />
                  <span className="font-semibold">Add a poster</span>
                  <span className="max-w-sm text-sm text-muted-foreground">Drop an image here or tap to choose one. JPEG, PNG or WebP. Parents open it full size, zoom in and save it.</span>
                </label>
              ) : (
                <div className="flex flex-col gap-4 rounded-[var(--field-radius)] border border-line p-3 sm:flex-row">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file */}
                  <img src={poster.preview} alt="Chosen poster" className="max-h-64 w-full rounded-[calc(var(--field-radius)-2px)] bg-muted object-contain sm:w-44" />
                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                    <div>
                      {poster.status === "uploading" && (
                        <p className="flex items-center gap-2 text-sm font-semibold">
                          <Loader2 size={16} className="animate-spin" aria-hidden /> Preparing and uploading…
                        </p>
                      )}
                      {poster.status === "ready" && <Badge tone="ok">Poster ready</Badge>}
                      {poster.status === "failed" && <Note tone="error">{poster.error}</Note>}
                      <p className="mt-2 text-sm text-muted-foreground">The notification opens a page with this poster shown whole. The link below becomes a “More details” button on that page.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {poster.status === "failed" && (
                        <Button variant="secondary" onClick={() => void choosePoster(poster.file)}>
                          <RefreshCw size={16} aria-hidden /> Try again
                        </Button>
                      )}
                      <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={uploading}>
                        <ImagePlus size={16} aria-hidden /> Change
                      </Button>
                      <Button variant="danger" onClick={removePoster} disabled={uploading}>
                        <Trash2 size={16} aria-hidden /> Remove
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Field
              label={poster.status === "none" ? "Opens (optional)" : "More details link (optional)"}
              hint={
                poster.status === "none"
                  ? "A page on this site, starting with a slash. Leave empty to open the home page."
                  : "A page on this site, starting with a slash, shown as a button under the poster."
              }
            >
              <input name="url" placeholder="/en/news" pattern="/.*" maxLength={300} className={fieldClass} />
            </Field>
            {message && (
              <Note tone={message.tone}>
                {message.text}{" "}
                {message.notice && (
                  <a href={message.notice} target="_blank" rel="noopener" className="inline-flex items-center gap-1 underline underline-offset-2">
                    Open the poster page <ExternalLink size={14} aria-hidden />
                  </a>
                )}
              </Note>
            )}
            <Button type="submit" disabled={busy || uploading || posterProblem || !overview.configured || audience === 0}>
              {busy ? "Sending…" : uploading ? "Waiting for the poster…" : "Send notification"}
            </Button>
            {overview.configured && audience === 0 && <p className="text-sm text-muted-foreground">Nobody follows this topic yet, so there is no one to send to.</p>}
          </form>
        </Card>

        <NoticeManager notices={overview.notices} topicLabels={TOPIC_LABELS} onChanged={refresh} />
      </div>

      <div className="space-y-6">
        <Card className="p-6">
          <CardHeader title="Preview" description="How it arrives on a phone." action={<Smartphone size={20} aria-hidden className="text-muted-foreground" />} />
          <NotificationPreview title={title} body={body} image={preview} />
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold tracking-tight">Subscribers</h2>
          <dl className="mt-4 space-y-2">
            {PUSH_TOPICS.map((t) => (
              <div key={t} className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">{TOPIC_LABELS[t]}</dt>
                <dd className="text-lg font-bold tabular-nums">{overview.counts[t]}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2">
              <dt className="font-semibold">Devices in total</dt>
              <dd className="text-lg font-bold tabular-nums">{overview.total}</dd>
            </div>
          </dl>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold tracking-tight">Recently sent</h2>
          {overview.log.length === 0 && <p className="mt-3 text-muted-foreground">Nothing has been sent yet.</p>}
          <ul className="mt-3 divide-y divide-line">
            {overview.log.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 py-3">
                {entry.image && (
                  <a href={`/en/notices/${entry.id}`} target="_blank" rel="noopener" className="shrink-0" aria-label={`Open the poster page for ${entry.title}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a stored poster */}
                    <img src={entry.image} alt="" className="h-14 w-11 rounded-md border border-line bg-muted object-cover object-top" />
                  </a>
                )}
                <div className="min-w-0">
                  <p className="font-semibold">{entry.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {TOPIC_LABELS[entry.topic as PushTopic] ?? entry.topic} · {entry.delivered} delivered
                    {entry.failed ? `, ${entry.failed} failed` : ""} · {timeFormat.format(entry.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/**
 * A notification as Android draws it when expanded: app line, title, text, and
 * the picture cropped to a wide strip. Under it, the poster page it opens.
 */
function NotificationPreview({ title, body, image }: { title: string; body: string; image: string | null }) {
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-2xl bg-muted p-3">
        <div className="rounded-xl border border-line bg-surface p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {/* eslint-disable-next-line @next/next/no-img-element -- the app icon */}
            <img src="/icons/icon-192.png" alt="" className="h-5 w-5 rounded-full" />
            <span className="font-semibold text-fg">Kavery Sports Club</span>
            <span aria-hidden>·</span>
            <span>now</span>
          </div>
          <p className={`mt-2 font-semibold leading-snug ${title ? "" : "text-muted-foreground"}`}>{title || "Your title"}</p>
          {body && <p className="mt-0.5 line-clamp-3 text-sm text-muted-foreground">{body}</p>}
          {image && (
            // eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file
            <img src={image} alt="" className="mt-3 aspect-[2/1] w-full rounded-lg bg-muted object-cover" />
          )}
        </div>
      </div>
      {image ? (
        <>
          <p className="text-sm text-muted-foreground">
            Android phones and computers show the poster inside the notification, cropped like this. iPhones show the text only. Either way, tapping it opens the whole poster:
          </p>
          <div className="overflow-hidden rounded-xl border border-line bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file */}
            <img src={image} alt="" className="block h-auto w-full" />
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Add a poster to send a notice parents can open full size.</p>
      )}
    </div>
  );
}
