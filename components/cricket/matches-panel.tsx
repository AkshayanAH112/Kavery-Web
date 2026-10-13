"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EyeOff, Loader2, Plus, Trash2, X } from "lucide-react";
import type { MatchCard } from "@/lib/cricket/view";
import { ConfirmDialog } from "@/components/console/confirm-dialog";
import { cricketApi, type AdminTeam, type AdminTournament } from "./api";
import { formatDateTime, resultText, STATUS_LABEL } from "./format";
import { TeamBadge } from "./teams-panel";

export type AdminMatchCard = MatchCard & { isPublished: boolean };

const STATUS_STYLE: Record<MatchCard["status"], string> = {
  upcoming: "bg-muted text-muted-foreground",
  live: "bg-destructive/10 text-destructive",
  innings_break: "bg-warning/15 text-warning",
  completed: "bg-success/10 text-success",
  abandoned: "bg-muted text-muted-foreground",
};

const emptyForm = { tournamentId: "", teamA: "", teamB: "", title: "", venue: "", startAt: "", oversPerInnings: 20 };

export function MatchesPanel({
  matches,
  teams,
  tournaments,
  onChanged,
}: {
  matches: AdminMatchCard[];
  teams: AdminTeam[];
  tournaments: AdminTournament[];
  onChanged: () => void;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AdminMatchCard | null>(null);

  const tournament = tournaments.find((t) => t._id === form.tournamentId);
  // Inside a tournament only its own teams can meet; a friendly can be anyone.
  const eligible = useMemo(
    () => (tournament ? teams.filter((t) => tournament.teams.includes(t._id)) : teams),
    [tournament, teams]
  );

  const pickTournament = (id: string) => {
    const t = tournaments.find((x) => x._id === id);
    setForm((f) => ({
      ...f,
      tournamentId: id,
      teamA: "",
      teamB: "",
      oversPerInnings: t?.oversPerInnings ?? f.oversPerInnings,
      venue: t?.venue || f.venue,
    }));
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { match } = await cricketApi<{ match: { id: string } }>("/api/cricket/matches", {
        method: "POST",
        body: {
          ...form,
          tournamentId: form.tournamentId || undefined,
          // datetime-local has no zone. Converting here pins it to the admin's
          // own clock (Sri Lanka); sent raw, the UTC server would read 3pm as 3pm UTC.
          startAt: form.startAt ? new Date(form.startAt).toISOString() : undefined,
        },
      });
      router.push(`/console/cricket/matches/${match.id}`);
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  };

  const remove = async () => {
    const target = removeTarget;
    if (!target) return;
    setRemoveTarget(null);
    try {
      await cricketApi(`/api/cricket/matches/${target.id}`, { method: "DELETE" });
      onChanged();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const score = (m: AdminMatchCard, teamId: string) => {
    const lines = m.scores.filter((s) => s.team === teamId);
    return lines.length ? lines.map((s) => `${s.runs}/${s.wickets} (${s.overs})`).join(" & ") : null;
  };

  return (
    <div className="space-y-4">
      <button
        onClick={() => { setError(null); setFormOpen((o) => !o); }}
        className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {formOpen ? <X size={18} aria-hidden /> : <Plus size={18} aria-hidden />}
        {formOpen ? "Cancel" : "New match"}
      </button>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {formOpen && (
        <form onSubmit={create} className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-xs sm:p-6">
          {teams.length < 2 && (
            <p className="text-sm text-muted-foreground">Add at least two teams on the Teams tab first.</p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="mTournament" className="field-label">Tournament</label>
              <select id="mTournament" className="field cursor-pointer" value={form.tournamentId} onChange={(e) => pickTournament(e.target.value)}>
                <option value="">Friendly (no tournament)</option>
                {tournaments.map((t) => <option key={t._id} value={t._id}>{t.name}{t.season ? ` · ${t.season}` : ""}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="mTeamA" className="field-label">Team A</label>
              <select id="mTeamA" required className="field cursor-pointer" value={form.teamA} onChange={(e) => setForm({ ...form, teamA: e.target.value })}>
                <option value="">Choose…</option>
                {eligible.filter((t) => t._id !== form.teamB).map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="mTeamB" className="field-label">Team B</label>
              <select id="mTeamB" required className="field cursor-pointer" value={form.teamB} onChange={(e) => setForm({ ...form, teamB: e.target.value })}>
                <option value="">Choose…</option>
                {eligible.filter((t) => t._id !== form.teamA).map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="mTitle" className="field-label">Title (optional)</label>
              <input id="mTitle" maxLength={60} placeholder="Final, Match 4…" className="field" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label htmlFor="mVenue" className="field-label">Venue</label>
              <input id="mVenue" maxLength={80} className="field" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
            </div>
            <div>
              <label htmlFor="mStart" className="field-label">Start</label>
              <input id="mStart" type="datetime-local" className="field" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} />
            </div>
            <div>
              <label htmlFor="mOvers" className="field-label">Overs per innings</label>
              <input id="mOvers" type="number" min={1} max={50} required className="field" value={form.oversPerInnings} onChange={(e) => setForm({ ...form, oversPerInnings: Number(e.target.value) })} />
            </div>
          </div>
          <button type="submit" disabled={saving} className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
            {saving && <Loader2 size={16} className="animate-spin" aria-hidden />}
            Create and open
          </button>
        </form>
      )}

      {matches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
          No matches yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {matches.map((m) => (
            <div key={m.id} className="rounded-lg border border-border bg-card p-4 shadow-xs">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className={`rounded-full px-2.5 py-1 font-bold ${STATUS_STYLE[m.status]}`}>{STATUS_LABEL[m.status]}</span>
                {!m.isPublished && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-bold">
                    <EyeOff size={12} aria-hidden /> Hidden
                  </span>
                )}
                <span className="truncate">
                  {[m.tournament?.name ?? "Friendly", m.title, formatDateTime(m.startAt)].filter(Boolean).join(" · ")}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {[m.teamA, m.teamB].map((team) => (
                  <div key={team.id} className="flex items-center gap-3">
                    <TeamBadge team={team} size={28} />
                    <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{team.name}</span>
                    <span className="tabular-nums text-sm text-foreground">{score(m, team.id) ?? "—"}</span>
                  </div>
                ))}
              </div>

              {resultText(m) && <p className="mt-2 text-sm font-medium text-foreground">{resultText(m)}</p>}

              <div className="mt-3 flex items-center gap-2">
                <Link
                  href={`/console/cricket/matches/${m.id}`}
                  className="flex-1 rounded-lg bg-primary px-3 py-2 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {m.status === "upcoming" ? "Set up & start" : m.status === "live" || m.status === "innings_break" ? "Continue scoring" : "Open"}
                </Link>
                <button onClick={() => setRemoveTarget(m)} title="Delete match" aria-label={`Delete ${m.teamA.name} v ${m.teamB.name}`} className="cursor-pointer rounded-lg p-2 text-destructive transition-colors hover:bg-destructive/10">
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        onConfirm={remove}
        title={`Delete ${removeTarget ? `${removeTarget.teamA.name} v ${removeTarget.teamB.name}` : "this match"}?`}
        description="Every ball scored in it is erased, and it drops out of the points table and player statistics. This cannot be undone."
        confirmLabel="Delete match"
        tone="danger"
      />
    </div>
  );
}
