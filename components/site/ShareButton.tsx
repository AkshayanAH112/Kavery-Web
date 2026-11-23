"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Check, Link2, Share2 } from "lucide-react";

/** Shared links always point at the live site, so a link copied from a local build still works. */
const SITE = "https://periyaneelavanaikaverysports.club";

const MENU_WIDTH = 240;

type Labels = { share: string; menu: string; copy: string; copied: string };

/**
 * A "Share" button for a public page. On a phone it opens the phone's own share
 * sheet, which lists whatever is installed (WhatsApp, Facebook, Messenger,
 * Viber…). Elsewhere it opens a short menu: WhatsApp, Facebook, X, copy link.
 *
 * The menu is a <details> of plain links, so it opens and works before the
 * script has loaded. The preview a shared link gets (title, picture) is the
 * page's Open Graph metadata, not anything set here.
 */
export function ShareButton({ path, title, labels }: { path: string; title: string; labels: Labels }) {
  const url = `${SITE}${path}`;
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  // The menu opens rightwards from the button unless that would run off the screen (a button at the right of a row).
  const [toLeft, setToLeft] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => {
      if (ref.current) ref.current.open = false;
    };
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      ref.current?.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const onSummary = (e: MouseEvent) => {
    if (ref.current?.open) return;
    // A phone's own sheet beats any list we could offer. A desktop browser's is often a bare system dialog, so not there.
    if (typeof navigator.share !== "function" || !window.matchMedia("(pointer: coarse)").matches) return;
    e.preventDefault();
    navigator.share({ title, url }).catch((err: unknown) => {
      // Dismissing the sheet is not a failure; anything else falls back to the menu.
      if ((err as Error)?.name !== "AbortError" && ref.current) ref.current.open = true;
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // No clipboard access (an insecure origin, a denied permission): the other options still work.
    }
  };

  const close = () => {
    if (ref.current) ref.current.open = false;
  };

  const targets = [
    { label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`, icon: WhatsAppMark },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, icon: FacebookMark },
    { label: "X", href: `https://x.com/intent/post?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`, icon: XMark },
  ];
  const item = "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded px-3 text-left text-sm font-semibold text-fg transition-colors hover:bg-surface-2";

  return (
    <details
      ref={ref}
      onToggle={(e) => {
        const el = e.currentTarget;
        if (el.open) setToLeft(el.getBoundingClientRect().left + MENU_WIDTH + 16 > window.innerWidth);
        setOpen(el.open);
      }}
      className="relative inline-block"
    >
      <summary onClick={onSummary} className="btn btn-ghost list-none [&::-webkit-details-marker]:hidden">
        <span>
          <Share2 size={18} aria-hidden />
          {labels.share}
        </span>
      </summary>
      <div style={{ width: MENU_WIDTH }} className={`absolute top-full z-30 mt-2 rounded-[var(--card-radius)] border border-line bg-surface p-1.5 shadow-xl ${toLeft ? "right-0" : "left-0"}`}>
        <ul aria-label={labels.menu}>
          {targets.map(({ label, href, icon: Icon }) => (
            <li key={label}>
              <a href={href} target="_blank" rel="noopener noreferrer" onClick={close} className={item}>
                <Icon />
                {label}
              </a>
            </li>
          ))}
          <li>
            <button type="button" onClick={copy} className={item}>
              {copied ? <Check size={18} aria-hidden className="text-accent" /> : <Link2 size={18} aria-hidden />}
              <span aria-live="polite">{copied ? labels.copied : labels.copy}</span>
            </button>
          </li>
        </ul>
      </div>
    </details>
  );
}

/*
 * Lucide has no brand marks, and a share menu is the one place a logo says more
 * than a word, so these three are the platforms' own glyphs (Simple Icons paths),
 * drawn in the current text colour.
 */
function Mark({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden fill="currentColor" className="shrink-0">
      <path d={d} />
    </svg>
  );
}

function WhatsAppMark() {
  return (
    <Mark d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
  );
}

function FacebookMark() {
  return (
    <Mark d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
  );
}

function XMark() {
  return <Mark d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />;
}
