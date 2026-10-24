"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, ChevronUp, Clock, Loader2, RefreshCw, RotateCcw, Send } from "lucide-react";
import { AlertModal, ConfirmDialog } from "@/components/console/confirm-dialog";
import { Badge, Button, buttonClass, Note } from "@/components/console/ui";
import { searchText } from "@/lib/keda/bamini";
import { matchesAccepted, normalizeAnswer, questionScore, type PaperStatus } from "@/lib/keda/online-rules";
import { letter, Picture, staffImage, STATUS, when, type StaffQuestion } from "./online-shared";

type Attempt = { _id: string; startedAt: string; deadline: string; submittedAt: string | null; finished: boolean; score: number; toMark: number; answered: number; max: number };
type Row = { student: { _id: string; name: string; registrationNumber: string | null }; onRoster: boolean; hasMark: boolean; attempt: Attempt | null };
type Answer = { attemptId: string; questionId: string; choice: string | null; response: string | null; awarded: number | null };
type Data = {
  now: string;
  paper: { _id: string; title: string; mode: "practice" | "exam"; grade: number; batchId: { _id: string; name: string } | string; opensAt: string | null; closesAt: string | null; durationMinutes: number; status: PaperStatus };
  questions: StaffQuestion[];
  rows: Row[];
  answers: Answer[];
  exam: { _id: string; label: string; maxMarks: number; testId: string | null; testName: string; isPublished: boolean; entered: number } | null;
};

const errorOf = async (res: Response) => ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Something went wrong";
const minutesLeft = (deadline: string, now: string) => Math.max(0, Math.ceil((new Date(deadline).getTime() - new Date(now).getTime()) / 60_000));

/**
 * Who has sat an online paper and how they did; marking its short answers, grouped so that one
 * decision marks every student who wrote the same thing; extra time for a student; and, for an exam
 * paper, copying the scores to its test. Refreshes itself while anyone is sitting.
 */
export default function OnlineResultsScreen() {
  const params = useParams();
  const router = useRouter();
  const paperId = params.id as string;
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"students" | "marking">("students");
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/online-papers/${paperId}/results`, { cache: "no-store" });
      setData(res.ok ? ((await res.json()) as Data) : null);
    } finally {
      setLoading(false);
    }
  }, [paperId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const live = !!data && (data.paper.status === "open" || data.rows.some((r) => r.attempt && !r.attempt.finished));
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(fetchData, 30_000);
    return () => clearInterval(timer);
  }, [live, fetchData]);

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-muted-foreground" size={32} /></div>;
  if (!data) return <div className="p-12 text-center text-muted-foreground">Online paper not found</div>;

  const { paper, rows } = data;
  const sat = rows.filter((r) => r.attempt);
  const finished = sat.filter((r) => r.attempt!.finished);
  const sitting = sat.length - finished.length;
  const toMark = finished.reduce((n, r) => n + r.attempt!.toMark, 0);
  const notStarted = rows.filter((r) => !r.attempt && r.onRoster).length;

  return (
    <div className="max-w-5xl space-y-6">
      <button onClick={() => router.push(`/console/online/${paperId}`)} className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft size={20} /> Back to the paper
      </button>

      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 md:flex-row md:items-center md:justify-between md:p-8">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge>Grade {paper.grade}</Badge>
            <Badge tone={paper.mode === "exam" ? "brand" : "neutral"}>{paper.mode === "exam" ? "Exam" : "Practice"}</Badge>
            <Badge tone={STATUS[paper.status].tone}>{STATUS[paper.status].label}</Badge>
          </div>
          <h1 className="text-2xl text-foreground wrap-break-word md:text-3xl">{paper.title}</h1>
          <p className="mt-1 text-muted-foreground">
            {when(paper.opensAt)} → {when(paper.closesAt)} · {paper.durationMinutes} minutes
          </p>
        </div>
        <Button variant="secondary" onClick={fetchData}>
          <RefreshCw size={16} aria-hidden /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Finished", value: finished.length },
          { label: "Sitting now", value: sitting },
          { label: "Not started", value: notStarted },
          { label: "Answers to mark", value: toMark },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      {data.exam && <CopyToTest data={data} finished={finished.length} sitting={sitting} toMark={toMark} notStarted={rows.filter((r) => !r.attempt && r.onRoster && !r.hasMark).length} onDone={fetchData} onError={setError} />}

      <div className="flex gap-2 border-b border-border" role="tablist">
        {(["students", "marking"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`-mb-px min-h-11 cursor-pointer border-b-2 px-4 text-sm font-semibold ${tab === t ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t === "students" ? "Students" : `Mark short answers${toMark ? ` (${toMark})` : ""}`}
          </button>
        ))}
      </div>

      {tab === "students" ? <Students data={data} onChanged={fetchData} onError={setError} /> : <Marking data={data} onChanged={fetchData} onError={setError} />}

      <AlertModal open={error !== null} onClose={() => setError(null)} title="Something went wrong" description={error ?? undefined} tone="danger" />
    </div>
  );
}

