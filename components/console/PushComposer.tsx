"use client";

import { useState, type FormEvent } from "react";
import type { PushOverview } from "@/lib/push";
import { PUSH_TOPICS, type PushTopic } from "@/lib/push-topics";
import { Button, Card, Field, Note, fieldClass } from "./ui";

const TOPIC_LABELS: Record<PushTopic, string> = {
  cricket: "Cricket followers",
  news: "Club news followers",
  keda: "KEDA parents and students",
  staff: "Staff only",
};

export function PushComposer({ initial }: { initial: PushOverview }) {
  const [overview, setOverview] = useState(initial);
  const [topic, setTopic] = useState<PushTopic>("cricket");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function refresh() {
    const res = await fetch("/api/push/send");
    if (res.ok) setOverview((await res.json()) as PushOverview);
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
        body: JSON.stringify({ topic, title: form.get("title"), body: form.get("body") || undefined, url: form.get("url") || undefined }),
      });
      const data = (await res.json()) as { error?: string; delivered?: number; failed?: number; skipped?: number };
      if (!res.ok) throw new Error(data.error ?? "Could not send. Try again.");
      const parts = [`Delivered to ${data.delivered} device${data.delivered === 1 ? "" : "s"}.`];
      if (data.failed) parts.push(`${data.failed} failed or had expired.`);
      if (data.skipped) parts.push(`${data.skipped} were not sent because of the per-send limit.`);
      setMessage({ tone: "success", text: parts.join(" ") });
      formEl.reset();
      await refresh();
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Could not send. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const audience = overview.counts[topic];

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_24rem]">
      <Card className="p-6">
        {!overview.configured && <Note tone="error">Push keys are not set on this deployment, so nothing can be sent yet.</Note>}
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
          <Field label="Title" hint="Shown in bold on the lock screen. Keep it under about 40 characters.">
            <input name="title" required maxLength={80} className={fieldClass} />
          </Field>
          <Field label="Message (optional)">
            <textarea name="body" maxLength={240} rows={3} className={`${fieldClass} py-2.5`} />
          </Field>
          <Field label="Opens (optional)" hint="A page on this site, starting with a slash. Leave empty to open the home page.">
            <input name="url" placeholder="/en#matches" pattern="/.*" maxLength={300} className={fieldClass} />
          </Field>
          {message && <Note tone={message.tone}>{message.text}</Note>}
          <Button type="submit" disabled={busy || !overview.configured || audience === 0}>
            {busy ? "Sending…" : "Send notification"}
          </Button>
          {overview.configured && audience === 0 && <p className="text-sm text-muted-foreground">Nobody follows this topic yet, so there is no one to send to.</p>}
        </form>
      </Card>

      <div className="space-y-6">
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
              <li key={entry.id} className="py-3">
                <p className="font-semibold">{entry.title}</p>
                <p className="text-sm text-muted-foreground">
                  {TOPIC_LABELS[entry.topic as PushTopic] ?? entry.topic} · {entry.delivered} delivered
                  {entry.failed ? `, ${entry.failed} failed` : ""} ·{" "}
                  {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(entry.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
