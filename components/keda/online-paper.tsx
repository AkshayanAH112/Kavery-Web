"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, Check, Globe, ImagePlus, ListChecks, Loader2, Lock, Pencil, Plus, Settings2, Trash2, X } from "lucide-react";
import { AlertModal, ConfirmDialog } from "@/components/console/confirm-dialog";
import { Badge, Button, buttonClass, Note } from "@/components/console/ui";
import { BaminiInput, BaminiToggle, useBaminiTyping } from "@/components/keda/bamini-input";
import { fromColomboInput, toColomboInput } from "@/lib/dates";
import { MAX_DURATION_MINUTES, MAX_OPTIONS, type PaperStatus } from "@/lib/keda/online-rules";
import { shrinkImage } from "@/lib/upload-client";
import { letter, Picture, staffImage, STATUS, when, type StaffQuestion } from "./online-shared";

type Paper = {
  _id: string;
  title: string;
  mode: "practice" | "exam";
  grade: number;
  batchId: { _id: string; name: string } | string;
  instructions: string;
  opensAt: string | null;
  closesAt: string | null;
  durationMinutes: number;
  shuffle: boolean;
  isReady: boolean;
  status: PaperStatus;
};
type Data = {
  paper: Paper;
  questions: StaffQuestion[];
  totalMarks: number;
  problems: string[];
  locked: boolean;
  exam: { _id: string; label: string; maxMarks: number; testId: string | null; testName: string } | null;
};

const errorOf = async (res: Response) => ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Something went wrong";

/**
 * One online paper: its questions (each edited in a dialog), its settings, and the switch that gives
 * it to students. Once a student has started, the questions keep their shape — wording, pictures and
 * the correct answers can still be fixed, and a fixed answer re-marks everyone.
 */
