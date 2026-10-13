"use client";

import { useState } from "react";
import { ExternalLink, Eye, EyeOff, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { TOURNAMENT_STATUSES } from "@/lib/cricket/engine";
import { ConfirmDialog } from "@/components/console/confirm-dialog";
import { cricketApi, type AdminTeam, type AdminTournament } from "./api";

type Draft = {
  _id?: string;
  name: string;
  season: string;
  venue: string;
  oversPerInnings: number;
  startDate: string;
  endDate: string;
  teams: string[];
  pointsWin: number;
  pointsTie: number;
  pointsNoResult: number;
};

const emptyDraft = (): Draft => ({
  name: "",
  season: String(new Date().getFullYear()),
  venue: "",
  oversPerInnings: 20,
  startDate: "",
  endDate: "",
  teams: [],
  pointsWin: 2,
  pointsTie: 1,
  pointsNoResult: 1,
});

const STATUS_LABEL: Record<AdminTournament["status"], string> = {
  upcoming: "Upcoming",
  ongoing: "Ongoing",
  completed: "Completed",
};

const dateInput = (value?: string) => (value ? value.slice(0, 10) : "");

export function TournamentsPanel({
  tournaments,
  teams,
  onChanged,
}: {
  tournaments: AdminTournament[];
  teams: AdminTeam[];
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AdminTournament | null>(null);

  const edit = (t: AdminTournament) => {
    setError(null);
    setDraft({
      _id: t._id,
      name: t.name,
      season: t.season ?? "",
      venue: t.venue ?? "",
      oversPerInnings: t.oversPerInnings,
      startDate: dateInput(t.startDate),
      endDate: dateInput(t.endDate),
      teams: t.teams,
      pointsWin: t.pointsWin,
      pointsTie: t.pointsTie,
      pointsNoResult: t.pointsNoResult,
    });
  };

  const patch = async (t: AdminTournament, body: Partial<AdminTournament>) => {
    setError(null);
    try {
      await cricketApi(`/api/cricket/tournaments/${t._id}`, { method: "PATCH", body });
      onChanged();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const { _id, ...body } = draft;
      await cricketApi(_id ? `/api/cricket/tournaments/${_id}` : "/api/cricket/tournaments", {
        method: _id ? "PATCH" : "POST",
        body,
      });
      setDraft(null);
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const target = removeTarget;
    if (!target) return;
    setRemoveTarget(null);
    try {
      await cricketApi(`/api/cricket/tournaments/${target._id}`, { method: "DELETE" });
      onChanged();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleTeam = (id: string) =>
    setDraft((d) => d && { ...d, teams: d.teams.includes(id) ? d.teams.filter((t) => t !== id) : [...d.teams, id] });

  return (
    <div className="space-y-4">
      {!draft && (
        <button
          onClick={() => { setError(null); setDraft(emptyDraft()); }}
          className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus size={18} aria-hidden /> New tournament
        </button>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {draft && (
        <form onSubmit={save} className="space-y-5 rounded-lg border border-border bg-card p-4 shadow-xs sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl text-foreground">{draft._id ? "Edit tournament" : "New tournament"}</h2>
            <button type="button" onClick={() => setDraft(null)} aria-label="Close" className="cursor-pointer rounded-lg p-2 text-muted-foreground hover:bg-muted">
              <X size={18} aria-hidden />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label htmlFor="tName" className="field-label">Name</label>
              <input id="tName" required maxLength={80} className="field" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div>
              <label htmlFor="tSeason" className="field-label">Season</label>
              <input id="tSeason" maxLength={20} className="field" value={draft.season} onChange={(e) => setDraft({ ...draft, season: e.target.value })} />
            </div>
            <div>
              <label htmlFor="tOvers" className="field-label">Overs per innings</label>
              <input id="tOvers" type="number" min={1} max={50} required className="field" value={draft.oversPerInnings} onChange={(e) => setDraft({ ...draft, oversPerInnings: Number(e.target.value) })} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="tVenue" className="field-label">Venue</label>
              <input id="tVenue" maxLength={80} className="field" value={draft.venue} onChange={(e) => setDraft({ ...draft, venue: e.target.value })} />
            </div>
            <div>
              <label htmlFor="tStart" className="field-label">Starts</label>
              <input id="tStart" type="date" className="field" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
            </div>
            <div>
              <label htmlFor="tEnd" className="field-label">Ends</label>
              <input id="tEnd" type="date" className="field" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
            </div>
          </div>

          <fieldset>
            <legend className="field-label">Teams ({draft.teams.length})</legend>
            {teams.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add teams on the Teams tab first.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {teams.map((team) => (
                  <label key={team._id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted">
                    <input type="checkbox" checked={draft.teams.includes(team._id)} onChange={() => toggleTeam(team._id)} />
                    <span className="truncate">{team.name}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div className="grid grid-cols-3 gap-4 sm:max-w-md">
            {([["pointsWin", "Win"], ["pointsTie", "Tie"], ["pointsNoResult", "No result"]] as const).map(([field, label]) => (
              <div key={field}>
                <label htmlFor={field} className="field-label">Points: {label}</label>
                <input id={field} type="number" min={0} max={10} required className="field" value={draft[field]} onChange={(e) => setDraft({ ...draft, [field]: Number(e.target.value) })} />
              </div>
            ))}
          </div>

          <button type="submit" disabled={saving} className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
            {saving && <Loader2 size={16} className="animate-spin" aria-hidden />}
            Save tournament
          </button>
        </form>
      )}

      {tournaments.length === 0 && !draft ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
          No tournaments yet. A match does not need one — friendlies can be scored on their own.
        </div>
      ) : (
        <div className="space-y-3">
          {tournaments.map((t) => (
            <div key={t._id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-xs">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">
                  {t.name} {t.season && <span className="font-normal text-muted-foreground">· {t.season}</span>}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t.teams.length} team{t.teams.length === 1 ? "" : "s"} · {t.oversPerInnings} overs
                </p>
              </div>

              <select
                aria-label={`${t.name} status`}
                className="field w-auto cursor-pointer"
                value={t.status}
                onChange={(e) => patch(t, { status: e.target.value as AdminTournament["status"] })}
              >
                {TOURNAMENT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>

              {/* Unpublished is the default: fixtures and squads are assembled
                  over days, and nothing shows on the public site until this is on. */}
              <button
                onClick={() => patch(t, { isPublished: !t.isPublished })}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  t.isPublished ? "bg-success/10 text-success hover:bg-success/20" : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {t.isPublished ? <Eye size={15} aria-hidden /> : <EyeOff size={15} aria-hidden />}
                {t.isPublished ? "Published" : "Hidden"}
              </button>
              {t.isPublished && (
                <a href={`/en/live/tournament/${t.slug}`} target="_blank" rel="noreferrer" title="Open public page" aria-label={`Open ${t.name} public page`} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <ExternalLink size={16} aria-hidden />
                </a>
              )}

              <button onClick={() => edit(t)} title="Edit tournament" aria-label={`Edit ${t.name}`} className="cursor-pointer rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <Pencil size={16} aria-hidden />
              </button>
              <button onClick={() => setRemoveTarget(t)} title="Delete tournament" aria-label={`Delete ${t.name}`} className="cursor-pointer rounded-lg p-2 text-destructive transition-colors hover:bg-destructive/10">
                <Trash2 size={16} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        onConfirm={remove}
        title={`Delete ${removeTarget?.name ?? "this tournament"}?`}
        description="A tournament with matches cannot be deleted — delete its matches first."
        confirmLabel="Delete"
        tone="danger"
      />
    </div>
  );
}
