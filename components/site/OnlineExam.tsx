"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronLeft, Clock, CloudOff, Loader2, Send, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

type Key = { answer: string | null; accepted: string[]; awarded: number | null };
type Question = { id: string; kind: "choice" | "short"; prompt: string; hasImage: boolean; version: number; marks: number; options: { id: string; text: string; hasImage: boolean }[]; key?: Key };
type View = {
  now: string;
  paper: { id: string; title: string; mode: "practice" | "exam"; instructions: string; durationMinutes: number; opensAt: string | null; closesAt: string | null; status: "draft" | "scheduled" | "open" | "closed"; questionCount: number; totalMarks: number };
  student: { name: string; registrationNumber: string };
  attempt: null | { startedAt: string; deadline: string; finished: boolean; finishedAt: string | null; handedIn: boolean };
  questions?: Question[];
  answers?: Record<string, Given>;
  result?: { score: number; max: number; toMark: number } | null;
};
type Given = { choice: string | null; response: string | null };
type Answer = { choice: string | null } | { response: string | null };

const fieldClass =
  "w-full rounded-(--field-radius) border border-line bg-surface-2/60 px-4 py-3 text-base text-fg outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent";

const isAnswered = (q: Question, g: Given | undefined) => (q.kind === "choice" ? !!g?.choice : !!g?.response?.trim());

/** A picture in the paper. It comes from a signed-in route, already shrunk, so a plain image. */
function Picture({ src, alt, className }: { src: string; alt: string; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- a private file behind the exam's own route
  return <img src={src} alt={alt} className={`bg-white ${className}`} />;
}

/**
 * The exam page: the paper's cover until the child starts, then one question at a time against the
 * clock, then their score (a practice paper) and — once the paper may be reviewed — the answers.
 *
 * Every answer is sent the moment it is given (a choice) or a moment after typing stops (a written
 * answer). One that cannot be sent waits and is tried again, so a weak signal loses nothing that was
 * saved before the deadline. The clock is the server's: the deadline is fixed when the child starts,
 * and the page only counts down to it, corrected for the phone's own clock being off.
 */
export default function OnlineExam({ paperId, student }: { paperId: string; student: string }) {
  const t = useTranslations("Exam");
  const locale = useLocale();
  const [view, setView] = useState<View | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  // How far the phone's clock is from the server's, so the countdown is right on a phone set wrong.
  const [offset, setOffset] = useState(0);
  const api = `/api/public/online/${paperId}`;

  const accept = useCallback((v: View) => {
    setOffset(Date.parse(v.now) - Date.now());
    setView(v);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${api}?student=${encodeURIComponent(student)}`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as View & { code?: string };
      if (!res.ok) return setFailure(data.code ?? "generic");
      accept(data);
    } catch {
      setFailure("generic");
    }
  }, [api, student, accept]);

  useEffect(() => {
    // Nothing is known until the server has read this browser's parent cookie.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const start = async () => {
    setStarting(true);
    setNotice(null);
    try {
      const res = await fetch(`${api}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ student }) });
      const data = (await res.json().catch(() => ({}))) as View & { code?: string };
      if (res.ok) accept(data);
      else {
        setNotice(t.has(`error_${data.code}`) ? t(`error_${data.code}`) : t("error_generic"));
        load();
      }
    } catch {
      setNotice(t("error_generic"));
    } finally {
      setStarting(false);
    }
  };

  const at = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(locale === "ta" ? "ta-LK" : "en-GB", { timeZone: "Asia/Colombo", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
  const back = (
    <Link href={`/${locale}/parents`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-fg">
      <ChevronLeft size={16} aria-hidden /> {t("back")}
    </Link>
  );

  if (failure) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <p role="alert" className="live-card flex items-start gap-3 p-6 text-fg">
          <AlertCircle size={20} className="mt-0.5 shrink-0 text-brand-text" aria-hidden />
          {t.has(`error_${failure}`) ? t(`error_${failure}`) : t("error_generic")}
        </p>
      </div>
    );
  }
  if (!view)
    return (
      <div className="flex justify-center p-16">
        <Loader2 className="animate-spin text-accent" size={36} aria-label="Loading" />
      </div>
    );

  if (view.attempt && !view.attempt.finished) return <Sitting view={view} api={api} student={student} offset={offset} onDone={accept} onLost={load} />;

  const { paper } = view;
  if (view.attempt) return <Finished view={view} api={api} student={student} back={back} />;

  const closesIn = paper.closesAt ? Date.parse(paper.closesAt) - Date.parse(view.now) : 0;
  const late = paper.status === "open" && closesIn < paper.durationMinutes * 60_000;

  return (
    <div className="flex flex-col gap-4">
      {back}
      <section className="live-card flex flex-col gap-5 p-6 md:p-8">
        <div>
          <p className="eyebrow text-accent">{paper.mode === "exam" ? t("exam") : t("practice")}</p>
          <h1 className="mt-2 text-3xl font-extrabold text-fg wrap-break-word md:text-4xl">{paper.title}</h1>
          <p className="mt-1 text-muted-foreground">
            {view.student.name} · <span className="tabular">{view.student.registrationNumber}</span>
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-3">
          {[t("facts_questions", { count: paper.questionCount }), t("facts_marks", { marks: paper.totalMarks }), t("facts_minutes", { minutes: paper.durationMinutes })].map((fact) => (
            <div key={fact} className="rounded-(--field-radius) border border-line p-3 text-center font-semibold text-fg">
              {fact}
            </div>
          ))}
        </dl>
        {paper.opensAt && <p className="text-muted-foreground">{t("window", { opens: at(paper.opensAt), closes: at(paper.closesAt) })}</p>}
        {paper.instructions && <p className="whitespace-pre-wrap rounded-(--field-radius) border border-line bg-surface-2/60 p-4 leading-relaxed text-fg">{paper.instructions}</p>}
        {notice && (
          <p role="alert" className="flex items-start gap-3 rounded-(--field-radius) border border-brand/40 bg-brand/15 p-4 text-fg">
            <AlertCircle size={20} className="mt-0.5 shrink-0" aria-hidden /> {notice}
          </p>
        )}
        {paper.status === "open" ? (
          <>
            <p className="leading-relaxed text-muted-foreground">{t("start_note")}</p>
            {late && <p className="font-semibold text-fg">{t("late_note", { time: at(paper.closesAt), minutes: Math.max(1, Math.floor(closesIn / 60_000)) })}</p>}
            <button type="button" onClick={start} disabled={starting} className="btn btn-brand self-start">
              <span>
                {starting && <Loader2 className="animate-spin" size={18} aria-hidden />}
                {starting ? t("starting") : t("start")}
              </span>
            </button>
          </>
        ) : (
          <p className="text-lg font-semibold text-fg">{paper.status === "scheduled" ? t("opens_at", { time: at(paper.opensAt) }) : t("error_closed")}</p>
        )}
      </section>
    </div>
  );
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};

