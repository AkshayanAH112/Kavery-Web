import type { ReactNode } from "react";
import { Reveal } from "@/components/site/motion";
import { siteImageUrl, type Officer, type Sponsor } from "@/lib/site-settings";

/**
 * The committees and sponsors, as the home and About pages show them. Everything comes from
 * Site details; nothing here is invented, and an empty list renders nothing at all.
 */

/** The role in the page's language, or the other language when only that one was entered. */
const roleOf = (officer: Officer, locale: string) => (locale === "ta" ? officer.role.ta || officer.role.en : officer.role.en || officer.role.ta);

/** A photo, or the person's initial on a plain tile when there is none. */
function Portrait({ officer, className = "", initialClass = "text-6xl" }: { officer: Officer; className?: string; initialClass?: string }) {
  return (
    <div className={`overflow-hidden rounded-(--card-radius) bg-surface-2 ${className}`}>
      {officer.photoKey ? (
        // eslint-disable-next-line @next/next/no-img-element -- already resized before upload
        <img src={siteImageUrl(officer.photoKey)} alt={officer.name} loading="lazy" decoding="async" className="size-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
      ) : (
        <span aria-hidden className={`display flex size-full items-center justify-center text-muted-foreground ${initialClass}`}>
          {officer.name.trim().charAt(0)}
        </span>
      )}
    </div>
  );
}

/** The committee as photo cards: square photo, name, role. */
export function CommitteeGrid({ people, locale, compact = false, className = "" }: { people: Officer[]; locale: string; compact?: boolean; className?: string }) {
  if (people.length === 0) return null;
  // Compact is for a narrow column (the About page): never more than three across.
  const columns = compact ? "grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3" : "grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 md:gap-x-8 lg:grid-cols-4";
  return (
    <ul className={`grid ${columns} ${className}`}>
      {people.map((person, i) => (
        <li key={i} className="group min-w-0">
          {/* Each arrives a beat after the one to its left. */}
          <Reveal delay={(i % 4) * 0.07}>
            <Portrait officer={person} className="aspect-[4/5]" />
            <p className="mt-4 text-lg font-semibold leading-snug text-fg md:text-xl">{person.name}</p>
            <p className="mt-0.5 text-sm font-semibold text-brand-text">{roleOf(person, locale)}</p>
          </Reveal>
        </li>
      ))}
    </ul>
  );
}

export type Fact = { label: string; value: string | number };

/**
 * A committee led by its first member, the way a school site shows its principal: a large
 * portrait with the organisation's facts ruled off beside it, then everyone else in a grid.
 * "First" is the order an administrator set under Site details.
 */
export function Committee({ people, locale, facts, children }: { people: Officer[]; locale: string; facts: Fact[]; children?: ReactNode }) {
  const [lead, ...rest] = people;
  if (!lead) return null;
  return (
    <>
      <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
        <Reveal className="group lg:col-span-5">
          {/* The offset block is the brand colour of whichever theme it sits in: red for the club, blue for KEDA. */}
          <div className="mx-auto max-w-md pb-3 pr-3 lg:max-w-none">
            <Portrait officer={lead} className="aspect-[4/5] shadow-[0.75rem_0.75rem_0_var(--brand)]" initialClass="text-[10rem]" />
          </div>
        </Reveal>
        <Reveal delay={0.08} className="min-w-0 lg:col-span-7">
          <p className="eyebrow text-brand-text">{roleOf(lead, locale)}</p>
          <h3 className="display mt-4 text-5xl text-balance sm:text-6xl lg:text-7xl">{lead.name}</h3>
          {facts.length > 0 && (
            <dl className="mt-8 border-t border-line">
              {facts.map((fact) => (
                <div key={fact.label} className="grid gap-x-6 gap-y-0.5 border-b border-line py-3.5 sm:grid-cols-[13rem_1fr]">
                  <dt className="text-sm text-muted-foreground sm:self-center">{fact.label}</dt>
                  <dd className="text-lg font-bold text-fg tabular-nums">{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {children}
        </Reveal>
      </div>
      <CommitteeGrid people={rest} locale={locale} className="mt-14 md:mt-20" />
    </>
  );
}

/** Sponsors' logos on white tiles (logos are drawn for a light ground), each a link when the sponsor gave one. */
export function SponsorWall({ sponsors, className = "" }: { sponsors: Sponsor[]; className?: string }) {
  if (sponsors.length === 0) return null;
  return (
    <ul className={`grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 ${className}`}>
      {sponsors.map((sponsor, i) => {
        const tile = (
          <>
            <span className="flex aspect-[3/2] items-center justify-center rounded-(--card-radius) bg-white p-5 transition-transform duration-300 group-hover:-translate-y-0.5">
              {sponsor.logoKey ? (
                // eslint-disable-next-line @next/next/no-img-element -- already resized before upload
                <img src={siteImageUrl(sponsor.logoKey)} alt={sponsor.name} loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-center text-lg font-bold text-ink">{sponsor.name}</span>
              )}
            </span>
            {/* Without a logo the tile already carries the name. */}
            {sponsor.logoKey && <span className="mt-3 block font-semibold text-fg">{sponsor.name}</span>}
          </>
        );
        return (
          <li key={i} className="min-w-0">
            <Reveal delay={(i % 4) * 0.06}>
              {sponsor.url ? (
                <a href={sponsor.url} target="_blank" rel="noopener noreferrer" className="group block cursor-pointer transition-opacity hover:opacity-90">
                  {tile}
                </a>
              ) : (
                <div className="group">{tile}</div>
              )}
            </Reveal>
          </li>
        );
      })}
    </ul>
  );
}