function CopyToTest({ data, finished, sitting, toMark, notStarted, onDone, onError }: { data: Data; finished: number; sitting: number; toMark: number; notStarted: number; onDone: () => void; onError: (e: string) => void }) {
  const exam = data.exam!;
  const [absent, setAbsent] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ scores: number; absent: number } | null>(null);

  const blocker =
    data.paper.status !== "closed"
      ? `Available once the paper closes (${when(data.paper.closesAt)}), so that everyone has finished.`
      : sitting > 0
        ? `${sitting} student${sitting === 1 ? " is" : "s are"} still sitting with extra time.`
        : toMark > 0
          ? `Mark the ${toMark} short answer${toMark === 1 ? "" : "s"} still waiting first.`
          : null;

  const copy = async () => {
    setConfirming(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/online-papers/${data.paper._id}/send-marks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ absentForMissing: absent }) });
      if (!res.ok) return onError(await errorOf(res));
      setDone((await res.json()) as { scores: number; absent: number });
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-bold text-foreground">
            Copy scores to {exam.label} of {exam.testName}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {blocker ??
              `${finished} score${finished === 1 ? "" : "s"} ready. They go into the test's marks, replacing any mark already entered for those students; then you check and publish the test as usual.`}
            {exam.entered > 0 && !done && ` The test already has ${exam.entered} mark${exam.entered === 1 ? "" : "s"} for ${exam.label}.`}
          </p>
          {!blocker && notStarted > 0 && (
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={absent} onChange={(e) => setAbsent(e.target.checked)} />
              <span>
                Mark the {notStarted} student{notStarted === 1 ? "" : "s"} who did not sit it as absent. <span className="text-muted-foreground">Students who already have a mark on the test (sat on paper) keep it.</span>
              </span>
            </label>
          )}
        </div>
        <Button className="shrink-0" disabled={!!blocker || busy || finished === 0} onClick={() => setConfirming(true)}>
          {busy ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} aria-hidden />} Copy scores
        </Button>
      </div>
      {done && (
        <Note tone="success">
          Copied {done.scores} score{done.scores === 1 ? "" : "s"}
          {done.absent ? ` and ${done.absent} absence${done.absent === 1 ? "" : "s"}` : ""}.{" "}
          {exam.testId && (
            <Link href={`/console/exams/${exam.testId}`} className="underline">
              Open the test to check and publish
            </Link>
          )}
        </Note>
      )}
      <ConfirmDialog open={confirming} onClose={() => setConfirming(false)} onConfirm={copy} title="Copy the scores to the test?" description={`${finished} score${finished === 1 ? "" : "s"} go into ${exam.label} of ${exam.testName}${absent && notStarted ? `, and ${notStarted} student${notStarted === 1 ? " is" : "s are"} marked absent` : ""}. You can copy again after correcting anything.`} confirmLabel="Copy scores" />
    </div>
  );
}

