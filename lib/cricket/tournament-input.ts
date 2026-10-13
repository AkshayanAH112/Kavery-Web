import { TOURNAMENT_STATUSES, type TournamentStatus } from "./engine";
import { isId, parseDate, parseOvers, text } from "./server";

type Changes = Partial<{
  name: string;
  season: string | null;
  venue: string | null;
  oversPerInnings: number;
  teamIds: string[];
  status: TournamentStatus;
  pointsWin: number;
  pointsTie: number;
  pointsNoResult: number;
  startDate: Date | null;
  endDate: Date | null;
  isPublished: boolean;
}>;

/**
 * Validates a tournament form body, for create and update alike: only the
 * fields present in the body are returned. A string is a message for the admin.
 */
export function parseTournamentInput(data: Record<string, unknown> | null): Changes | string {
  if (!data) return "Invalid request";
  const changes: Changes = {};

  if (data.name !== undefined) {
    const name = text(data.name, 80);
    if (!name) return "Tournament name is required";
    changes.name = name;
  }
  if (data.season !== undefined) changes.season = text(data.season, 20) || null;
  if (data.venue !== undefined) changes.venue = text(data.venue, 80) || null;
  if (data.oversPerInnings !== undefined) {
    const overs = parseOvers(data.oversPerInnings);
    if (!overs) return "Overs per innings must be a whole number from 1 to 50";
    changes.oversPerInnings = overs;
  }
  if (data.teams !== undefined) {
    if (!Array.isArray(data.teams)) return "teams must be a list";
    changes.teamIds = [...new Set(data.teams.filter(isId))];
  }
  if (data.status !== undefined) {
    if (!TOURNAMENT_STATUSES.includes(data.status as TournamentStatus)) return `status must be one of: ${TOURNAMENT_STATUSES.join(", ")}`;
    changes.status = data.status as TournamentStatus;
  }
  for (const field of ["pointsWin", "pointsTie", "pointsNoResult"] as const) {
    if (data[field] === undefined) continue;
    const n = Number(data[field]);
    if (!Number.isInteger(n) || n < 0 || n > 10) return "Points must be whole numbers from 0 to 10";
    changes[field] = n;
  }
  if (data.startDate !== undefined) changes.startDate = parseDate(data.startDate);
  if (data.endDate !== undefined) changes.endDate = parseDate(data.endDate);
  if (data.isPublished !== undefined) changes.isPublished = !!data.isPublished;

  return changes;
}