export default function OnlinePaperScreen() {
  const params = useParams();
  const router = useRouter();
  const paperId = params.id as string;
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<StaffQuestion | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleting, setDeleting] = useState<StaffQuestion | "paper" | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/online-papers/${paperId}`);
      setData(res.ok ? ((await res.json()) as Data) : null);
    } finally {
      setLoading(false);
    }
  }, [paperId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-muted-foreground" size={32} /></div>;
  if (!data) return <div className="p-12 text-center text-muted-foreground">Online paper not found</div>;
  const { paper, questions, problems, locked, exam } = data;

  const run = async (work: () => Promise<Response>, after?: (res: Response) => Promise<void> | void) => {
    setBusy(true);
    try {
      const res = await work();
      if (!res.ok) setError(await errorOf(res));
      else if (after) await after(res);
      else await fetchData();
    } finally {
      setBusy(false);
    }
  };
  const patch = (body: object) => fetch(`/api/online-papers/${paperId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const addQuestion = () =>
    run(
      () => fetch(`/api/online-papers/${paperId}/questions`, { method: "POST" }),
      async (res) => {
        const { question } = (await res.json()) as { question: StaffQuestion };
        await fetchData();
        setEditing(question);
      },
    );
  const move = (i: number, by: -1 | 1) => {
    const order = questions.map((q) => q._id);
    [order[i], order[i + by]] = [order[i + by], order[i]];
    run(() => patch({ order }));
  };
  const confirmDelete = () => {
    const target = deleting;
    setDeleting(null);
    if (target === "paper") run(() => fetch(`/api/online-papers/${paperId}`, { method: "DELETE" }), () => router.push("/console/online"));
    else if (target) run(() => fetch(`/api/online-papers/${paperId}/questions/${target._id}`, { method: "DELETE" }));
  };

  const max = exam?.maxMarks ?? null;
  const totalLine = max === null ? `${data.totalMarks} marks` : `${data.totalMarks} of ${max} marks`;

  return (
    <div className="max-w-4xl space-y-6">
      <button onClick={() => router.push("/console/online")} className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft size={20} /> Back to Online exams
      </button>

      <div className="flex flex-col justify-between gap-6 rounded-lg border border-border bg-card p-6 md:flex-row md:items-center md:p-8">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge>Grade {paper.grade}</Badge>
            <Badge tone={paper.mode === "exam" ? "brand" : "neutral"}>{paper.mode === "exam" ? "Exam" : "Practice"}</Badge>
            <Badge tone={STATUS[paper.status].tone}>{STATUS[paper.status].label}</Badge>
          </div>
          <h1 className="text-2xl text-foreground wrap-break-word md:text-3xl">{paper.title}</h1>
          <p className="mt-1 text-muted-foreground">
            {typeof paper.batchId === "object" ? paper.batchId.name : "—"} · {questions.length} question{questions.length === 1 ? "" : "s"} · {totalLine} · {paper.durationMinutes} minutes
          </p>
          {exam && (
            <p className="mt-1 text-sm text-muted-foreground">
              Scores become the marks for {exam.label} of{" "}
              {exam.testId ? (
                <Link href={`/console/exams/${exam.testId}`} className="font-semibold text-foreground underline">
                  {exam.testName}
                </Link>
              ) : (
                exam.testName
              )}
              .
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/console/online/${paperId}/results`} className={buttonClass("primary")}>
            <ListChecks size={16} aria-hidden /> Results
          </Link>
          <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={16} aria-hidden /> Settings
          </Button>
          <Button variant="danger" onClick={() => setDeleting("paper")}>
            <Trash2 size={16} aria-hidden /> Delete
          </Button>
        </div>
      </div>

      {/* The gate. A draft is the default and the safe state; students cannot see it at all. */}
      <div className={`flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between ${paper.isReady ? "border-ok/40 bg-ok/5" : "border-border bg-muted/40"}`}>
        <div className="flex items-start gap-3">
          {paper.isReady ? <Globe size={20} className="mt-0.5 shrink-0 text-ok" /> : <Lock size={20} className="mt-0.5 shrink-0 text-muted-foreground" />}
          <div className="min-w-0">
            <p className="font-bold text-foreground">{paper.isReady ? "Given to students" : "Not given to students yet"}</p>
            {paper.isReady ? (
              <p className="text-sm text-muted-foreground">
                Grade {paper.grade} students of {typeof paper.batchId === "object" ? paper.batchId.name : "this batch"} see it on the parent page. They can start from {when(paper.opensAt)} until {when(paper.closesAt)}, and have {paper.durationMinutes} minutes once they start (less if they start late).
              </p>
            ) : problems.length > 0 ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Everything is in place. Parents who get KEDA notices are told when you give it out.</p>
            )}
          </div>
        </div>
        <Button variant={paper.isReady ? "secondary" : "primary"} className="shrink-0" disabled={busy || (paper.isReady ? locked : problems.length > 0)} title={paper.isReady && locked ? "Students have started it" : undefined} onClick={() => run(() => patch({ isReady: !paper.isReady }))}>
          {paper.isReady ? (
            <>
              <Lock size={16} aria-hidden /> Back to draft
            </>
          ) : (
            <>
              <Globe size={16} aria-hidden /> Give to students
            </>
          )}
        </Button>
      </div>

      {locked && <Note>Students have started this paper, so questions can no longer be added, removed or given different marks. You can still correct the wording, the pictures and the correct answers — a corrected answer re-marks everyone.</Note>}

      <div className="space-y-4">
        {questions.map((q, i) => (
          <QuestionCard key={q._id} paperId={paperId} q={q} number={i + 1} busy={busy} locked={locked} first={i === 0} last={i === questions.length - 1} onEdit={() => setEditing(q)} onMove={(by) => move(i, by)} onDelete={() => setDeleting(q)} />
        ))}
        {questions.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">No questions yet. Add the first one — multiple choice or a short written answer, with a picture if it needs one.</div>
        )}
        {!locked && (
          <Button onClick={addQuestion} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} aria-hidden />} Add question
          </Button>
        )}
      </div>

      {editing && (
        <QuestionEditor
          paperId={paperId}
          question={editing}
          number={questions.findIndex((q) => q._id === editing._id) + 1}
          locked={locked}
          onClose={() => {
            setEditing(null);
            fetchData();
          }}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          paper={paper}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            setSettingsOpen(false);
            fetchData();
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={deleting === "paper" ? "Delete this online paper?" : "Delete this question?"}
        description={deleting === "paper" ? `Every question${locked ? ", and every student's answers," : ""} will be deleted. ${exam ? "Marks already copied to the test stay there. " : ""}This cannot be undone.` : "The question and its pictures will be deleted."}
        confirmLabel="Delete"
        tone="danger"
      />
      <AlertModal open={error !== null} onClose={() => setError(null)} title="Something went wrong" description={error ?? undefined} tone="danger" />
    </div>
  );
}

function QuestionCard({ paperId, q, number, busy, locked, first, last, onEdit, onMove, onDelete }: { paperId: string; q: StaffQuestion; number: number; busy: boolean; locked: boolean; first: boolean; last: boolean; onEdit: () => void; onMove: (by: -1 | 1) => void; onDelete: () => void }) {
  const iconButton = "inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-(--field-radius) border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-bold text-foreground">Q{number}</span>
          <Badge>{q.kind === "choice" ? "Multiple choice" : "Short answer"}</Badge>
          <Badge>{q.marks} mark{q.marks === 1 ? "" : "s"}</Badge>
        </div>
        <div className="flex gap-1.5">
          <button className={iconButton} disabled={busy || first} onClick={() => onMove(-1)} aria-label="Move up">
            <ArrowUp size={16} />
          </button>
          <button className={iconButton} disabled={busy || last} onClick={() => onMove(1)} aria-label="Move down">
            <ArrowDown size={16} />
          </button>
          <button className={iconButton} onClick={onEdit} aria-label="Edit">
            <Pencil size={16} />
          </button>
          <button className={iconButton} disabled={busy || locked} onClick={onDelete} aria-label="Delete">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      {q.prompt ? <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-foreground">{q.prompt}</p> : !q.hasImage && <p className="mt-3 italic text-muted-foreground">No question text yet</p>}
      {q.hasImage && <Picture src={staffImage(paperId, q)} className="mt-3 max-h-48 rounded-md border border-border" />}
      {q.kind === "choice" ? (
        <ol className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {q.options.map((o, i) => {
            const right = o.id === q.answer;
            return (
              <li key={o.id} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${right ? "border-ok/50 bg-ok/5" : "border-border"}`}>
                <span className="font-bold text-muted-foreground">{letter(i)}</span>
                {o.hasImage && <Picture src={staffImage(paperId, q, o.id)} className="h-10 w-10 rounded object-cover" />}
                <span className={`min-w-0 flex-1 ${o.text ? "text-foreground" : "italic text-muted-foreground"}`}>{o.text || (o.hasImage ? "" : "Empty")}</span>
                {right && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-ok">
                    <Check size={14} aria-hidden /> Correct
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{q.accepted.length ? <>Full marks automatically for: <span className="font-semibold text-foreground">{q.accepted.join(" · ")}</span>. Other answers wait for you to mark.</> : "Every answer waits for you to mark."}</p>
      )}
    </div>
  );
}

