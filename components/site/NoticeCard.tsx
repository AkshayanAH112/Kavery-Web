import Link from "next/link";
import { formatDate } from "@/components/site/PageShell";
import type { Notice } from "@/lib/notices";

/**
 * One poster in a list of notices. In the masonry list (`whole`) the poster keeps
 * its own shape; in the short "earlier notices" row it is a uniform tile cut from
 * the top, where a poster's heading usually is.
 */
export function NoticeCard({ notice, locale, topicLabel, alt, whole }: { notice: Notice; locale: string; topicLabel: string; alt: string; whole?: boolean }) {
  return (
    <Link href={`/${locale}/notices/${notice.id}`} className="group block break-inside-avoid overflow-hidden rounded-[var(--card-radius)] border border-line bg-surface transition-colors hover:border-accent focus-visible:border-accent">
      <span className={`block overflow-hidden bg-surface-2 ${whole ? "" : "aspect-[4/5]"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- already sized before upload */}
        <img src={notice.image} alt={alt} loading="lazy" className={`block w-full transition-transform duration-300 group-hover:scale-[1.03] ${whole ? "h-auto" : "h-full object-cover object-top"}`} />
      </span>
      <span className="block p-4">
        <span className="eyebrow block text-[0.75rem] text-brand-text">{topicLabel}</span>
        <span className="mt-1.5 block text-lg font-bold leading-snug text-fg group-hover:text-accent">{notice.title}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{formatDate(notice.sentAt, locale)}</span>
      </span>
    </Link>
  );
}
