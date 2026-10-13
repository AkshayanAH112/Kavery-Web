import { PLAYER_ROLES, type PlayerRole } from './engine';
import { isObjectId, text } from './server';

const HEX = /^#[0-9a-f]{6}$/i;
const MAX_PLAYERS = 40;

export interface TeamInput {
  name: string;
  shortName: string;
  color: string | undefined;
  players?: { _id?: string; name: string; role: PlayerRole; isCaptain: boolean; isKeeper: boolean }[];
}

/**
 * Validates a team form body. Returns the cleaned input, or a message for the
 * admin. `players` is only present when the body carried one, so a rename does
 * not have to resend the whole squad.
 */
export function parseTeamInput(data: any): TeamInput | string {
  const name = text(data?.name, 60);
  if (!name) return 'Team name is required';

  const color = text(data?.color, 7);
  if (color && !HEX.test(color)) return 'Colour must be a hex value like #720000';

  const input: TeamInput = {
    name,
    shortName: text(data?.shortName, 5).toUpperCase(),
    color: color || undefined,
  };

  if (data?.players !== undefined) {
    if (!Array.isArray(data.players)) return 'players must be a list';
    if (data.players.length > MAX_PLAYERS) return `A team can have at most ${MAX_PLAYERS} players`;
    const players: NonNullable<TeamInput['players']> = [];
    for (const p of data.players) {
      const playerName = text(p?.name, 60);
      if (!playerName) return 'Every player needs a name';
      players.push({
        ...(isObjectId(p?._id) ? { _id: p._id } : {}),
        name: playerName,
        role: PLAYER_ROLES.includes(p?.role) ? p.role : 'batter',
        isCaptain: !!p?.isCaptain,
        isKeeper: !!p?.isKeeper,
      });
    }
    input.players = players;
  }

  return input;
}