function Students({ data, onChanged, onError }: { data: Data; onChanged: () => void; onError: (e: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [restart, setRestart] = useState<Row | null>(null);

  const act = async (key: string, work: () => Promise<Response>) => {
    setBusy(key);
    try {
      const res = await work();
      if (!res.ok) onError(await errorOf(res));
      else onChanged();
    } finally {
      setBusy(null);
    }
  };
  const addTime = (attempt: Attempt) => act(`time-${attempt._id}`, () => fetch(`/api/online-papers/${data.paper._id}/attempts/${attempt._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ addMinutes: 10 }) }));
  const startAgain = () => {
    const row = restart!;
    setRestart(null);
    act(`restart-${row.attempt!._id}`, () => fetch(`/api/online-papers/${data.paper._id}/attempts/${row.attempt!._id}`, { method: "DELETE" }));
  };

  const q = searchText(query.trim());
  const visible = data.rows.filter((r) => searchText(r.student.name).includes(q) || (r.student.registrationNumber ?? "").toLowerCase().includes(q));

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border p-4">
        <input type="text" placeholder="Search by name or index number..." aria-label="Search students" className="field" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="whitespace-nowrap bg-secondary font-medium text-secondary-foreground">
            <tr>
              <th className="px-4 py-3">Index No</th>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Sitting</th>
              <th className="px-4 py-3 text-right">Score</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((r) => {
              const a = r.attempt;
              return (
                <Fragment key={r.student._id}>
                  <tr className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">{r.student.registrationNumber ?? "—"}</td>
                    <td className="min-w-40 px-4 py-3 font-semibold text-foreground">
                      {r.student.name}
                      {!r.onRoster && <span className="block text-xs font-normal text-muted-foreground">No longer in this class</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {!a ? (
                        "Not started"
                      ) : a.finished ? (
                        <>
                          <span className="font-semibold text-foreground">{a.submittedAt ? "Handed in" : "Time ran out"}</span>
                          <span className="block text-xs">
                            {when(a.submittedAt ?? a.deadline)} · {a.answered}/{data.questions.length} answered
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-1 font-semibold text-ok">
                            <Clock size={14} aria-hidden /> Sitting · {minutesLeft(a.deadline, data.now)} min left
                          </span>
                          <span className="block text-xs">{a.answered}/{data.questions.length} answered</span>
                        </>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular">
                      {a?.finished ? (
                        <>
                          <span className="font-bold text-foreground">
                            {a.score}/{a.max}
                          </span>
                          {a.toMark > 0 && <span className="block text-xs text-warn">{a.toMark} to mark</span>}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {a && (
                        <div className="flex justify-end gap-1.5 whitespace-nowrap">
                          <Button variant="secondary" className="min-h-9 px-3 text-sm" onClick={() => setOpen(open === a._id ? null : a._id)} aria-expanded={open === a._id}>
                            Answers {open === a._id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </Button>
                          <Button variant="secondary" className="min-h-9 px-3 text-sm" disabled={busy !== null} onClick={() => addTime(a)} title="Ten more minutes from now (or from their deadline, if it is still ahead)">
                            {busy === `time-${a._id}` ? <Loader2 className="animate-spin" size={14} /> : "+10 min"}
                          </Button>
                          <Button variant="danger" className="min-h-9 px-3 text-sm" disabled={busy !== null} onClick={() => setRestart(r)} aria-label="Let them start again">
                            <RotateCcw size={14} />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {a && open === a._id && (
                    <tr>
                      <td colSpan={5} className="bg-muted/40 px-4 py-3">
                        <AnswerSheet data={data} attemptId={a._id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="p-12 text-center text-muted-foreground">
                  {data.rows.length === 0 ? "No students in this class yet." : "No students match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={restart !== null}
        onClose={() => setRestart(null)}
        onConfirm={startAgain}
        title="Let this student start again?"
        description={`${restart?.student.name ?? ""}'s answers are deleted, and they start from the beginning with the full time — if the paper is still open.`}
        confirmLabel="Start again"
        tone="danger"
      />
    </div>
  );
}

/** One student's answers, question by question, in the order staff wrote them. */
function AnswerSheet({ data, attemptId }: { data: Data; attemptId: string }) {
  const answers = data.answers.filter((a) => a.attemptId === attemptId);
  return (
    <ol className="space-y-2">
      {data.questions.map((q, i) => {
        const a = answers.find((x) => x.questionId === q._id);
        const score = questionScore({ id: q._id, kind: q.kind, answer: q.answer, accepted: q.accepted, marks: q.marks }, a);
        const chosen = q.options.findIndex((o) => o.id === a?.choice);
        const given = q.kind === "choice" ? (chosen >= 0 ? `${letter(chosen)}. ${q.options[chosen].text}` : null) : a?.response?.trim() || null;
        return (
          <li key={q._id} className="flex items-start justify-between gap-4 text-sm">
            <span className="min-w-0">
              <span className="font-bold text-muted-foreground">Q{i + 1}</span> <span className="text-muted-foreground">{q.prompt.slice(0, 80)}</span>
              <span className={`block ${given ? "text-foreground" : "italic text-muted-foreground"}`}>{given ?? "No answer"}</span>
            </span>
            <span className={`shrink-0 tabular font-semibold ${score === null ? "text-warn" : score === q.marks ? "text-ok" : "text-muted-foreground"}`}>{score === null ? "To mark" : `${score}/${q.marks}`}</span>
          </li>
        );
      })}
    </ol>
  );
}

type Group = { key: string; response: string; entries: { attemptId: string; name: string; awarded: number | null }[]; auto: boolean };

/**
 * Short answers, question by question, with identical answers grouped: marking a group marks every
 * student in it. Answers matching an accepted answer are already full marks; blank ones are 0.
 */
function Marking({ data, onChanged, onError }: { data: Data; onChanged: () => void; onError: (e: string) => void }) {
  const [waitingOnly, setWaitingOnly] = useState(true);
  const shorts = data.questions.map((q, i) => ({ q, number: i + 1 })).filter(({ q }) => q.kind === "short");
  const finished = new Map(data.rows.filter((r) => r.attempt?.finished).map((r) => [r.attempt!._id, r.student.name]));

  if (shorts.length === 0) return <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">This paper has no short-answer questions: every answer is marked automatically.</div>;

  const groupsFor = (q: StaffQuestion): Group[] => {
    const groups = new Map<string, Group>();
    for (const a of data.answers) {
      if (a.questionId !== q._id || !finished.has(a.attemptId) || !a.response?.trim()) continue;
      const key = normalizeAnswer(a.response);
      const group = groups.get(key) ?? { key, response: a.response.trim(), entries: [], auto: matchesAccepted(a.response, q.accepted) };
      group.entries.push({ attemptId: a.attemptId, name: finished.get(a.attemptId)!, awarded: a.awarded });
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => b.entries.length - a.entries.length);
  };

  return (
    <div className="space-y-6">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" className="h-4 w-4" checked={waitingOnly} onChange={(e) => setWaitingOnly(e.target.checked)} />
        Only answers waiting to be marked
      </label>
      {shorts.map(({ q, number }) => {
        const groups = groupsFor(q).filter((g) => !waitingOnly || (!g.auto && g.entries.some((e) => e.awarded === null)));
        return (
          <div key={q._id} className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold text-foreground">Q{number}</span>
              <Badge>
                {q.marks} mark{q.marks === 1 ? "" : "s"}
              </Badge>
            </div>
            {q.prompt && <p className="mt-2 whitespace-pre-wrap text-foreground">{q.prompt}</p>}
            {q.hasImage && <Picture src={staffImage(data.paper._id, q)} className="mt-2 max-h-32 rounded-md border border-border" />}
            {q.accepted.length > 0 && <p className="mt-2 text-sm text-muted-foreground">Accepted automatically: {q.accepted.join(" · ")}</p>}
            {groups.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">{waitingOnly ? "Nothing waiting." : "No answers yet."}</p>
            ) : (
              <ul className="mt-4 divide-y divide-border">
                {groups.map((g) => (
                  <MarkGroup key={g.key} paperId={data.paper._id} question={q} group={g} onChanged={onChanged} onError={onError} />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MarkGroup({ paperId, question, group, onChanged, onError }: { paperId: string; question: StaffQuestion; group: Group; onChanged: () => void; onError: (e: string) => void }) {
  const marks = group.entries.map((e) => e.awarded);
  const same = marks.every((m) => m === marks[0]) ? marks[0] : undefined;
  const [part, setPart] = useState(same !== null && same !== undefined ? String(same) : "");
  const [busy, setBusy] = useState(false);
  const [showNames, setShowNames] = useState(false);

  const award = async (awarded: number | null) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/online-papers/${paperId}/award`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(group.entries.map((e) => ({ attemptId: e.attemptId, questionId: question._id, awarded }))),
      });
      if (!res.ok) onError(await errorOf(res));
      else onChanged();
    } finally {
      setBusy(false);
    }
  };

  const state =
    same !== null && same !== undefined ? (
      <span className="inline-flex items-center gap-1 text-ok">
        <Check size={14} aria-hidden /> Marked {same}/{question.marks}
      </span>
    ) : same === undefined ? (
      <span className="text-warn">Marked differently — set one mark for all</span>
    ) : group.auto ? (
      <span className="inline-flex items-center gap-1 text-ok">
        <Check size={14} aria-hidden /> Accepted automatically
      </span>
    ) : (
      <span className="text-warn">Waiting</span>
    );

  return (
    <li className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="whitespace-pre-wrap font-semibold text-foreground wrap-break-word">{group.response}</p>
        <p className="mt-0.5 text-sm">
          <button type="button" onClick={() => setShowNames((v) => !v)} className="cursor-pointer text-muted-foreground underline-offset-2 hover:underline">
            {group.entries.length} student{group.entries.length === 1 ? "" : "s"}
          </button>
          <span className="text-muted-foreground"> · </span>
          <span className="font-semibold">{state}</span>
        </p>
        {showNames && <p className="mt-1 text-sm text-muted-foreground">{group.entries.map((e) => e.name).join(", ")}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button variant="secondary" className="min-h-10 px-3" disabled={busy} onClick={() => award(0)}>
          0
        </Button>
        <input type="number" min="0" max={question.marks} step="0.5" aria-label="Marks" className="field h-10 min-h-10 w-20" value={part} onChange={(e) => setPart(e.target.value)} />
        <Button variant="secondary" className="min-h-10 px-3" disabled={busy || part === ""} onClick={() => award(Number(part))}>
          Save
        </Button>
        <button type="button" disabled={busy} onClick={() => award(question.marks)} className={buttonClass("primary", "min-h-10 px-3")}>
          {busy ? <Loader2 className="animate-spin" size={14} /> : `Full (${question.marks})`}
        </button>
        {marks.some((m) => m !== null) && (
          <button type="button" disabled={busy} onClick={() => award(null)} className="min-h-10 cursor-pointer px-2 text-sm text-muted-foreground hover:text-foreground" title="Clear the mark">
            Clear
          </button>
        )}
      </div>
    </li>
  );
}
