import type { Metadata } from "next";
import { ScoreSheet } from "@/components/cricket/score-sheet";
import { SheetStack, SheetToolbar } from "@/components/cricket/sheet-toolbar";
import { requireSession } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Blank score sheet" };

/** The form with nothing filled in, for a match scored on paper. */
export default async function BlankSheetPage() {
  await requireSession("cricket.score");
  return (
    <div>
      <SheetToolbar back="/console/cricket" backLabel="Back to cricket" note="A4 landscape" />
      <SheetStack>
        <ScoreSheet oversPerInnings={50} />
      </SheetStack>
    </div>
  );
}
