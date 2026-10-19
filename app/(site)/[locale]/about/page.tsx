import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ContactPeople } from "@/components/site/ContactPeople";
import { PageShell } from "@/components/site/PageShell";
import { getContentPresence } from "@/lib/content/public";
import { CLUB, getAboutStats, getSettings } from "@/lib/site";
import { paragraphs, siteImageUrl, type Bilingual, type Officer, type Sponsor } from "@/lib/site-settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/about">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  const title = `${t("about.eyebrow")} | ${t("hero.line1")} ${t("hero.line2")}`;
  const description = t("club.p1");
  const ogImage = locale === "ta" ? "/brand/og-image-ta.png" : "/brand/og-image-en.png";

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/about`,
      languages: { en: "/en/about", ta: "/ta/about", "x-default": "/en/about" },
    },
    openGraph: {
      title,
      description,
      url: `/${locale}/about`,
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

/** A committee, as photo cards. Someone without a photo gets their initial instead. */
function Committee({ title, people, locale, headingClass = "text-accent" }: { title: string; people: Officer[]; locale: string; headingClass?: string }) {
  if (people.length === 0) return null;
  return (
    <div className="mt-10">
      <h3 className={`eyebrow ${headingClass}`}>{title}</h3>
      <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {people.map((p, i) => {
          const role = locale === "ta" ? p.role.ta || p.role.en : p.role.en || p.role.ta;
          return (
            <li key={i} className="min-w-0">
              <div className="aspect-[4/5] overflow-hidden rounded-[var(--card-radius)] bg-surface-2">
                {p.photoKey ? (
                  // eslint-disable-next-line @next/next/no-img-element -- already resized before upload
                  <img src={siteImageUrl(p.photoKey)} alt={p.name} loading="lazy" className="size-full object-cover" />
                ) : (
                  <span aria-hidden className="display flex size-full items-center justify-center text-6xl text-muted-foreground">
                    {p.name.trim().charAt(0)}
                  </span>
                )}
              </div>
              <p className="mt-3 font-semibold leading-snug text-fg">{p.name}</p>
              <p className="text-sm text-muted-foreground">{role}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Sponsors' logos on white tiles (logos are drawn for a light ground), each a link when the sponsor gave one. */
function Sponsors({ title, lead, sponsors }: { title: string; lead: string; sponsors: Sponsor[] }) {
  if (sponsors.length === 0) return null;
  return (
    <section id="sponsors" className="mt-20 scroll-mt-[calc(var(--nav-h)+1rem)]">
      <h2 className="display h-section">{title}</h2>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">{lead}</p>
      <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {sponsors.map((x, i) => {
          const tile = (
            <>
              <span className="flex aspect-[3/2] items-center justify-center rounded-[var(--card-radius)] bg-white p-4">
                {x.logoKey ? (
                  // eslint-disable-next-line @next/next/no-img-element -- already resized before upload
                  <img src={siteImageUrl(x.logoKey)} alt={x.name} loading="lazy" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-center text-lg font-bold text-ink">{x.name}</span>
                )}
              </span>
              <span className="mt-3 block font-semibold text-fg">{x.name}</span>
            </>
          );
          return (
            <li key={i} className="min-w-0">
              {x.url ? (
                <a href={x.url} target="_blank" rel="noopener noreferrer" className="group block transition-opacity hover:opacity-85">
                  {tile}
                </a>
              ) : (
                tile
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-t border-line py-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-bold text-fg">{value}</dd>
    </div>
  );
}

/**
 * Who the club and KEDA are. The words, the committees, the sponsors and the contact lines
 * are whatever an administrator entered under Site details; where they have
 * entered nothing, the page falls back to the short standard wording or leaves
 * the line out. Nothing here is made up by the page.
 */
export default async function AboutPage({ params }: PageProps<"/[locale]/about">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, settings, stats, has] = await Promise.all([getTranslations(), getSettings(), getAboutStats(), getContentPresence()]);
  const base = `/${locale}`;
  // An administrator who has only written one language is still better served by it than by nothing.
  const pick = (text: Bilingual) => (locale === "ta" ? text.ta || text.en : text.en || text.ta);
  const clubText = paragraphs(pick(settings.aboutClub));
  const kedaText = paragraphs(pick(settings.aboutKeda));
  const classInfo = pick(settings.classInfo);
  const grades = settings.kedaGrades.join(locale === "ta" ? ", " : " and ");

  return (
    <PageShell crumbs={[{ label: t("nav.home"), href: base }, { label: t("about.eyebrow") }]} eyebrow={t("about.eyebrow")} title={`${t("hero.line1")} ${t("hero.line2")}`} lead={t("hero.eyebrow")}>
      <section id="club" className="grid gap-12 lg:grid-cols-[1.3fr_0.7fr] lg:gap-16">
        <div className="min-w-0">
          <div className="max-w-2xl space-y-5 text-lg leading-relaxed text-muted-foreground">{(clubText.length ? clubText : [t("club.p1"), t("club.p2")]).map((p, i) => <p key={i}>{p}</p>)}</div>
          <Committee title={t("about.officers")} people={settings.officers.filter((o) => o.org === "ksc")} locale={locale} />
          <a href={`${base}/membership`} className="btn btn-brand mt-10">
            <span>{t("club.join")}</span>
          </a>
        </div>
        <aside className="live-card self-start p-6 md:p-8">
          <Image src="/brand/ksc-crest.webp" alt="Kavery Sports Club crest" width={900} height={890} className="mx-auto h-auto w-40" />
          <dl className="mt-6">
            <Fact label={t("about.founded")} value={CLUB.founded} />
            <Fact label={t("stats.years")} value={stats.years} />
            {stats.members > 0 && <Fact label={t("stats.members")} value={stats.members} />}
          </dl>
        </aside>
      </section>

      {/* KEDA keeps its own daylight colours here, as it does on the home page. */}
      <section id="keda" className="theme-keda mt-20 scroll-mt-[calc(var(--nav-h)+1rem)] rounded-[var(--card-radius)] bg-bg p-6 text-fg md:p-12">
        <div className="grid gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
          <aside className="self-start">
            <div className="rounded-2xl bg-white p-5 ring-1 ring-line">
              <Image src="/brand/keda-logo.webp" alt={CLUB.keda.name} width={640} height={674} className="mx-auto h-auto w-full max-w-56" />
            </div>
            <dl className="mt-6">
              <Fact label={t("about.founded")} value={CLUB.keda.founded} />
              <Fact label={t("about.grades")} value={grades} />
              {stats.students > 0 && <Fact label={t("stats.students")} value={stats.students} />}
            </dl>
          </aside>
          <div className="min-w-0">
            <p className="eyebrow text-brand-text">{t("keda.eyebrow")}</p>
            <h2 className="display h-section mt-4 text-brand">{t("keda.title")}</h2>
            <div className="mt-6 max-w-2xl space-y-5 text-lg leading-relaxed text-muted-foreground">{(kedaText.length ? kedaText : [t("keda.lead", { grades })]).map((p, i) => <p key={i}>{p}</p>)}</div>
            {classInfo && (
              <div className="mt-8 border-l-4 border-brand pl-5">
                <h3 className="eyebrow text-brand-text">{t("about.classes")}</h3>
                <p className="mt-2 whitespace-pre-line text-lg font-semibold text-fg">{classInfo}</p>
              </div>
            )}
            <Committee title={t("about.officers")} people={settings.officers.filter((o) => o.org === "keda")} locale={locale} headingClass="text-brand-text" />
            <div className="mt-10 flex flex-wrap gap-x-5 gap-y-4 pl-1">
              <a href={`${base}/parents`} className="btn btn-brand">
                <span>{t("keda.results")}</span>
              </a>
              {has.news && (
                <a href={`${base}/news?org=keda`} className="btn btn-ghost">
                  <span>{t("about.kedaNews")}</span>
                </a>
              )}
              {has.gallery && (
                <a href={`${base}/gallery?org=keda`} className="btn btn-ghost">
                  <span>{t("about.kedaGallery")}</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <Sponsors title={t("about.sponsors")} lead={t("about.sponsorsLead")} sponsors={settings.sponsors} />

      <section id="contact" className="mt-20 scroll-mt-[calc(var(--nav-h)+1rem)]">
        <h2 className="display h-section">{t("footer.contact")}</h2>
        <dl className="mt-8 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-4">
          {settings.address && <Fact label={t("about.address")} value={settings.address} />}
          {settings.contactPhone && (
            <div className="border-t border-line py-4">
              <dt className="text-sm text-muted-foreground">{t("about.phone")}</dt>
              <dd className="mt-1 text-xl font-bold">
                <a href={`tel:${settings.contactPhone.replace(/\s/g, "")}`} className="hover:text-accent">
                  {settings.contactPhone}
                </a>
              </dd>
            </div>
          )}
          {settings.contactEmail && (
            <div className="border-t border-line py-4">
              <dt className="text-sm text-muted-foreground">{t("about.email")}</dt>
              <dd className="mt-1 break-all text-xl font-bold">
                <a href={`mailto:${settings.contactEmail}`} className="hover:text-accent">
                  {settings.contactEmail}
                </a>
              </dd>
            </div>
          )}
          {settings.facebookUrl && (
            <div className="border-t border-line py-4">
              <dt className="text-sm text-muted-foreground">Facebook</dt>
              <dd className="mt-1 text-xl font-bold">
                <a href={settings.facebookUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                  {t("about.facebook")}
                </a>
              </dd>
            </div>
          )}
        </dl>
        {settings.contacts.length > 0 && (
          <div className="mt-10 grid gap-10 md:grid-cols-2">
            <ContactPeople title={t("about.contactClub")} people={settings.contacts.filter((c) => c.org === "ksc")} whatsapp={t("about.whatsapp")} />
            <ContactPeople title={t("about.contactKeda")} people={settings.contacts.filter((c) => c.org === "keda")} whatsapp={t("about.whatsapp")} />
          </div>
        )}
      </section>
    </PageShell>
  );
}
