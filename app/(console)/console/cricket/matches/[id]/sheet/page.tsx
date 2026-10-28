import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScoreSheet } from "@/components/cricket/score-sheet";
import { SheetStack, SheetToolbar } from "@/components/cricket/sheet-toolbar";
import { resultText } from "@/components/cricket/format";
import { requireSession } from "@/lib/auth/guard";
import { adminMatchView, getMatch } from "@/lib/cricket/server";
import { sheetInnings } from "@/lib/cricket/sheet";
import { TIME_ZONE } from "@/lib/dates";

export const metadata: Metadata = { title: "Score sheet" };

const ORDINAL = ["1st", "2nd", "3rd", "4th"];

export default async function MatchSheetPage({ params }: PageProps<"/console/cricket/matches/[id]/sheet">) {
  await requireSession("cricket.score");
  const { id } = await params;
  const doc = await getMatch(id);
  if (!doc) notFound();
  const match = await adminMatchView(doc);

  const team = (teamId: string) => (teamId === match.teamA.id ? match.teamA : match.teamB);
  const name = (pid?: string | null) => (pid && match.players[pid]?.name) || "";
  const toss = match.toss ? `${team(match.toss.wonBy).name} won the toss and chose to ${match.toss.decision}` : null;
  const context = [match.tournament?.name ?? "Friendly", match.title, `${match.oversPerInnings} overs a side`, toss].filter(Boolean).join(", ");
  // Rendered on the server, which runs in UTC: the ground's time zone is explicit.
  const date = match.startAt
    ? new Date(match.startAt).toLocaleDateString("en-GB", { timeZone: TIME_ZONE, day: "numeric", month: "short", year: "numeric" })
    : "";
  const result = resultText(match) ?? "";

  return (
    <div>
      <SheetToolbar
        back={`/console/cricket/matches/${id}`}
        backLabel="Back to scoring"
        note={match.innings.length ? "A4 landscape, one page per innings" : "No innings yet: this prints a blank sheet with the match details"}
      />
      <SheetStack>
        {(match.innings.length ? match.innings : [null]).map((inn, i) => (
          <ScoreSheet
            key={i}
            header={{
              home: match.teamA.name,
              visitor: match.teamB.name,
              inningsOf: inn ? `${team(inn.battingTeam).name} (${ORDINAL[i] ?? i + 1})` : "",
              playedAt: match.venue ?? "",
              date,
              context,
              result,
            }}
            innings={inn ? sheetInnings(doc.innings[i].balls, inn) : null}
            closed={inn?.isClosed}
            name={name}
            oversPerInnings={match.oversPerInnings}
          />
        ))}
      </SheetStack>
    </div>
  );
}
