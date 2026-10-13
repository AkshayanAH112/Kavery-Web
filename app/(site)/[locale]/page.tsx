import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, BookOpenCheck, ClipboardCheck, HandCoins } from "lucide-react";
import { AppPanel } from "@/components/pwa/AppPanel";
import { ExpandShowcase } from "@/components/site/ExpandShowcase";
import { Hero } from "@/components/site/Hero";
import { LiveRefresh } from "@/components/site/LiveRefresh";
import { MatchCard, StatusChip, formatMatchTime, overs, resultLine } from "@/components/site/MatchCard";
import { CountUp, Parallax, Reveal } from "@/components/site/motion";
import { formatDate } from "@/components/site/PageShell";
import { isLocale } from "@/i18n/config";
import { getAlbums } from "@/lib/content/public";
import { getSecret } from "@/lib/db";
import { CLUB, getHomeData, getSettings } from "@/lib/site";

/** How many tiles a showcase row holds. More than five and the closed ones get too thin to read. */
const SHOWCASE_SIZE = 5;

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const [t, data, settings, allAlbums] = await Promise.all([getTranslations(), getHomeData(), getSettings(), getAlbums()]);
  const albums = allAlbums.slice(0, SHOWCASE_SIZE);
  const base = `/${locale}`;
  const featured = data.featured;
  const featuredLabel = !featured ? null : featured.status === "upcoming" ? t("ticker.next") : featured.status === "completed" ? t("ticker.last") : t("ticker.live");
  const featuredNote = featured ? ((await resultLine(featured)) ?? (featured.startAt ? formatMatchTime(featured.startAt, locale) : t("matches.tbc"))) : null;
  const board = [...data.live, ...data.upcoming, ...data.recent];
  const marquee = t.raw("marquee") as string[];
  const stats = [
    { value: data.stats.years, label: t("stats.years") },
    { value: data.stats.members, label: t("stats.members") },
    { value: data.stats.students, label: t("stats.students") },
    { value: data.stats.matchesScored, label: t("stats.matches") },
  ].filter((s) => s.value > 0);

  return (
    <>
      <LiveRefresh live={data.live.length > 0} />
      <Hero
        eyebrow={t("hero.eyebrow")}
        line1={t("hero.line1")}
        line2={t("hero.line2")}
        lead={t("hero.lead")}
        founded={CLUB.founded}
        actions={
          <>
            <a href={`${base}#matches`} className="btn btn-brand">
              <span>
                {t("hero.ctaMatches")} <ArrowRight aria-hidden className="h-5 w-5" />
              </span>
            </a>
            <a href={`${base}#education`} className="btn btn-ghost">
              <span>{t("hero.ctaEducation")}</span>
            </a>
          </>
        }
      >
        {/* Ticker: the one live, next or latest match, straight from the scoring database. */}
        <a href={featured ? `${base}/live/match/${featured.id}` : `${base}#matches`} className="group block border-t border-line bg-surface/85 backdrop-blur-md transition-colors hover:bg-surface">
          <div className="container-x flex min-h-20 flex-wrap items-center gap-x-8 gap-y-2 py-4">
            {featured ? (
              <>
                <span className="flex items-center gap-3">
                  <StatusChip status={featured.status} />
                  <span className="eyebrow text-muted-foreground">{featuredLabel}</span>
                </span>
                <span className="flex flex-1 flex-wrap items-baseline gap-x-5 gap-y-1">
                  {featured.sides.map((side, i) => (
                    <span key={side.id} className="flex items-baseline gap-2.5">
                      {i === 1 && <span className="mr-2.5 text-sm text-muted-foreground">{t("ticker.vs")}</span>}
                      <span className="display text-2xl">{side.name}</span>
                      {side.score && (
                        <span className="display text-2xl text-accent tabular-nums">
                          {side.score.runs}/{side.score.wickets}
                          <span className="ml-1.5 font-sans text-sm font-normal normal-case text-muted-foreground">{t("ticker.overs", { overs: overs(side.score.balls) })}</span>
                        </span>
                      )}
                    </span>
                  ))}
                </span>
                <span className="text-sm text-muted-foreground">{featuredNote}</span>
              </>
            ) : (
              <p className="flex-1 text-muted-foreground">{t("ticker.empty")}</p>
            )}
            <ArrowRight aria-hidden className="h-5 w-5 text-accent transition-transform group-hover:translate-x-1" />
          </div>
        </a>
      </Hero>

      {/* Marquee — decorative repetition, so it is hidden from assistive tech. */}
      <div aria-hidden className="overflow-hidden bg-accent py-3 text-on-accent">
        <div className="marquee-track flex w-max">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0">
              {[...marquee, ...marquee].map((word, i) => (
                <span key={i} className="display flex items-center whitespace-nowrap text-2xl">
                  <span className="px-6">{word}</span>
                  <span className="h-2 w-2 rotate-45 bg-on-accent" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {stats.length > 0 && (
        <section className="border-b border-line">
          <dl className="container-x grid grid-cols-2 lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none">
            {stats.map((stat, i) => (
              <Reveal key={stat.label} delay={i * 0.08} className="border-line py-10 odd:border-r lg:border-r lg:px-8 lg:first:pl-0 lg:last:border-r-0">
                <dt className="sr-only">{stat.label}</dt>
                <dd>
                  <CountUp value={stat.value} className="display block text-7xl lg:text-8xl" />
                  <span className="mt-2 block text-[0.9375rem] text-muted-foreground" aria-hidden>
                    {stat.label}
                  </span>
                </dd>
              </Reveal>
            ))}
          </dl>
        </section>
      )}

      {/* Match centre */}
      <section id="matches" className="py-[var(--section-y)]">
        <div className="container-x">
          <Reveal className="max-w-3xl">
            <p className="eyebrow text-brand-text">{t("matches.eyebrow")}</p>
            <h2 className="display mt-4 h-section">{t("matches.title")}</h2>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">{t("matches.lead")}</p>
          </Reveal>

          {board.length > 0 ? (
            <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {board.map((match, i) => (
                <Reveal key={match.id} delay={Math.min(i, 5) * 0.06}>
                  <MatchCard match={match} locale={locale} />
                </Reveal>
              ))}
            </div>
          ) : (
            <Reveal className="mt-12">
              <div className="relative overflow-hidden rounded-[var(--card-radius)] border border-line bg-surface p-8 sm:p-12">
                <svg aria-hidden viewBox="0 0 200 200" className="absolute -right-10 -top-10 h-56 w-56 text-brand opacity-70">
                  <circle cx="100" cy="100" r="92" fill="currentColor" />
                  <path d="M38 28c34 44 34 100 0 144M162 28c-34 44-34 100 0 144" fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" />
                </svg>
                <h3 className="display relative text-3xl sm:text-4xl">{t("matches.emptyTitle")}</h3>
                <p className="relative mt-4 max-w-xl leading-relaxed text-muted-foreground">{t("matches.emptyBody")}</p>
                <a href={`${base}#app`} className="btn btn-accent relative mt-8">
                  <span>{t("app.enable")}</span>
                </a>
              </div>
            </Reveal>
          )}

          {board.length > 0 && (
            <div className="mt-10 pl-1">
              <a href={`${base}/live`} className="btn btn-ghost">
                <span>
                  {t("matches.all")} <ArrowRight aria-hidden className="h-5 w-5" />
                </span>
              </a>
            </div>
          )}
        </div>
      </section>

      {/* The club */}
      <section id="club" className="relative overflow-hidden border-t border-line py-[var(--section-y)]">
        <Parallax distance={160} className="pointer-events-none absolute -right-[6vw] top-10 hidden select-none lg:block">
          <Image src="/brand/ksc-crest.webp" alt="Kavery Sports Club crest" width={900} height={890} className="h-auto w-[36vw] max-w-[34rem] opacity-[0.07] grayscale" />
        </Parallax>
        <div className="container-x relative grid gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
          <Reveal className="min-w-0">
            <p className="eyebrow text-brand-text">{t("club.eyebrow")}</p>
            <h2 className="display mt-4 h-section">{t("club.title", { years: data.stats.years })}</h2>
            <div className="mt-8 max-w-xl space-y-5 text-lg leading-relaxed text-muted-foreground">
              <p>{t("club.p1")}</p>
              <p>{t("club.p2")}</p>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-5 gap-y-4 pl-1">
              <a href={`${base}/membership`} className="btn btn-brand">
                <span>{t("club.join")}</span>
              </a>
              <a href={`${base}/about`} className="btn btn-ghost">
                <span>{t("club.more")}</span>
              </a>
            </div>
          </Reveal>
          <div className="self-end">
            {[1, 2, 3].map((n) => (
              <Reveal key={n} delay={n * 0.08}>
                <div className="flex flex-col gap-3 border-t border-line py-6 sm:py-7">
                  <span className="display text-3xl text-accent sm:text-4xl lg:text-5xl">{t(`club.pillar${n}Title`)}</span>
                  <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">{t(`club.pillar${n}Body`)}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* KEDA — its own daylight theme, cut in on the crest's diagonal. */}
      <section id="education" className="theme-keda relative bg-bg text-fg [clip-path:polygon(0_5vw,100%_0,100%_100%,0_100%)]">
        <div className="container-x grid gap-14 pb-[var(--section-y)] pt-[calc(var(--section-y)+5vw)] lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <Parallax distance={90} className="mx-auto w-full max-w-xs self-center lg:max-w-sm">
            <div className="-rotate-3 rounded-2xl bg-white p-6 shadow-[0_30px_70px_-20px_rgb(7_27_69/0.45)] ring-1 ring-line">
              <Image src="/brand/keda-logo.webp" alt={CLUB.keda.name} width={640} height={674} className="h-auto w-full" />
            </div>
          </Parallax>

          <div className="min-w-0">
            <Reveal>
              <p className="eyebrow text-brand-text">{t("keda.eyebrow")}</p>
              <h2 className="display h-section mt-4 text-brand">{t("keda.title")}</h2>
              <p className="mt-5 inline-block bg-accent px-3 py-1.5 text-lg font-semibold text-on-accent" lang="ta">
                நற்கல்வி – அறிவுசார் சமுதாயம்
                {locale !== "ta" && (
                  <span lang={locale} className="font-normal">
                    {" "}
                    · {t("keda.motto")}
                  </span>
                )}
              </p>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">{t("keda.lead", { grades: settings.kedaGrades.join(locale === "ta" ? ", " : " and ") })}</p>
            </Reveal>

            <ul className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-3">
              {[HandCoins, ClipboardCheck, BookOpenCheck].map((Icon, i) => (
                <li key={i}>
                  <Reveal delay={i * 0.08}>
                    <Icon aria-hidden className="h-8 w-8 text-brand" strokeWidth={1.75} />
                    <h3 className="mt-4 text-xl font-bold">{t(`keda.point${i + 1}Title`)}</h3>
                    <p className="mt-2 leading-relaxed text-muted-foreground">{t(`keda.point${i + 1}Body`)}</p>
                  </Reveal>
                </li>
              ))}
            </ul>

            <div className="mt-10 flex flex-wrap gap-x-5 gap-y-4 pl-1">
              <a href={`${base}/parents`} className="btn btn-brand">
                <span>{t("keda.results")}</span>
              </a>
              <a href={`${base}/about#keda`} className="btn btn-ghost">
                <span>{t("keda.more")}</span>
              </a>
              <a href={`${base}#app`} className="btn btn-ghost">
                <span>{t("keda.alerts")}</span>
              </a>
              {settings.contactEmail && (
                <a href={`mailto:${settings.contactEmail}`} className="btn btn-ghost">
                  <span>{t("keda.contact")}</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* News and gallery are always on the page: with something in them they are the showcase rows, without they say what will appear. */}
      <section id="news" className="py-[var(--section-y)]">
        <div className="container-x flex flex-wrap items-end justify-between gap-6">
          <Reveal>
            <p className="eyebrow text-brand-text">{t("news.eyebrow")}</p>
            <h2 className="display mt-4 h-section">{t("news.title")}</h2>
          </Reveal>
          <a href={`${base}/news`} className="btn btn-ghost">
            <span>
              {t("news.all")} <ArrowRight aria-hidden className="h-5 w-5" />
            </span>
          </a>
        </div>
        {data.posts.length > 0 ? (
          <div className="mt-8">
            <ExpandShowcase
              word={t("news.eyebrow")}
              items={data.posts.map((post) => ({
                key: post.id,
                href: `${base}/news/${post.slug}`,
                image: post.coverUrl,
                label: post.org === "keda" ? t("news.keda") : t("news.ksc"),
                title: post.title,
                body: post.excerpt ?? undefined,
                meta: post.publishedAt ? formatDate(new Date(post.publishedAt), locale) : undefined,
                tone: post.org === "keda" ? ("keda" as const) : ("ksc" as const),
              }))}
            />
          </div>
        ) : (
          <div className="container-x mt-10">
            <p className="live-card p-8 text-lg text-muted-foreground">{t("news.empty")}</p>
          </div>
        )}
      </section>

      <section id="gallery" className="border-t border-line py-[var(--section-y)]">
        <div className="container-x flex flex-wrap items-end justify-between gap-6">
          <Reveal>
            <p className="eyebrow text-brand-text">{t("gallery.eyebrow")}</p>
            <h2 className="display mt-4 h-section">{t("gallery.title")}</h2>
          </Reveal>
          <a href={`${base}/gallery`} className="btn btn-ghost">
            <span>
              {t("gallery.all")} <ArrowRight aria-hidden className="h-5 w-5" />
            </span>
          </a>
        </div>
        {albums.length > 0 ? (
          <div className="mt-8">
            <ExpandShowcase
              word={t("gallery.eyebrow")}
              items={albums.map((album) => ({
                key: album.id,
                href: `${base}/gallery/${album.id}`,
                image: album.coverUrl,
                label: album.org === "keda" ? t("news.keda") : t("news.ksc"),
                title: album.name,
                meta: t("gallery.photos", { count: album.imageCount }),
                tone: album.org === "keda" ? ("keda" as const) : ("ksc" as const),
              }))}
            />
          </div>
        ) : (
          <div className="container-x mt-10">
            <p className="live-card p-8 text-lg text-muted-foreground">{t("gallery.empty")}</p>
          </div>
        )}
      </section>

      {/* Install + notifications */}
      <section id="app" className="relative overflow-hidden bg-brand text-on-brand [clip-path:polygon(0_0,100%_5vw,100%_100%,0_100%)]">
        <Parallax distance={120} className="pointer-events-none absolute -left-16 bottom-0 select-none">
          <span aria-hidden className="display block text-[38vw] leading-[0.7] text-black/10 lg:text-[22vw]">
            {CLUB.shortName}
          </span>
        </Parallax>
        <div className="container-x relative pb-[var(--section-y)] pt-[calc(var(--section-y)+5vw)]">
          <Reveal className="max-w-3xl">
            <p className="eyebrow text-accent">{t("app.eyebrow")}</p>
            <h2 className="display mt-4 h-section">{t("app.title")}</h2>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed">{t("app.lead")}</p>
          </Reveal>
          <div className="mt-12">
            <AppPanel
              vapidPublicKey={getSecret("VAPID_PUBLIC_KEY") ?? null}
              locale={locale}
              labels={{
                install: t("app.install"),
                installed: t("app.installed"),
                enable: t("app.enable"),
                update: t("app.update"),
                disable: t("app.disable"),
                on: t("app.on"),
                blocked: t("app.blocked"),
                unsupported: t("app.unsupported"),
                iosHint: t("app.iosHint"),
                installHint: t("app.installHint"),
                failed: t("app.failed"),
                topicsLabel: t("app.topicsLabel"),
                topics: { cricket: t("app.topicCricket"), news: t("app.topicNews"), keda: t("app.topicKeda") },
              }}
            />
          </div>
        </div>
      </section>
    </>
  );
}
