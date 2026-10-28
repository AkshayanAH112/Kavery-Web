"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertCircle, BellRing, CalendarCheck, Check, Loader2, LogOut, Megaphone, MonitorCheck, QrCode, UserPlus, UserRound, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import ResultsView, { CurrentExam, type ResultsPayload } from "@/components/site/ResultsView";

type Notice = { kind: "leave"; date: string; leaveCount: number } | { kind: "result"; date: string; name: string };
type OnlinePaper = {
  id: string;
  title: string;
  mode: "practice" | "exam";
  opensAt: string | null;
  closesAt: string | null;
  durationMinutes: number;
  status: "draft" | "scheduled" | "open" | "closed";
  attempt: { finished: boolean; deadline: string } | null;
  result: { score: number; max: number; toMark: number } | null;
};
type Child = ResultsPayload & {
  photoUrl: string | null;
  attendance: { marked: number; present: number; absent: number; percent: number | null; recent: { date: string; subject: string | null; time: string | null; present: boolean }[] };
  notices: Notice[];
  online: OnlinePaper[];
};
type Me = { children: Child[]; announcements: { title: string; slug: string; excerpt: string | null; publishedAt: string | null }[] };

const SCANNER_ID = "parent-card-scanner";
const inputClass =
  "w-full min-h-12 rounded-[var(--field-radius)] border border-line bg-surface-2/60 px-4 py-3 text-base text-fg outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent";

/** The child's photo, cropped like the ID card (210 × 276); a plain silhouette when there is none. */
function ChildPhoto({ child, className }: { child: Child; className: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`shrink-0 overflow-hidden bg-surface-2 ${className}`}>
      {child.photoUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- a private file behind the parent's cookie
        <img src={child.photoUrl} alt={child.student.name} onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <UserRound className="h-full w-full p-[18%] text-muted-foreground" aria-hidden />
      )}
    </div>
  );
}

const formatDate = (value: string) => new Date(value).toLocaleDateString("en-GB", { timeZone: "Asia/Colombo", day: "numeric", month: "short", year: "numeric" });

/**
 * Sign-in for one child: the card's QR code, or the index number with the
 * registered phone. The camera library is only fetched when a parent taps
 * "Scan", and the camera is released the moment a code is read or scanning stops.
 */
function SignIn({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const t = useTranslations("Parents");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const stopRef = useRef<(() => Promise<void>) | null>(null);

  const signIn = useCallback(
    async (body: Record<string, string>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/public/parents/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
        if (!res.ok) {
          const key = data.code ? `error_${data.code}` : "";
          setError(key && t.has(key) ? t(key) : t("error_generic"));
          return;
        }
        onDone();
      } catch {
        setError(t("error_generic"));
      } finally {
        setBusy(false);
      }
    },
    [onDone, t],
  );

  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Html5Qrcode(SCANNER_ID);
        let stopped = false;
        const stop = async () => {
          if (stopped) return;
          stopped = true;
          await scanner.stop().catch(() => {});
          scanner.clear();
        };
        stopRef.current = stop;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 230, height: 230 } },
          (text) => {
            stop().then(() => {
              setScanning(false);
              signIn({ code: text });
            });
          },
          () => {},
        );
        if (cancelled) await stop();
      } catch {
        if (!cancelled) {
          setScanning(false);
          setError(t("scan_camera_error"));
        }
      }
    })();
    return () => {
      cancelled = true;
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [scanning, signIn, t]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    signIn({ registrationNumber: String(form.get("registrationNumber") ?? ""), phone: String(form.get("phone") ?? "") });
  };

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p role="alert" className="flex items-start gap-3 rounded-[var(--field-radius)] border border-brand/40 bg-brand/15 p-4 text-fg">
          <AlertCircle size={20} className="mt-0.5 shrink-0" aria-hidden /> {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="live-card flex flex-col gap-4 p-6 md:p-8">
          <h2 className="eyebrow text-accent">{t("scan_title")}</h2>
          <p className="leading-relaxed text-muted-foreground">{t("scan_body")}</p>
          {scanning && <div id={SCANNER_ID} className="overflow-hidden rounded-[var(--card-radius)] bg-black" />}
          <button type="button" disabled={busy} onClick={() => setScanning((v) => !v)} className={`btn ${scanning ? "btn-ghost" : "btn-accent"} mt-auto self-start`}>
            <span>
              {scanning ? <X size={18} aria-hidden /> : <QrCode size={18} aria-hidden />}
              {scanning ? t("scan_stop") : t("scan_start")}
            </span>
          </button>
        </section>

        <form onSubmit={onSubmit} className="live-card flex flex-col gap-4 p-6 md:p-8">
          <h2 className="eyebrow text-accent">{t("manual_title")}</h2>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-fg">{t("index_label")}</span>
            <input name="registrationNumber" required placeholder={t("index_placeholder")} autoComplete="off" autoCapitalize="characters" spellCheck={false} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-fg">{t("phone_label")}</span>
            <input name="phone" type="tel" required autoComplete="tel" className={inputClass} />
            <span className="mt-1.5 block text-sm text-muted-foreground">{t("phone_hint")}</span>
          </label>
          <button type="submit" disabled={busy} className="btn btn-brand self-start">
            <span>
              {busy && <Loader2 className="animate-spin" size={18} aria-hidden />}
              {busy ? t("checking") : t("submit")}
            </span>
          </button>
        </form>
      </div>

      {onCancel && (
        <button type="button" onClick={onCancel} className="inline-flex min-h-11 items-center self-start font-semibold text-muted-foreground hover:text-fg">
          {t("cancel")}
        </button>
      )}
    </div>
  );
}

