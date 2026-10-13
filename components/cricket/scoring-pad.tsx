"use client";

import { useState } from "react";
import { ArrowLeftRight, RotateCcw, Square } from "lucide-react";
import type { BallLabel, ExtraType, WicketKind } from "@/lib/cricket/engine";
import type { ScoreAction } from "@/lib/cricket/scoring";
import { ConfirmDialog, Modal } from "@/components/console/confirm-dialog";
import { WICKET_LABEL } from "./format";
import { playerName, type AdminMatchView } from "./scorecard";

type Slot = "striker" | "nonStriker" | "bowler";

const EXTRAS: { key: ExtraType; label: string; hint: string }[] = [
  { key: "wd", label: "Wide", hint: "Wide — then tap the runs the batters ran (0 for a plain wide)." },
  { key: "nb", label: "No ball", hint: "No ball — then tap the runs off the bat." },
  { key: "b", label: "Bye", hint: "Byes — then tap how many." },
  { key: "lb", label: "Leg bye", hint: "Leg byes — then tap how many." },
];

// Mirrors WICKETS_ALLOWED in lib/cricket/scoring.ts. The server enforces it;
// this only keeps impossible choices off the sheet.
const WICKETS_FOR: Record<ExtraType | "none", WicketKind[]> = {
  none: ["bowled", "caught", "lbw", "stumped", "run_out", "hit_wicket"],
  wd: ["stumped", "run_out", "hit_wicket"],
  nb: ["run_out"],
  b: ["run_out"],
  lb: ["run_out"],
};

const BALL_STYLE: Record<BallLabel["kind"], string> = {
  dot: "bg-muted text-muted-foreground",
  run: "bg-secondary text-secondary-foreground",
  four: "bg-primary text-primary-foreground",
  six: "bg-accent text-on-accent",
  wicket: "bg-destructive text-on-danger",
  extra: "bg-warning/20 text-warning",
};

