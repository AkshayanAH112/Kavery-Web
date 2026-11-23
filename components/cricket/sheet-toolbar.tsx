"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

/** Back link and Print, above the sheets; hidden on the printout itself. */
export function SheetToolbar({ back, backLabel, note }: { back: string; backLabel: string; note: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
      <Link href={back} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} aria-hidden /> {backLabel}
      </Link>
      <div className="flex items-center gap-3">
        <p className="hidden text-xs text-muted-foreground sm:block">{note}</p>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Printer size={16} aria-hidden /> Print
        </button>
      </div>
    </div>
  );
}

/** The sheets at paper size: they scroll sideways on a phone rather than shrinking past legibility. */
export function SheetStack({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <div className="flex w-max flex-col gap-6 print:block print:gap-0">{children}</div>
    </div>
  );
}
