"use client";

import { uploadImage } from "@/lib/upload-client";
import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { PLAYER_ROLES, type PlayerRole } from "@/lib/cricket/engine";
import { ConfirmDialog } from "@/components/console/confirm-dialog";
import { cricketApi, ROLE_LABEL, teamInitials, type AdminPlayer, type AdminTeam } from "./api";

type Draft = {
  _id?: string;
  name: string;
  shortName: string;
  color: string;
  logoUrl: string;
  logoPublicId: string;
  players: AdminPlayer[];
};

const emptyDraft = (): Draft => ({ name: "", shortName: "", color: "#720000", logoUrl: "", logoPublicId: "", players: [] });

export function TeamBadge({ team, size = 36 }: { team: { name: string; shortName?: string; color?: string | null; logoUrl?: string | null }; size?: number }) {
  if (team.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={team.logoUrl} alt={team.name} width={size} height={size} className="shrink-0 rounded-full border border-border bg-white object-contain" style={{ width: size, height: size }} />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
      style={{ width: size, height: size, backgroundColor: team.color || "#720000" }}
      aria-hidden
    >
      {teamInitials(team)}
    </span>
  );
}

export function TeamsPanel({ teams, onChanged }: { teams: AdminTeam[]; onChanged: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [bulk, setBulk] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AdminTeam | null>(null);

  const edit = (team: AdminTeam) => {
    setError(null);
    setBulk("");
    setDraft({
      _id: team._id,
      name: team.name,
      shortName: team.shortName ?? "",
      color: team.color ?? "#720000",
      logoUrl: team.logoUrl ?? "",
      logoPublicId: team.logoPublicId ?? "",
      players: team.players.map((p) => ({ ...p })),
    });
  };

  const setPlayer = (index: number, patch: Partial<AdminPlayer>) =>
    setDraft((d) => d && { ...d, players: d.players.map((p, i) => (i === index ? { ...p, ...patch } : p)) });

  // A team sheet usually arrives as a list in a message, so names can be
  // pasted one per line instead of typed into rows.
  const addBulk = () => {
    const names = bulk.split("\n").map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    setDraft((d) => d && {
      ...d,
      players: [...d.players, ...names.map((name) => ({ name, role: "batter" as PlayerRole, isCaptain: false, isKeeper: false }))],
    });
    setBulk("");
  };

  const uploadLogo = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const d = await uploadImage(file, "cricket");
      setDraft((prev) => prev && { ...prev, logoUrl: d.url, logoPublicId: d.publicId });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await cricketApi(draft._id ? `/api/cricket/teams/${draft._id}` : "/api/cricket/teams", {
        method: draft._id ? "PATCH" : "POST",
        body: draft,
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
      await cricketApi(`/api/cricket/teams/${target._id}`, { method: "DELETE" });
      onChanged();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-4">
      {!draft && (
        <button
          onClick={() => { setError(null); setBulk(""); setDraft(emptyDraft()); }}
          className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus size={18} aria-hidden /> New team
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
            <h2 className="text-xl text-foreground">{draft._id ? "Edit team" : "New team"}</h2>
            <button type="button" onClick={() => setDraft(null)} aria-label="Close" className="cursor-pointer rounded-lg p-2 text-muted-foreground hover:bg-muted">
              <X size={18} aria-hidden />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label htmlFor="teamName" className="field-label">Team name</label>
              <input id="teamName" required maxLength={60} className="field" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div>
              <label htmlFor="teamShort" className="field-label">Short name</label>
              <input id="teamShort" maxLength={5} placeholder="KCSC" className="field uppercase" value={draft.shortName} onChange={(e) => setDraft({ ...draft, shortName: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label htmlFor="teamColor" className="field-label">Colour</label>
              <input id="teamColor" type="color" className="field cursor-pointer p-1" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <TeamBadge team={draft} size={48} />
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">
              {uploading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Upload size={16} aria-hidden />}
              {draft.logoUrl ? "Replace crest" : "Upload crest (optional)"}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            </label>
            {draft.logoUrl && (
              <button type="button" onClick={() => setDraft({ ...draft, logoUrl: "", logoPublicId: "" })} className="cursor-pointer text-sm text-muted-foreground underline hover:text-foreground">
                Remove crest
              </button>
            )}
          </div>

          <div className="space-y-2">
            <p className="field-label">Players ({draft.players.length})</p>
            {draft.players.map((p, i) => (
              <div key={p._id ?? `new-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
                <input aria-label={`Player ${i + 1} name`} required maxLength={60} className="field min-w-40 flex-1" value={p.name} onChange={(e) => setPlayer(i, { name: e.target.value })} />
                <select aria-label={`Player ${i + 1} role`} className="field w-auto cursor-pointer" value={p.role} onChange={(e) => setPlayer(i, { role: e.target.value as PlayerRole })}>
                  {PLAYER_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
                <label className="flex cursor-pointer items-center gap-1.5 text-sm text-foreground">
                  <input type="checkbox" checked={p.isCaptain} onChange={(e) => setPlayer(i, { isCaptain: e.target.checked })} /> Captain
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 text-sm text-foreground">
                  <input type="checkbox" checked={p.isKeeper} onChange={(e) => setPlayer(i, { isKeeper: e.target.checked })} /> Keeper
                </label>
                <button type="button" aria-label={`Remove ${p.name || "player"}`} onClick={() => setDraft({ ...draft, players: draft.players.filter((_, j) => j !== i) })} className="ml-auto cursor-pointer rounded-lg p-2 text-destructive hover:bg-destructive/10">
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
            ))}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <textarea aria-label="Add players, one name per line" className="field flex-1" rows={3} placeholder={"Add players — one name per line"} value={bulk} onChange={(e) => setBulk(e.target.value)} />
              <button type="button" onClick={addBulk} disabled={!bulk.trim()} className="cursor-pointer rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
                Add to squad
              </button>
            </div>
          </div>

          <button type="submit" disabled={saving || uploading} className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
            {saving && <Loader2 size={16} className="animate-spin" aria-hidden />}
            Save team
          </button>
        </form>
      )}

      {teams.length === 0 && !draft ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
          No teams yet. Add your own side and the teams you play against.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => (
            <div key={team._id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-xs">
              <TeamBadge team={team} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">{team.name}</p>
                <p className="text-sm text-muted-foreground">{team.players.length} player{team.players.length === 1 ? "" : "s"}</p>
              </div>
              <button onClick={() => edit(team)} title="Edit team" aria-label={`Edit ${team.name}`} className="cursor-pointer rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <Pencil size={16} aria-hidden />
              </button>
              <button onClick={() => setRemoveTarget(team)} title="Delete team" aria-label={`Delete ${team.name}`} className="cursor-pointer rounded-lg p-2 text-destructive transition-colors hover:bg-destructive/10">
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
        title={`Delete ${removeTarget?.name ?? "this team"}?`}
        description="A team that has played a match cannot be deleted."
        confirmLabel="Delete"
        tone="danger"
      />
    </div>
  );
}
