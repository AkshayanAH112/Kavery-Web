import { whatsappNumber, type Contact } from "@/lib/site-settings";

/**
 * The contact people entered under Site details, each with a call link and a
 * WhatsApp link. Used on the home page (club and KEDA sections) and the About
 * page. Hover states use an underline, so it reads the same on the dark club
 * theme and KEDA's daylight one.
 */
export function ContactPeople({ title, people, whatsapp, className = "", titleClassName = "text-accent" }: { title: string; people: Contact[]; whatsapp: string; className?: string; titleClassName?: string }) {
  if (people.length === 0) return null;
  return (
    <div className={className}>
      <h3 className={`eyebrow ${titleClassName}`}>{title}</h3>
      <ul className="mt-4">
        {people.map((p, i) => (
          <li key={i} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-line py-3">
            <span className="font-semibold text-fg">{p.name}</span>
            <span className="flex flex-wrap items-center gap-x-5">
              <a href={`tel:${p.phone.replace(/[\s-]/g, "")}`} className="tabular inline-flex min-h-11 items-center text-lg font-bold text-fg underline-offset-4 hover:underline">
                {p.phone}
              </a>
              <a href={`https://wa.me/${whatsappNumber(p.phone)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline underline-offset-4 hover:text-fg">
                {whatsapp}
              </a>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
