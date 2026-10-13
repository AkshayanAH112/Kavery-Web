import Image from "next/image";

export type ShowcaseItem = {
  key: string;
  href: string;
  /** A photo to fill the tile. Without one the tile is drawn in the organisation's colour. */
  image: string | null;
  label: string;
  title: string;
  meta?: string;
  body?: string;
  tone?: "ksc" | "keda";
};

/**
 * A row of tiles that open like an accordion: one is always wide (the first,
 * until another is pointed at or focused) and shows its title and text; the rest
 * stand as narrow spines. Behind them a giant word drifts past. On phones and
 * tablets it becomes a two-column grid with every title visible.
 *
 * No script: the whole behaviour is CSS (`.showcase*` in globals.css), so it
 * works before hydration and by keyboard, and stops moving for visitors who ask
 * for reduced motion.
 */
export function ExpandShowcase({ word, items }: { word: string; items: ShowcaseItem[] }) {
  return (
    <div className="showcase">
      {/* Decorative repetition, hidden from assistive tech. */}
      <div aria-hidden className="showcase-ticker">
        <div className="showcase-ticker-track">
          {[0, 1].map((copy) => (
            <span key={copy}>{`${word} · `.repeat(6)}</span>
          ))}
        </div>
      </div>

      <ul className="showcase-row">
        {items.map((item) => (
          <li key={item.key} className="showcase-item">
            <a href={item.href} className="showcase-link">
              {item.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- uploads are already resized; the optimizer would only re-compress them
                <img src={item.image} alt="" loading="lazy" className="showcase-image" />
              ) : (
                <span className={`showcase-blank ${item.tone === "keda" ? "showcase-blank-keda" : ""}`}>
                  <Image src={item.tone === "keda" ? "/brand/keda-logo.webp" : "/brand/ksc-crest.webp"} alt="" width={320} height={320} className="h-auto w-2/5 max-w-40 opacity-25" />
                </span>
              )}
              <span className="showcase-shade" />
              <span aria-hidden className="showcase-spine">
                {item.title}
              </span>
              <span className="showcase-detail">
                <span className="eyebrow text-accent">{item.label}</span>
                <span className="showcase-title">{item.title}</span>
                {item.body && <span className="showcase-body">{item.body}</span>}
                {item.meta && <span className="showcase-meta">{item.meta}</span>}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