function Sitting({ view, api, student, offset, onDone, onLost }: { view: View; api: string; student: string; offset: number; onDone: (v: View) => void; onLost: () => void }) {
  const t = useTranslations("Exam");
  const questions = view.questions ?? [];
  const [given, setGiven] = useState<Record<string, Given>>(() => view.answers ?? {});
  const [index, setIndex] = useState(0);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "offline">("saved");
  const [confirming, setConfirming] = useState(false);
  const [handingIn, setHandingIn] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Answers not yet confirmed by the server, newest per question; and written answers still being typed.
  const pending = useRef(new Map<string, { body: Answer; version: number }>());
  const typing = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; body: Answer }>());
  const version = useRef(0);
  const flushing = useRef<Promise<void> | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushLater = useRef<() => void>(() => {});
  const ended = useRef(false);

  const deadline = Date.parse(view.attempt!.deadline);
  const left = deadline - (now + offset);

  const flush = useCallback((): Promise<void> => {
    if (flushing.current) return flushing.current;
    const run = (async () => {
      while (pending.current.size) {
        setSaveState("saving");
        const [questionId, item] = pending.current.entries().next().value!;
        let res: Response | null = null;
        try {
          res = await fetch(`${api}/answer`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ student, questionId, ...item.body }) });
        } catch {
          // No connection: keep it and try again.
        }
        if (!res || res.status >= 500 || res.status === 429) {
          setSaveState("offline");
          retry.current ??= setTimeout(() => {
            retry.current = null;
            flushLater.current();
          }, 4000);
          return;
        }
        // Time is up (or the sitting was reset by staff): the server's view of it is the truth.
        if (res.status === 409 || res.status === 401 || res.status === 404) {
          pending.current.clear();
          ended.current = true;
          onLost();
          return;
        }
        if (pending.current.get(questionId)?.version === item.version) pending.current.delete(questionId);
      }
      setSaveState("saved");
    })();
    flushing.current = run.finally(() => {
      flushing.current = null;
    });
    return flushing.current;
  }, [api, student, onLost]);

  useEffect(() => {
    flushLater.current = flush;
  }, [flush]);

  const queue = useCallback(
    (questionId: string, body: Answer) => {
      pending.current.set(questionId, { body, version: ++version.current });
      flush();
    },
    [flush],
  );

  /** Sends a written answer now instead of waiting for the typing to stop. */
  const settle = useCallback(() => {
    for (const [questionId, { timer, body }] of typing.current) {
      clearTimeout(timer);
      queue(questionId, body);
    }
    typing.current.clear();
  }, [queue]);

  const handIn = useCallback(async () => {
    if (ended.current) return;
    ended.current = true;
    setHandingIn(true);
    setConfirming(false);
    settle();
    await flush();
    try {
      const res = await fetch(`${api}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ student }) });
      if (res.ok) return onDone((await res.json()) as View);
    } catch {
      // Falls through: the child can press Hand in again once the connection is back.
    }
    ended.current = false;
    setHandingIn(false);
    setSaveState("offline");
  }, [api, student, settle, flush, onDone]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const online = () => flush();
    const leaving = (e: BeforeUnloadEvent) => {
      if (pending.current.size || typing.current.size) e.preventDefault();
    };
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", leaving);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", leaving);
    };
  }, [flush]);

  // At the deadline the paper hands itself in, with whatever was saved.
  useEffect(() => {
    if (left <= 0 && !ended.current) handIn();
  }, [left, handIn]);

  const choose = (q: Question, choice: string) => {
    setGiven((g) => ({ ...g, [q.id]: { choice, response: null } }));
    queue(q.id, { choice });
  };
  const write = (q: Question, response: string) => {
    setGiven((g) => ({ ...g, [q.id]: { choice: null, response } }));
    const body = { response };
    clearTimeout(typing.current.get(q.id)?.timer);
    typing.current.set(q.id, {
      body,
      timer: setTimeout(() => {
        typing.current.delete(q.id);
        queue(q.id, body);
      }, 800),
    });
    setSaveState("saving");
  };
  const go = (i: number) => {
    settle();
    setIndex(i);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const q = questions[index];
  const answered = questions.filter((x) => isAnswered(x, given[x.id])).length;
  const image = (question: Question, option?: string) => `${api}/image?student=${encodeURIComponent(student)}&q=${question.id}${option ? `&o=${option}` : ""}&v=${question.version}`;
  const low = left < 5 * 60_000;

  return (
    <div className="flex flex-col gap-5">
      <div className="sticky top-(--nav-h) z-20 rounded-(--card-radius) border border-line bg-bg/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <p className="min-w-0 truncate font-bold text-fg">{view.paper.title}</p>
          <p className={`flex shrink-0 items-center gap-1.5 text-2xl font-extrabold tabular ${low ? "text-brand-text" : "text-accent"}`} aria-label={t("time_left")} role="timer">
            <Clock size={20} aria-hidden /> {clock(left)}
          </p>
        </div>
        <p className="mt-1 flex flex-wrap items-center justify-between gap-x-4 text-sm text-muted-foreground">
          <span>{t("answered_count", { answered, total: questions.length })}</span>
          <span className={`inline-flex items-center gap-1 ${saveState === "offline" ? "font-semibold text-brand-text" : ""}`} aria-live="polite">
            {saveState === "saved" ? <Check size={14} aria-hidden /> : saveState === "saving" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <CloudOff size={14} aria-hidden />}
            {t(saveState === "saved" ? "saved" : saveState === "saving" ? "saving" : "not_saved")}
          </span>
        </p>
      </div>

      {q && (
        <section className="live-card flex flex-col gap-5 p-5 md:p-8" aria-labelledby="question-heading">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="question-heading" className="eyebrow text-accent">
              {t("question_of", { n: index + 1, total: questions.length })}
            </h2>
            <span className="shrink-0 text-sm font-semibold text-muted-foreground">{t("marks", { marks: q.marks })}</span>
          </div>
          {q.prompt && <p className="whitespace-pre-wrap text-lg leading-relaxed text-fg wrap-break-word">{q.prompt}</p>}
          {q.hasImage && <Picture src={image(q)} alt={t("picture_alt")} className="max-h-[50vh] w-auto max-w-full self-start rounded-(--field-radius) p-1" />}

          {q.kind === "choice" ? (
            <div role="radiogroup" aria-labelledby="question-heading" className="flex flex-col gap-3">
              {q.options.map((o, i) => {
                const selected = given[q.id]?.choice === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => choose(q, o.id)}
                    className={`flex min-h-14 w-full cursor-pointer items-center gap-4 rounded-(--field-radius) border-2 px-4 py-3 text-left transition-colors ${selected ? "border-accent bg-accent/15" : "border-line hover:border-muted-foreground"}`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 font-bold tabular ${selected ? "border-accent bg-accent text-on-accent" : "border-line text-muted-foreground"}`}>{i + 1}</span>
                    <span className="flex min-w-0 flex-col gap-2">
                      {o.hasImage && <Picture src={image(q, o.id)} alt={t("option_picture_alt", { n: i + 1 })} className="max-h-32 w-auto max-w-full rounded p-0.5" />}
                      {o.text && <span className="text-[1.0625rem] leading-snug text-fg wrap-break-word">{o.text}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <textarea
              rows={3}
              maxLength={500}
              aria-labelledby="question-heading"
              placeholder={t("type_answer")}
              className={fieldClass}
              value={given[q.id]?.response ?? ""}
              onChange={(e) => write(q, e.target.value)}
              onBlur={settle}
            />
          )}
        </section>
      )}

      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className="btn btn-ghost disabled:opacity-40">
          <span>
            <ArrowLeft size={18} aria-hidden /> {t("previous")}
          </span>
        </button>
        {index < questions.length - 1 ? (
          <button type="button" onClick={() => go(index + 1)} className="btn btn-accent">
            <span>
              {t("next")} <ArrowRight size={18} aria-hidden />
            </span>
          </button>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} disabled={handingIn} className="btn btn-brand">
            <span>
              <Send size={18} aria-hidden /> {t("hand_in")}
            </span>
          </button>
        )}
      </div>

      <nav aria-label={t("questions_nav")} className="live-card p-4">
        <ol className="grid grid-cols-6 gap-2 sm:grid-cols-10">
          {questions.map((x, i) => {
            const done = isAnswered(x, given[x.id]);
            return (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={i === index ? "step" : undefined}
                  className={`flex h-11 w-full cursor-pointer items-center justify-center rounded-(--field-radius) border-2 font-bold tabular transition-colors ${done ? "border-accent bg-accent text-on-accent" : "border-line text-muted-foreground hover:text-fg"} ${i === index ? "ring-2 ring-fg ring-offset-2 ring-offset-bg" : ""}`}
                >
                  {i + 1}
                </button>
              </li>
            );
          })}
        </ol>
        <button type="button" onClick={() => setConfirming(true)} disabled={handingIn} className="btn btn-brand mt-4 w-full sm:w-auto">
          <span>
            {handingIn ? <Loader2 className="animate-spin" size={18} aria-hidden /> : <Send size={18} aria-hidden />} {t("hand_in")}
          </span>
        </button>
      </nav>

      {confirming && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={() => setConfirming(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="live-card w-full max-h-[calc(100dvh-2rem)] overflow-y-auto max-w-md bg-surface p-6" onClick={(e) => e.stopPropagation()}>
            <h2 id="confirm-title" className="text-xl font-extrabold text-fg">
              {t("confirm_title")}
            </h2>
            <p className="mt-3 font-semibold text-fg">{t("confirm_unanswered", { count: questions.length - answered })}</p>
            <p className="mt-1 text-muted-foreground">{t("confirm_body")}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={() => setConfirming(false)} className="btn btn-ghost">
                <span>{t("confirm_no")}</span>
              </button>
              <button type="button" onClick={handIn} className="btn btn-brand">
                <span>
                  <Send size={18} aria-hidden /> {t("hand_in")}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** After the paper: the score where there is one, and the answers once the paper may be reviewed. */
function Finished({ view, api, student, back }: { view: View; api: string; student: string; back: React.ReactNode }) {
  const t = useTranslations("Exam");
  const { paper, attempt, result } = view;
  const questions = view.questions ?? [];
  const reviewable = questions.some((q) => q.key);
  const image = (question: Question, option?: string) => `${api}/image?student=${encodeURIComponent(student)}&q=${question.id}${option ? `&o=${option}` : ""}&v=${question.version}`;

  return (
    <div className="flex flex-col gap-5">
      {back}
      <section className="live-card flex flex-col items-center gap-3 p-8 text-center">
        <CheckCircle2 size={48} className="text-ok" aria-hidden />
        <h1 className="text-3xl font-extrabold text-fg">{t("done_title")}</h1>
        <p className="text-lg font-bold text-fg wrap-break-word">{paper.title}</p>
        {!attempt!.handedIn && <p className="font-semibold text-fg">{t("time_up")}</p>}
        <p className="max-w-md leading-relaxed text-muted-foreground">{result ? t("done_practice") : t("done_exam")}</p>
        {result && (
          <>
            <p className="display text-6xl text-accent tabular">
              {result.score}
              <span className="text-3xl text-muted-foreground"> / {result.max}</span>
            </p>
            {result.toMark > 0 && <p className="max-w-md text-sm text-muted-foreground">{t("score_pending", { count: result.toMark })}</p>}
          </>
        )}
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{t("shared_device")}</p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="eyebrow text-accent">{t("review_title")}</h2>
        {!reviewable ? (
          <p className="live-card p-6 text-muted-foreground">{paper.mode === "practice" ? t("review_later") : t("review_later_exam")}</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {questions.map((q, n) => {
              const key = q.key!;
              const mine = view.answers?.[q.id];
              const got = key.awarded;
              return (
                <li key={q.id} className="live-card flex flex-col gap-4 p-5 md:p-6">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="eyebrow text-accent">{t("question_of", { n: n + 1, total: questions.length })}</span>
                    <span className={`shrink-0 font-bold tabular ${got === null ? "text-muted-foreground" : got === q.marks ? "text-ok" : got === 0 ? "text-brand-text" : "text-fg"}`}>{got === null ? t("to_mark") : `${got} / ${q.marks}`}</span>
                  </div>
                  {q.prompt && <p className="whitespace-pre-wrap leading-relaxed text-fg wrap-break-word">{q.prompt}</p>}
                  {q.hasImage && <Picture src={image(q)} alt={t("picture_alt")} className="max-h-72 w-auto max-w-full self-start rounded-(--field-radius) p-1" />}
                  {q.kind === "choice" ? (
                    <ul className="flex flex-col gap-2">
                      {q.options.map((o, i) => {
                        const right = o.id === key.answer;
                        const chosen = o.id === mine?.choice;
                        return (
                          <li key={o.id} className={`flex items-center gap-3 rounded-(--field-radius) border-2 px-3 py-2 ${right ? "border-ok" : chosen ? "border-brand-text" : "border-line"}`}>
                            <span className="w-6 shrink-0 text-center font-bold tabular text-muted-foreground">{i + 1}</span>
                            <span className="flex min-w-0 flex-1 flex-col gap-1">
                              {o.hasImage && <Picture src={image(q, o.id)} alt={t("option_picture_alt", { n: i + 1 })} className="max-h-24 w-auto max-w-full rounded p-0.5" />}
                              {o.text && <span className="text-fg wrap-break-word">{o.text}</span>}
                            </span>
                            {right ? (
                              <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-ok">
                                <Check size={16} aria-hidden /> {t("correct_answer")}
                              </span>
                            ) : (
                              chosen && (
                                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-brand-text">
                                  <X size={16} aria-hidden /> {t("your_answer")}
                                </span>
                              )
                            )}
                          </li>
                        );
                      })}
                      {!mine?.choice && <li className="text-sm font-semibold text-muted-foreground">{t("no_answer")}</li>}
                    </ul>
                  ) : (
                    <dl className="flex flex-col gap-2">
                      <div>
                        <dt className="text-sm font-semibold text-muted-foreground">{t("your_answer")}</dt>
                        <dd className={`whitespace-pre-wrap wrap-break-word ${mine?.response?.trim() ? "text-fg" : "italic text-muted-foreground"}`}>{mine?.response?.trim() || t("no_answer")}</dd>
                      </div>
                      {key.accepted.length > 0 && (
                        <div>
                          <dt className="text-sm font-semibold text-muted-foreground">{t("expected_answer")}</dt>
                          <dd className="text-ok">{key.accepted.join(" / ")}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
