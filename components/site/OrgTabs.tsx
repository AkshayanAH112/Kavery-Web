import Link from "next/link";

/** All / Club / KEDA — the same news and gallery pages, narrowed to one of the two organisations. */
export function OrgTabs({ base, current, labels }: { base: string; current?: "ksc" | "keda"; labels: { all: string; ksc: string; keda: string } }) {
  const tabs = [
    { key: undefined, href: base, label: labels.all },
    { key: "ksc" as const, href: `${base}?org=ksc`, label: labels.ksc },
    { key: "keda" as const, href: `${base}?org=keda`, label: labels.keda },
  ];
  return (
    <nav aria-label={labels.all} className="mb-8 flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <Link
          key={tab.label}
          href={tab.href}
          aria-current={tab.key === current ? "page" : undefined}
          className={`inline-flex min-h-11 items-center rounded-full border px-5 text-[0.9375rem] font-semibold transition-colors ${tab.key === current ? "border-accent bg-accent text-on-accent" : "border-line text-muted-foreground hover:text-fg"}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
