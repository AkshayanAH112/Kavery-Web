import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

type Crumb = { label: string; href?: string };

/** The frame for the public site's inner pages: breadcrumb, eyebrow, title, lead, and actions (a share button) under them. */
export function PageShell({ crumbs, eyebrow, title, lead, actions, children, narrow }: { crumbs: Crumb[]; eyebrow?: string; title: string; lead?: string; actions?: ReactNode; children: ReactNode; narrow?: boolean }) {
  return (
    <div className="min-h-screen pb-24 pt-[calc(var(--nav-h)+2rem)]">
      <div className={`container-x ${narrow ? "max-w-[52rem]" : ""}`}>
        <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap items-center gap-2 text-sm font-semibold text-muted-foreground">
          {crumbs.map((crumb, i) => (
            <span key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-2">
              {i > 0 && <ChevronRight size={14} aria-hidden className="shrink-0" />}
              {crumb.href ? (
                <Link href={crumb.href} className="inline-flex min-h-11 items-center transition-colors hover:text-fg">
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current="page" className="truncate text-accent">
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
        <header className="mb-10">
          {eyebrow && <p className="eyebrow text-brand-text">{eyebrow}</p>}
          <h1 className="display h-section mt-4">{title}</h1>
          {lead && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">{lead}</p>}
          {actions && <div className="mt-6 flex flex-wrap items-center gap-3">{actions}</div>}
        </header>
        {children}
      </div>
    </div>
  );
}

/** `<ShareButton>`'s strings, from the page's translator. */
export function shareLabels(t: (key: "share.button" | "share.menu" | "share.copy" | "share.copied") => string) {
  return { share: t("share.button"), menu: t("share.menu"), copy: t("share.copy"), copied: t("share.copied") };
}

export function formatDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale === "ta" ? "ta-LK" : "en-GB", { timeZone: "Asia/Colombo", day: "numeric", month: "long", year: "numeric" }).format(date);
}
