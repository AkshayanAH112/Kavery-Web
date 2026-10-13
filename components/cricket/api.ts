import type { PlayerRole } from "@/lib/cricket/engine";

export type ApiError = Error & { status: number; data: any };

/** JSON fetch for the cricket admin screens. Throws with the route's own message. */
export async function cricketApi<T = any>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.error ?? "Request failed"), { status: res.status, data }) as ApiError;
  }
  return data as T;
}

export type AdminPlayer = { _id?: string; name: string; role: PlayerRole; isCaptain: boolean; isKeeper: boolean };

export type AdminTeam = {
  _id: string;
  name: string;
  shortName?: string;
  color?: string;
  logoUrl?: string;
  logoPublicId?: string;
  players: (AdminPlayer & { _id: string })[];
};

export type AdminTournament = {
  _id: string;
  name: string;
  slug: string;
  season?: string;
  venue?: string;
  oversPerInnings: number;
  teams: string[];
  status: "upcoming" | "ongoing" | "completed";
  pointsWin: number;
  pointsTie: number;
  pointsNoResult: number;
  isPublished: boolean;
  startDate?: string;
  endDate?: string;
};

export const ROLE_LABEL: Record<PlayerRole, string> = {
  batter: "Batter",
  bowler: "Bowler",
  all_rounder: "All-rounder",
  wicket_keeper: "Wicket-keeper",
};

/** Small coloured disc with the team's short name — most sides have no crest. */
export function teamInitials(team: { name: string; shortName?: string }) {
  return team.shortName || team.name.slice(0, 3).toUpperCase();
}