type DraftOption = { id?: string; text: string; hasImage: boolean };

function QuestionEditor({ paperId, question, number, locked, onClose }: { paperId: string; question: StaffQuestion; number: number; locked: boolean; onClose: () => void }) {
  const [bamini, setBamini] = useBaminiTyping();
  const [saved, setSaved] = useState(question);
  const [kind, setKind] = useState(question.kind);
  const [prompt, setPrompt] = useState(question.prompt);
  const [marks, setMarks] = useState(String(question.marks));
  const [options, setOptions] = useState<DraftOption[]>(question.options);
  const [answer, setAnswer] = useState<number | null>(question.answer ? question.options.findIndex((o) => o.id === question.answer) : null);
  const [accepted, setAccepted] = useState(question.accepted);
  const [newAccepted, setNewAccepted] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  const pictureFor = useRef<number | null>(null);

  /** Saves what is on screen; resolves to the saved question, or null (with the reason shown). */
  const save = async (): Promise<StaffQuestion | null> => {
    const pending = newAccepted.trim() ? [...accepted, newAccepted.trim()] : accepted;
    const res = await fetch(`/api/online-papers/${paperId}/questions/${question._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, prompt, marks: Number(marks), accepted: pending, ...(kind === "choice" ? { options: options.map((o) => ({ id: o.id, text: o.text })), answer } : {}) }),
    });
    if (!res.ok) {
      setError(await errorOf(res));
      return null;
    }
    const { question: updated } = (await res.json()) as { question: StaffQuestion };
    setSaved(updated);
    // New answers get their ids from the server; keep the text being typed.
    setOptions(updated.options);
    setAccepted(updated.accepted);
    setNewAccepted("");
    return updated;
  };

  const saveAndClose = async (e: React.FormEvent) => {
    e.preventDefault();
    setWorking("save");
    try {
      if (await save()) onClose();
    } finally {
      setWorking(null);
    }
  };

  // A new answer has no id until it is saved, so a picture is added after saving what is on screen.
  const choosePicture = (optionIndex: number | null) => {
    pictureFor.current = optionIndex;
    filePicker.current?.click();
  };
  const uploadPicture = async (file: File) => {
    const index = pictureFor.current;
    setWorking(index === null ? "picture" : `picture-${index}`);
    try {
      const current = await save();
      if (!current) return;
      const body = new FormData();
      body.append("file", await shrinkImage(file));
      if (index !== null) body.append("option", current.options[index].id);
      const res = await fetch(`/api/online-papers/${paperId}/questions/${question._id}/image`, { method: "POST", body });
      if (!res.ok) return setError(await errorOf(res));
      const { question: updated } = (await res.json()) as { question: StaffQuestion };
      setSaved(updated);
      setOptions((now) => now.map((o, i) => ({ ...o, hasImage: updated.options[i]?.hasImage ?? o.hasImage })));
    } finally {
      setWorking(null);
    }
  };
  const removePicture = async (optionIndex: number | null) => {
    setWorking(optionIndex === null ? "picture" : `picture-${optionIndex}`);
    try {
      const option = optionIndex === null ? "" : `?option=${options[optionIndex].id}`;
      const res = await fetch(`/api/online-papers/${paperId}/questions/${question._id}/image${option}`, { method: "DELETE" });
      if (!res.ok) return setError(await errorOf(res));
      const { question: updated } = (await res.json()) as { question: StaffQuestion };
      setSaved(updated);
      setOptions((now) => now.map((o, i) => (i === optionIndex ? { ...o, hasImage: false } : o)));
    } finally {
      setWorking(null);
    }
  };

  const removeOption = (i: number) => {
    setOptions(options.filter((_, j) => j !== i));
    setAnswer(answer === null || answer === i ? null : answer > i ? answer - 1 : answer);
  };
  const addAccepted = () => {
    const value = newAccepted.trim();
    if (value && !accepted.includes(value)) setAccepted([...accepted, value]);
    setNewAccepted("");
  };

  const pictureButtons = (index: number | null, has: boolean) => {
    const key = index === null ? "picture" : `picture-${index}`;
    if (working === key) return <Loader2 className="animate-spin text-muted-foreground" size={18} />;
    return has ? (
      <span className="flex items-center gap-1.5">
        <Picture src={staffImage(paperId, saved, index === null ? undefined : options[index].id)} className={index === null ? "max-h-40 rounded-md border border-border" : "h-11 w-11 rounded object-cover"} />
        <button type="button" onClick={() => removePicture(index)} className="cursor-pointer text-sm font-semibold text-danger hover:underline" aria-label="Remove picture">
          {index === null ? "Remove picture" : <X size={16} />}
        </button>
      </span>
    ) : (
      <button type="button" onClick={() => choosePicture(index)} disabled={working !== null} className={index === null ? buttonClass("secondary") : "inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-(--field-radius) border border-border text-muted-foreground hover:bg-muted"} aria-label="Add a picture">
        <ImagePlus size={18} aria-hidden /> {index === null && "Add a picture"}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4" onClick={onClose}>
      <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-(--card-radius) border border-border bg-card p-5 shadow-2xl sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-xl font-bold text-foreground">Question {number}</h2>
          <button onClick={onClose} aria-label="Close" className="cursor-pointer text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>
        <input ref={filePicker} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) uploadPicture(file); }} />

        <form onSubmit={saveAndClose} className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-(--field-radius) border border-border p-1" role="radiogroup" aria-label="Kind of question">
              {(["choice", "short"] as const).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} disabled={locked && kind !== k} onClick={() => { setKind(k); if (k === "choice" && options.length === 0) setOptions(Array.from({ length: 4 }, () => ({ text: "", hasImage: false }))); }} className={`min-h-9 cursor-pointer rounded-md px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${kind === k ? "bg-brand text-on-brand" : "text-muted-foreground hover:text-foreground"}`}>
                  {k === "choice" ? "Multiple choice" : "Short answer"}
                </button>
              ))}
            </div>
            <BaminiToggle on={bamini} onChange={setBamini} />
          </div>

          <div>
            <label className="field-label" htmlFor="q-prompt">Question</label>
            <BaminiInput id="q-prompt" multiline rows={4} bamini={bamini} className="field py-2" value={prompt} onValueChange={setPrompt} />
            <div className="mt-2">{pictureButtons(null, saved.hasImage)}</div>
          </div>

          <div className="w-32">
            <label className="field-label" htmlFor="q-marks">Marks</label>
            <input id="q-marks" type="number" min="0.5" step="0.5" max="100" required disabled={locked} className="field" value={marks} onChange={(e) => setMarks(e.target.value)} />
          </div>

          {kind === "choice" ? (
            <fieldset>
              <legend className="field-label">Answers to choose from — tick the correct one</legend>
              <div className="space-y-2">
                {options.map((o, i) => (
                  <div key={o.id ?? `new-${i}`} className="flex items-center gap-2">
                    <label className={`flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-(--field-radius) border font-bold ${answer === i ? "border-ok bg-ok text-on-brand" : "border-border text-muted-foreground"}`} title="The correct answer">
                      <input type="radio" name="answer" className="sr-only" checked={answer === i} onChange={() => setAnswer(i)} />
                      {answer === i ? <Check size={18} aria-label={`${letter(i)}, correct`} /> : letter(i)}
                    </label>
                    <BaminiInput bamini={bamini} className="field min-w-0 flex-1" placeholder={`Answer ${letter(i)}`} value={o.text} onValueChange={(text) => setOptions(options.map((x, j) => (j === i ? { ...x, text } : x)))} />
                    {pictureButtons(i, o.hasImage)}
                    {!locked && (
                      <button type="button" onClick={() => removeOption(i)} className="inline-flex h-11 w-9 shrink-0 cursor-pointer items-center justify-center text-muted-foreground hover:text-danger" aria-label={`Remove answer ${letter(i)}`}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {!locked && options.length < MAX_OPTIONS && (
                <button type="button" onClick={() => setOptions([...options, { text: "", hasImage: false }])} className="mt-2 inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-sm font-semibold text-foreground hover:underline">
                  <Plus size={16} aria-hidden /> Add an answer
                </button>
              )}
            </fieldset>
          ) : (
            <div>
              <span className="field-label">Accepted answers (optional)</span>
              <p className="mb-2 text-sm text-muted-foreground">An answer that matches one of these gets full marks straight away — spaces, capitals and a final full stop are ignored, and 7 and 7.0 are the same number. Anything else waits for you to mark it.</p>
              {accepted.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {accepted.map((a) => (
                    <span key={a} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm font-semibold text-foreground">
                      {a}
                      <button type="button" onClick={() => setAccepted(accepted.filter((x) => x !== a))} aria-label={`Remove ${a}`} className="cursor-pointer text-muted-foreground hover:text-danger">
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <BaminiInput bamini={bamini} className="field min-w-0 flex-1" placeholder="e.g. 25" value={newAccepted} onValueChange={setNewAccepted} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAccepted(); } }} />
                <Button variant="secondary" onClick={addAccepted}>
                  Add
                </Button>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <button type="submit" disabled={working !== null} className={buttonClass("primary", "flex-1")}>
              {working === "save" ? <Loader2 className="animate-spin" size={18} /> : "Save question"}
            </button>
          </div>
        </form>
      </div>
      <AlertModal open={error !== null} onClose={() => setError(null)} title="Could not save" description={error ?? undefined} tone="danger" />
    </div>
  );
}

function SettingsModal({ paper, onClose, onSaved }: { paper: Paper; onClose: () => void; onSaved: () => void }) {
  const [bamini, setBamini] = useBaminiTyping();
  const [title, setTitle] = useState(paper.title);
  const [instructions, setInstructions] = useState(paper.instructions);
  const [opensAt, setOpensAt] = useState(toColomboInput(paper.opensAt));
  const [closesAt, setClosesAt] = useState(toColomboInput(paper.closesAt));
  const [duration, setDuration] = useState(String(paper.durationMinutes));
  const [shuffle, setShuffle] = useState(paper.shuffle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/online-papers/${paper._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          instructions,
          opensAt: fromColomboInput(opensAt)?.toISOString() ?? null,
          closesAt: fromColomboInput(closesAt)?.toISOString() ?? null,
          durationMinutes: Number(duration),
          shuffle,
        }),
      });
      if (res.ok) onSaved();
      else setError(await errorOf(res));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4" onClick={onClose}>
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-(--card-radius) border border-border bg-card p-5 shadow-2xl sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between">
          <h2 className="text-xl font-bold text-foreground">Paper settings</h2>
          <button onClick={onClose} aria-label="Close" className="cursor-pointer text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="field-label" htmlFor="s-title">Name</label>
            <input id="s-title" required className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="field-label" htmlFor="s-instructions">Instructions for students (optional)</label>
              <BaminiToggle on={bamini} onChange={setBamini} />
            </div>
            <BaminiInput id="s-instructions" multiline rows={3} bamini={bamini} className="field py-2" value={instructions} onValueChange={setInstructions} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="s-opens">Opens (Sri Lanka time)</label>
              <input id="s-opens" type="datetime-local" className="field" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="s-closes">Closes</label>
              <input id="s-closes" type="datetime-local" className="field" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
            </div>
          </div>
          <div className="w-40">
            <label className="field-label" htmlFor="s-duration">Time allowed (minutes)</label>
            <input id="s-duration" type="number" min="1" max={MAX_DURATION_MINUTES} required className="field" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
          <p className="text-sm text-muted-foreground">
            Students can start any time between opening and closing. The clock runs from when each one starts, and stops at closing time whatever is left — so for an exam everyone sits together, set the window just a little longer than the time allowed.
          </p>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
            <span>
              <span className="font-semibold text-foreground">Mix up the order for each student</span>
              <span className="block text-sm text-muted-foreground">Questions, and the answers to each, appear in a different order on every phone, so neighbours cannot copy by number. Turn it off if a question refers to another one or to “answer 3”.</span>
            </span>
          </label>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <button type="submit" disabled={saving} className={buttonClass("primary", "flex-1")}>
              {saving ? <Loader2 className="animate-spin" size={18} /> : "Save"}
            </button>
          </div>
        </form>
      </div>
      <AlertModal open={error !== null} onClose={() => setError(null)} title="Could not save" description={error ?? undefined} tone="danger" />
    </div>
  );
}