export function BallChip({ ball }: { ball: BallLabel }) {
  return (
    <span className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums ${BALL_STYLE[ball.kind]}`}>
      {ball.text}
    </span>
  );
}

const padButton =
  "flex min-h-14 cursor-pointer items-center justify-center rounded-lg border text-xl font-bold tabular-nums transition-colors active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40";

export function ScoringPad({
  match,
  busy,
  onAct,
}: {
  match: AdminMatchView;
  busy: boolean;
  onAct: (action: ScoreAction) => Promise<boolean>;
}) {
  const [extra, setExtra] = useState<ExtraType | null>(null);
  const [wicketOpen, setWicketOpen] = useState(false);
  const [changing, setChanging] = useState<Slot | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const live = match.live;
  const inn = match.innings[match.innings.length - 1];
  if (!live || !inn) return null;

  const name = (id?: string | null) => playerName(match, id);
  const battingSquad = inn.battingTeam === match.teamA.id ? match.squadA : match.squadB;
  const bowlingSquad = inn.battingTeam === match.teamA.id ? match.squadB : match.squadA;
  const dismissed = new Set(inn.batting.filter((b) => b.out).map((b) => b.id));
  const retired = new Set(inn.batting.filter((b) => b.retired).map((b) => b.id));
  const availableBatters = battingSquad.filter((id) => !dismissed.has(id) && id !== live.striker && id !== live.nonStriker);
  const batterLine = (id?: string | null) => inn.batting.find((b) => b.id === id);
  const bowlerLine = inn.bowling.find((b) => b.id === live.bowler);

  // The first empty slot is asked for before anything else can be scored.
  const needed: Slot | null = !live.striker ? "striker" : !live.nonStriker ? "nonStriker" : !live.bowler ? "bowler" : null;
  const thisOver = live.overComplete ? [] : inn.oversLog[inn.oversLog.length - 1]?.balls ?? [];

  const ball = async (runs: number) => {
    if (await onAct({ type: "ball", runs, extraType: extra })) setExtra(null);
  };

  const pick = async (slot: Slot, id: string) => {
    if (await onAct({ type: "set_players", [slot]: id })) setChanging(null);
  };

  const options = (slot: Slot) =>
    slot === "bowler"
      ? bowlingSquad.map((id) => ({
          id,
          label: name(id),
          note: live.overComplete && id === live.lastOverBowler ? "bowled the last over" : inn.bowling.find((b) => b.id === id)?.overs,
          disabled: (live.overComplete && id === live.lastOverBowler) || id === live.bowler,
        }))
      : availableBatters.map((id) => ({ id, label: name(id), note: retired.has(id) ? "retired hurt" : undefined, disabled: false }));

  const slotTitle: Record<Slot, string> = {
    striker: inn.legalBalls === 0 && inn.wickets === 0 ? "Who takes strike?" : "New batter — on strike",
    nonStriker: inn.legalBalls === 0 && inn.wickets === 0 ? "Who is at the non-striker's end?" : "New batter — non-striker's end",
    bowler: inn.legalBalls === 0 ? "Who opens the bowling?" : "Who bowls the next over?",
  };

  const picker = (slot: Slot) => (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options(slot).map((o) => (
        <button
          key={o.id}
          disabled={busy || o.disabled}
          onClick={() => pick(slot, o.id)}
          className="flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 text-left text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="truncate">{o.label}</span>
          {o.note && <span className="shrink-0 text-xs font-normal text-muted-foreground">{o.note}</span>}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Who is in the middle */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
        <div className="space-y-2">
          {(["striker", "nonStriker"] as const).map((slot) => {
            const id = live[slot];
            const line = batterLine(id);
            return (
              <div key={slot} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-foreground">
                  <span className={slot === "striker" ? "font-bold" : "font-medium"}>{id ? name(id) : "—"}</span>
                  {slot === "striker" && id && <span className="ml-1 text-primary" aria-label="on strike">*</span>}
                </span>
                <span className="tabular-nums text-sm text-foreground">
                  {line ? <><strong>{line.runs}</strong> ({line.balls})</> : id ? "0 (0)" : ""}
                </span>
                {id && (
                  <button onClick={() => setChanging(slot)} className="cursor-pointer text-xs text-muted-foreground underline hover:text-foreground">
                    change
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            Bowling: <span className="font-semibold text-foreground">{live.bowler ? name(live.bowler) : "—"}</span>
          </span>
          {bowlerLine && (
            <span className="tabular-nums text-sm text-foreground">
              {bowlerLine.overs}-{bowlerLine.maidens}-{bowlerLine.runs}-{bowlerLine.wickets}
            </span>
          )}
          {live.bowler && (
            <button onClick={() => setChanging("bowler")} className="cursor-pointer text-xs text-muted-foreground underline hover:text-foreground">
              change
            </button>
          )}
        </div>
        <div className="mt-3 flex min-h-8 flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-muted-foreground">This over</span>
          {thisOver.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : thisOver.map((b, i) => <BallChip key={i} ball={b} />)}
          {live.freeHit && (
            <span className="ml-auto rounded-full bg-warning px-2.5 py-1 text-xs font-bold text-warning-foreground">FREE HIT</span>
          )}
        </div>
      </div>

      {needed ? (
        <div className="space-y-3 rounded-lg border-2 border-primary/40 bg-card p-4">
          <p className="font-semibold text-foreground">{slotTitle[needed]}</p>
          {picker(needed)}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {EXTRAS.map((e) => (
              <button
                key={e.key}
                disabled={busy}
                aria-pressed={extra === e.key}
                onClick={() => setExtra(extra === e.key ? null : e.key)}
                className={`min-h-11 cursor-pointer rounded-lg border px-1 text-sm font-semibold transition-colors disabled:opacity-40 ${
                  extra === e.key ? "border-warning bg-warning text-warning-foreground" : "border-border bg-card text-foreground hover:bg-muted"
                }`}
              >
                {e.label}
              </button>
            ))}
          </div>
          {/* Reserved height so arming an extra does not push the run buttons
              down under the scorer's thumb. */}
          <p className="min-h-5 text-xs text-muted-foreground" aria-live="polite">
            {extra ? EXTRAS.find((e) => e.key === extra)?.hint : "Tap the runs off the bat."}
          </p>

          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3, 4, 5, 6].map((runs) => (
              <button
                key={runs}
                disabled={busy || ((extra === "b" || extra === "lb") && runs === 0)}
                onClick={() => ball(runs)}
                className={`${padButton} ${
                  runs === 4 || runs === 6 ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90" : "border-border bg-card text-foreground hover:bg-muted"
                }`}
              >
                {runs}
              </button>
            ))}
            <button
              disabled={busy}
              onClick={() => setWicketOpen(true)}
              className={`${padButton} border-destructive bg-destructive text-base text-on-danger hover:bg-destructive/90`}
            >
              OUT
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <button disabled={busy} onClick={() => onAct({ type: "undo" })} className="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40">
          <RotateCcw size={15} aria-hidden /> Undo
        </button>
        <button disabled={busy || !live.striker || !live.nonStriker} onClick={() => onAct({ type: "swap_strike" })} className="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40">
          <ArrowLeftRight size={15} aria-hidden /> Swap strike
        </button>
        <button disabled={busy} onClick={() => setConfirmEnd(true)} className="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40">
          <Square size={14} aria-hidden /> End innings
        </button>
      </div>

      <Modal
        open={changing !== null}
        onClose={() => setChanging(null)}
        title={changing === "bowler" ? "Change bowler" : "Replace batter"}
        description={
          changing === "bowler"
            ? "Use this mid-over only if the bowler cannot continue."
            : `${name(changing ? live[changing] : null)} walks off retired hurt — not out, and able to come back later.`
        }
        footer={
          <button onClick={() => setChanging(null)} className="flex-1 cursor-pointer rounded-xl border border-border bg-card py-2 font-medium text-foreground transition-colors hover:bg-muted">
            Cancel
          </button>
        }
      >
        <div className="mt-4 max-h-72 overflow-y-auto">{changing && picker(changing)}</div>
      </Modal>

      {wicketOpen && (
        <WicketSheet
          match={match}
          extra={extra}
          busy={busy}
          fielders={bowlingSquad}
          onClose={() => setWicketOpen(false)}
          onConfirm={async (runs, wicket) => {
            if (await onAct({ type: "ball", runs, extraType: extra, wicket })) {
              setWicketOpen(false);
              setExtra(null);
            }
          }}
        />
      )}

      <ConfirmDialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        onConfirm={() => { setConfirmEnd(false); onAct({ type: "end_innings" }); }}
        title="End this innings now?"
        description={`${inn.runs}/${inn.wickets} after ${inn.overs} overs. An innings ends by itself when the overs run out, the side is all out, or the target is reached — use this for a declaration or a shortened game. Undo reopens it.`}
        confirmLabel="End innings"
      />
    </div>
  );
}

function WicketSheet({
  match,
  extra,
  busy,
  fielders,
  onClose,
  onConfirm,
}: {
  match: AdminMatchView;
  extra: ExtraType | null;
  busy: boolean;
  fielders: string[];
  onClose: () => void;
  onConfirm: (runs: number, wicket: { kind: WicketKind; playerOut?: string; fielder?: string | null }) => void;
}) {
  const live = match.live;
  const kinds = WICKETS_FOR[extra ?? "none"];
  const [kind, setKind] = useState<WicketKind>(kinds[0]);
  const [playerOut, setPlayerOut] = useState<string>(live?.striker ?? "");
  const [fielder, setFielder] = useState("");
  // Byes and leg byes cannot be scored as zero, so a run out off one starts at 1.
  const minRuns = extra === "b" || extra === "lb" ? 1 : 0;
  const [runs, setRuns] = useState(minRuns);
  if (!live) return null;

  const isRunOut = kind === "run_out";
  const takesFielder = kind === "caught" || kind === "stumped" || isRunOut;
  const choice = (active: boolean) =>
    `min-h-11 cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted"
    }`;

  return (
    <Modal
      open
      onClose={onClose}
      title="Wicket"
      tone="danger"
      footer={
        <>
          <button onClick={onClose} className="flex-1 cursor-pointer rounded-xl border border-border bg-card py-2 font-medium text-foreground transition-colors hover:bg-muted">
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={() => onConfirm(isRunOut ? runs : 0, { kind, playerOut: isRunOut ? playerOut : undefined, fielder: takesFielder && fielder ? fielder : null })}
            className="flex-1 cursor-pointer rounded-xl bg-destructive py-2 font-medium text-on-danger transition-colors hover:bg-destructive/90 disabled:opacity-50"
          >
            Confirm out
          </button>
        </>
      }
    >
      <div className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {kinds.map((k) => (
            <button key={k} onClick={() => setKind(k)} className={choice(kind === k)}>
              {WICKET_LABEL[k]}
            </button>
          ))}
        </div>

        {isRunOut && (
          <>
            <div>
              <p className="field-label">Who is out?</p>
              <div className="grid grid-cols-2 gap-2">
                {[live.striker, live.nonStriker].map((id) => id && (
                  <button key={id} onClick={() => setPlayerOut(id)} className={choice(playerOut === id)}>
                    {playerName(match, id)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="field-label">Runs completed before the run out</p>
              <div className="grid grid-cols-4 gap-2">
                {[0, 1, 2, 3].filter((r) => r >= minRuns).map((r) => (
                  <button key={r} onClick={() => setRuns(r)} className={choice(runs === r)}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {takesFielder && (
          <div>
            <label htmlFor="wicketFielder" className="field-label">
              {kind === "stumped" ? "Wicket-keeper" : "Fielder"} (optional)
            </label>
            <select id="wicketFielder" className="field cursor-pointer" value={fielder} onChange={(e) => setFielder(e.target.value)}>
              <option value="">Not recorded</option>
              {fielders.map((id) => <option key={id} value={id}>{playerName(match, id)}</option>)}
            </select>
          </div>
        )}
      </div>
    </Modal>
  );
}
