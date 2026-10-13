// Demo cricket data, played through the real scoring API so every total has deliveries behind it:
// one live friendly, plus a published one-over tournament with a finished match.
//   npm run db:demo:cricket          (needs `npm run dev` running; local only)
//   npm run db:demo:cricket:clear
// Prints JSON: { live, finished, slug, team, player }
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";

const [mode, BASE = "http://localhost:3000"] = process.argv.slice(2);
// Remembers what was created so `remove` deletes exactly that and nothing else.
const STATE = new URL("../.wrangler/demo-cricket.json", import.meta.url);
const vars = Object.fromEntries(readFileSync(".dev.vars", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));

let cookie = "";
const call = async (method, path, body) => {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
};
await call("POST", "/api/auth/login", { email: vars.SEED_ADMIN_EMAIL, password: vars.SEED_ADMIN_PASSWORD });

if (mode === "remove") {
  if (!existsSync(STATE)) process.exit(0);
  const s = JSON.parse(readFileSync(STATE, "utf8"));
  for (const m of s.matches) await call("DELETE", `/api/cricket/matches/${m}`).catch(() => {});
  if (s.tournament) await call("DELETE", `/api/cricket/tournaments/${s.tournament}`).catch(() => {});
  for (const t of s.teams) await call("DELETE", `/api/cricket/teams/${t}`).catch(() => {});
  rmSync(STATE);
  console.log("removed");
  process.exit(0);
}

const state = { matches: [], teams: [], tournament: null };
const save = () => writeFileSync(STATE, JSON.stringify(state));

const squad = (prefix) => Array.from({ length: 11 }, (_, i) => ({ name: `${prefix} Player ${i + 1}`, role: i === 10 ? "bowler" : i === 6 ? "wicket_keeper" : i > 6 ? "all_rounder" : "batter", isCaptain: i === 0, isKeeper: i === 6 }));
const A = (await call("POST", "/api/cricket/teams", { name: "Demo Kavery XI", shortName: "KSC", color: "#E00000", players: squad("Kavery") })).team;
state.teams.push(A._id); save();
const B = (await call("POST", "/api/cricket/teams", { name: "Demo Visitors XI", shortName: "VIS", color: "#003C9C", players: squad("Visitor") })).team;
state.teams.push(B._id); save();

const scorer = (id) => {
  let rev = 0;
  return async (action) => { rev = (await call("POST", `/api/cricket/matches/${id}/score`, { rev, action })).match.rev; };
};

// 1. A live friendly, a couple of overs in.
const live = (await call("POST", "/api/cricket/matches", { teamA: A._id, teamB: B._id, oversPerInnings: 20, title: "Demo friendly", venue: "Demo ground" })).match.id;
state.matches.push(live); save();
let score = scorer(live);
await score({ type: "start_innings", toss: { wonBy: A._id, decision: "bat" } });
await score({ type: "set_players", striker: A.players[0]._id, nonStriker: A.players[1]._id, bowler: B.players[10]._id });
for (const b of [{ runs: 1 }, { runs: 4 }, { runs: 0 }, { runs: 0, extraType: "wd" }, { runs: 0, wicket: { kind: "bowled" } }]) await score({ type: "ball", ...b });
// The engine (rightly) refuses the next ball until the new batter is in.
await score({ type: "set_players", striker: A.players[2]._id });
for (const b of [{ runs: 6 }, { runs: 2 }]) await score({ type: "ball", ...b });
await score({ type: "set_players", bowler: B.players[9]._id });
for (const b of [{ runs: 1 }, { runs: 1 }, { runs: 4 }]) await score({ type: "ball", ...b });

// 2. A published one-over tournament with one finished match, for the points table and player stats.
const tour = (await call("POST", "/api/cricket/tournaments", { name: "Demo Cup", season: "2026", oversPerInnings: 1, teams: [A._id, B._id] })).tournament;
state.tournament = tour._id; save();
await call("PATCH", `/api/cricket/tournaments/${tour._id}`, { isPublished: true });
const finished = (await call("POST", "/api/cricket/matches", { teamA: A._id, teamB: B._id, tournamentId: tour._id, title: "Match 1" })).match.id;
state.matches.push(finished); save();
score = scorer(finished);
await score({ type: "start_innings", toss: { wonBy: B._id, decision: "bat" } });
await score({ type: "set_players", striker: B.players[0]._id, nonStriker: B.players[1]._id, bowler: A.players[10]._id });
for (const runs of [1, 2, 0, 4, 1, 1]) await score({ type: "ball", runs });
await score({ type: "start_innings" });
await score({ type: "set_players", striker: A.players[0]._id, nonStriker: A.players[1]._id, bowler: B.players[10]._id });
for (const runs of [4, 6]) await score({ type: "ball", runs });
await call("PATCH", `/api/cricket/matches/${finished}`, { playerOfMatch: A.players[0]._id });

console.log(JSON.stringify({ live, finished, slug: tour.slug, team: A._id, player: A.players[0]._id }));