/**
 * The child's online papers: an open one leads with Start (or Continue), a finished practice paper
 * shows its score, an exam paper waits for the results. The paper itself is on its own page.
 */
function OnlineExams({ child }: { child: Child }) {
  const t = useTranslations("Parents");
  const locale = useLocale();
  const at = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(locale === "ta" ? "ta-LK" : "en-GB", { timeZone: "Asia/Colombo", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
  const href = (p: OnlinePaper) => `/${locale}/parents/exam/${p.id}?student=${encodeURIComponent(child.student.registrationNumber)}`;

  return (
    <section className="live-card p-6 md:p-8">
      <h2 className="eyebrow flex items-center gap-2 text-accent">
        <MonitorCheck size={16} aria-hidden /> {t("online_title")}
      </h2>
      <ul className="mt-4 divide-y divide-line">
        {child.online.map((p) => {
          const sitting = p.attempt && !p.attempt.finished;
          return (
            <li key={p.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-lg font-bold text-fg wrap-break-word">{p.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {p.mode === "exam" ? t("online_exam") : t("online_practice")} · {t("online_minutes", { minutes: p.durationMinutes })} ·{" "}
                  {p.status === "open" ? <span className="font-semibold text-ok">{t("online_open", { time: at(p.closesAt) })}</span> : p.status === "scheduled" ? t("online_opens", { time: at(p.opensAt) }) : t("online_closed")}
                </p>
                {p.attempt?.finished && (
                  <p className="mt-1 text-[0.9375rem] font-semibold text-fg">
                    {t("online_finished")}
                    {p.result ? ` · ${t("online_score", { score: p.result.score, max: p.result.max })}` : p.mode === "exam" ? ` · ${t("online_exam_result")}` : ""}
                    {p.result && p.result.toMark > 0 && <span className="block text-sm font-normal text-muted-foreground">{t("online_score_pending", { count: p.result.toMark })}</span>}
                  </p>
                )}
              </div>
              {p.attempt?.finished ? (
                <Link href={href(p)} className="btn btn-ghost shrink-0 self-start sm:self-center">
                  <span>{t("online_view")}</span>
                </Link>
              ) : sitting || p.status === "open" ? (
                <Link href={href(p)} className="btn btn-brand shrink-0 self-start sm:self-center">
                  <span>{sitting ? t("online_continue") : t("online_start")}</span>
                </Link>
              ) : p.status === "closed" ? (
                <span className="shrink-0 text-sm font-semibold text-muted-foreground">{t("online_missed")}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-sm text-muted-foreground">{t("online_note")}</p>
    </section>
  );
}

function ChildPanel({ child }: { child: Child }) {
  const t = useTranslations("Parents");
  const { attendance } = child;
  const noticeText = (n: Notice) =>
    n.kind === "result" ? t("notice_result", { exam: n.name }) :t(n.leaveCount >= 3 ? "notice_leave_many" : "notice_leave", { count: n.leaveCount });

  return (
    <div className="flex flex-col gap-8">
      {/* An exam open right now comes first: it is the one thing on this page with a clock on it. */}
      {child.online.some((p) => p.status === "open" && !p.attempt?.finished) && <OnlineExams child={child} />}

      {/* The rank in the latest exam leads: it is what a parent opens the page for after results come out. */}
      <CurrentExam results={child.results} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="live-card p-6 md:p-8">
          <h2 className="eyebrow flex items-center gap-2 text-accent">
            <BellRing size={16} aria-hidden /> {t("notices_title")}
          </h2>
          {child.notices.length === 0 ? (
            <p className="mt-4 text-muted-foreground">{t("notices_empty")}</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {child.notices.map((n, i) => (
                <li key={i} className="py-3">
                  <p className={`leading-relaxed ${n.kind === "leave" ? "font-semibold text-fg" : "text-fg"}`}>{noticeText(n)}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{formatDate(n.date)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="live-card p-6 md:p-8">
          <h2 className="eyebrow flex items-center gap-2 text-accent">
            <CalendarCheck size={16} aria-hidden /> {t("attendance_title")}
          </h2>
          {attendance.marked === 0 ? (
            <p className="mt-4 text-muted-foreground">{t("attendance_empty")}</p>
          ) : (
            <>
              <p className="display mt-3 text-5xl text-accent tabular">{attendance.percent}%</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("attendance_percent")} · {t("attendance_count", { present: attendance.present, marked: attendance.marked })}
              </p>
              <h3 className="mt-6 text-sm font-semibold text-muted-foreground">{t("attendance_recent")}</h3>
              <ul className="mt-2 divide-y divide-line">
                {attendance.recent.map((c, i) => (
                  <li key={i} className="flex items-center justify-between gap-4 py-2.5 text-[0.9375rem]">
                    <span className="min-w-0">
                      <span className="tabular text-fg">{formatDate(c.date)}</span>
                      <span className="text-muted-foreground"> · {c.subject || t("class_label")}</span>
                    </span>
                    <span className={`inline-flex shrink-0 items-center gap-1 font-semibold ${c.present ? "text-ok" : "text-danger"}`}>
                      {c.present ? <Check size={15} aria-hidden /> : <X size={15} aria-hidden />}
                      {c.present ? t("present") : t("absent")}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {child.online.length > 0 && !child.online.some((p) => p.status === "open" && !p.attempt?.finished) && <OnlineExams child={child} />}

      <section>
        <h2 className="eyebrow mb-4 text-accent">{t("results_title")}</h2>
        <ResultsView data={child} />
      </section>
    </div>
  );
}

export default function ParentPortal() {
  const t = useTranslations("Parents");
  const locale = useLocale();
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState(0);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/public/parents/me", { cache: "no-store" });
      setMe(res.ok ? ((await res.json()) as Me) : null);
    } catch {
      setMe(null);
    }
    setSelected(0);
    setAdding(false);
    setLoaded(true);
  }, []);

  useEffect(() => {
    // Nothing is known about this visitor until the server has read their cookie.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const signOut = async () => {
    await fetch("/api/public/parents/session", { method: "DELETE" }).catch(() => {});
    setMe(null);
  };

  if (!loaded)
    return (
      <div className="flex justify-center p-16">
        <Loader2 className="animate-spin text-accent" size={36} aria-label="Loading" />
      </div>
    );
  if (!me) return <SignIn onDone={load} />;

  const child = me.children[Math.min(selected, me.children.length - 1)];

  return (
    <div className="flex flex-col gap-8">
      <header className="live-card flex flex-col gap-5 p-6 md:p-8">
        {me.children.length > 1 && (
          <div className="flex flex-wrap gap-2" role="tablist">
            {me.children.map((c, i) => (
              <button
                key={c.student.registrationNumber || i}
                type="button"
                role="tab"
                aria-selected={i === selected}
                onClick={() => setSelected(i)}
                className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border pl-1.5 pr-4 text-sm font-semibold transition-colors ${i === selected ? "border-accent bg-accent text-on-accent" : "border-line text-muted-foreground hover:text-fg"}`}
              >
                <ChildPhoto key={c.photoUrl} child={c} className="size-8 rounded-full" />
                {c.student.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <ChildPhoto key={child.photoUrl} child={child} className="aspect-210/276 w-20 rounded-2xl border border-line md:w-24" />
            <div className="min-w-0">
              <h2 className="text-2xl font-extrabold text-fg wrap-break-word md:text-3xl">{child.student.name}</h2>
              <p className="mt-1 text-muted-foreground">
                {t("grade", { grade: child.student.grade })}
                {child.student.batchName ? ` · ${child.student.batchName}` : ""} · <span className="tabular">{child.student.registrationNumber}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setAdding((v) => !v)} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold text-accent hover:text-fg">
              <UserPlus size={16} aria-hidden /> {t("add_child")}
            </button>
            <button type="button" onClick={signOut} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold text-muted-foreground hover:text-fg">
              <LogOut size={16} aria-hidden /> {t("sign_out")}
            </button>
          </div>
        </div>
      </header>

      {adding ? (
        <SignIn onDone={load} onCancel={() => setAdding(false)} />
      ) : (
        <>
          <ChildPanel key={child.student.registrationNumber} child={child} />

          <section className="live-card p-6 md:p-8">
            <h2 className="eyebrow flex items-center gap-2 text-accent">
              <Megaphone size={16} aria-hidden /> {t("announcements_title")}
            </h2>
            {me.announcements.length === 0 ? (
              <p className="mt-4 text-muted-foreground">{t("announcements_empty")}</p>
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {me.announcements.map((a) => (
                  <li key={a.slug}>
                    <Link href={`/${locale}/news/${a.slug}`} className="group block py-4">
                      <p className="text-lg font-bold text-fg group-hover:text-accent">{a.title}</p>
                      {a.excerpt && <p className="mt-1 leading-relaxed text-muted-foreground">{a.excerpt}</p>}
                      {a.publishedAt && <p className="mt-1 text-sm text-muted-foreground">{formatDate(a.publishedAt)}</p>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <a href={`/${locale}#app`} className="btn btn-ghost mt-4">
              <span>
                <BellRing size={18} aria-hidden /> {t("alerts_cta")}
              </span>
            </a>
          </section>

          <p className="text-sm text-muted-foreground">{t("stay_note")}</p>
        </>
      )}
    </div>
  );
}
