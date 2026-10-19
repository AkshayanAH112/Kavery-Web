"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, LayoutGrid, X, type LucideIcon } from "lucide-react";
import { moduleIcon } from "@/components/console/icons";
import { mobileTabs, type ConsoleGroup, type ConsoleModule } from "@/lib/console-nav";
import { cn } from "@/lib/utils";

/** Fields where the on-screen keyboard opens; the bar steps aside while one has focus. */
const TYPING = 'input:not([type="checkbox"],[type="radio"],[type="button"],[type="submit"],[type="reset"],[type="file"],[type="range"],[type="color"]),textarea,select,[contenteditable="true"]';

/**
 * The console on a phone or tablet: a floating bar at the bottom with the role's main pages, the
 * scanner raised in the middle when the role has it, and "More" for everything else in a sheet.
 * The sidebar takes over from 1024px (`lg`), where this is hidden.
 */
export function MobileNav({ groups, activeHref }: { groups: ConsoleGroup[]; activeHref: string | undefined }) {
  const { tabs, centre } = mobileTabs(groups);
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const onBar = [...tabs, centre].some((m) => m?.href === activeHref);

  // On a phone the keyboard pushes a fixed bar up over the field being typed in, so it steps aside.
  useEffect(() => {
    const update = () => setTyping(document.activeElement instanceof Element && document.activeElement.matches(TYPING));
    // On focusout the next element is not focused yet; look once it is.
    const later = () => setTimeout(update, 0);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", later);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", later);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      moreButton.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    moreButton.current?.focus();
  }

  // The scanner goes in the middle of the row, between the tabs and "More".
  const slots: (ConsoleModule | "centre" | "more")[] = [...tabs, "more"];
  if (centre) slots.splice(Math.floor(slots.length / 2), 0, "centre");

  return (
    <>
      <nav
        aria-label="Console shortcuts"
        className={cn(
          "fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-md transition-[translate,opacity] duration-200 motion-reduce:transition-none lg:hidden print:hidden",
          typing && "pointer-events-none translate-y-[150%] opacity-0",
        )}
      >
        <ul className="flex items-end justify-between gap-1 rounded-[1.75rem] border border-line bg-surface/90 p-1.5 shadow-[0_10px_40px_-8px_rgb(0_0_0/0.28)] backdrop-blur-xl">
          {slots.map((slot) => {
            if (slot === "centre" && centre) {
              const Icon = moduleIcon(centre.icon);
              const active = centre.href === activeHref;
              return (
                <li key="centre" className="flex flex-1 justify-center">
                  <Link
                    href={centre.href}
                    aria-current={active ? "page" : undefined}
                    className="-mt-7 flex flex-col items-center gap-1 rounded-2xl text-[0.6875rem] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground"
                  >
                    <span className={cn("flex h-14 w-14 items-center justify-center rounded-full bg-brand text-on-brand shadow-lg ring-4 ring-bg transition-transform duration-150 active:scale-95", active && "ring-accent")}>
                      <Icon aria-hidden className="h-6 w-6" strokeWidth={2} />
                    </span>
                    {centre.short ?? centre.label}
                  </Link>
                </li>
              );
            }
            if (slot === "more") {
              return (
                <li key="more" className="flex-1">
                  <button
                    ref={moreButton}
                    type="button"
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    onClick={() => setOpen(true)}
                    className={cn(tabClass, !onBar && activeHref ? "text-foreground" : "text-muted-foreground")}
                  >
                    <TabIcon active={!onBar && !!activeHref} Icon={LayoutGrid} />
                    More
                  </button>
                </li>
              );
            }
            if (slot === "centre") return null;
            const Icon = moduleIcon(slot.icon);
            const active = slot.href === activeHref;
            return (
              <li key={slot.key} className="flex-1">
                <Link href={slot.href} aria-current={active ? "page" : undefined} className={cn(tabClass, active ? "text-foreground" : "text-muted-foreground")}>
                  <TabIcon active={active} Icon={Icon} />
                  <span className="max-w-full truncate">{slot.short ?? slot.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Every page the role can open. Kept in the page and slid out of view, so it can animate; `inert` while closed. */}
      <div className={cn("fixed inset-0 z-50 lg:hidden print:hidden", !open && "pointer-events-none")} inert={!open}>
        <button type="button" tabIndex={-1} aria-hidden onClick={close} className={cn("absolute inset-0 bg-black/50 transition-opacity duration-200 motion-reduce:transition-none", open ? "opacity-100" : "opacity-0")} />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="console-all-pages"
          className={cn(
            "absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[1.75rem] border-t border-line bg-surface px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none",
            open ? "translate-y-0" : "translate-y-full",
          )}
        >
          <div className="sticky top-0 z-10 -mx-4 bg-surface px-4 pb-2 pt-2.5">
            <span aria-hidden className="mx-auto block h-1 w-10 rounded-full bg-line" />
            <div className="mt-2 flex items-center justify-between">
              <h2 id="console-all-pages" className="text-lg font-semibold">
                All pages
              </h2>
              <button ref={closeButton} type="button" aria-label="Close" onClick={close} className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full hover:bg-muted">
                <X aria-hidden className="h-5 w-5" />
              </button>
            </div>
          </div>

          {groups.map((group) => {
            const items = group.items.filter((m) => m.ready);
            if (items.length === 0) return null;
            return (
              <section key={group.label} className="mt-3">
                <h3 className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h3>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {items.map((item) => {
                    const Icon = moduleIcon(item.icon);
                    const active = item.href === activeHref;
                    return (
                      <li key={item.key}>
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className="flex min-h-24 flex-col items-center justify-start gap-2 rounded-2xl px-1 pb-2 pt-2.5 text-center text-[0.8125rem] font-medium leading-tight transition-colors hover:bg-muted active:bg-muted"
                        >
                          <span className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", active ? "bg-brand text-on-brand" : "bg-muted text-foreground")}>
                            <Icon aria-hidden className="h-5.5 w-5.5" strokeWidth={1.75} />
                          </span>
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          <Link href="/" target="_blank" className="mt-5 flex h-12 items-center justify-center gap-2 rounded-2xl border border-line text-[0.9375rem] font-semibold hover:bg-muted">
            Open the public site <ExternalLink aria-hidden className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </>
  );
}

const tabClass =
  "flex min-h-14 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[0.6875rem] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-foreground";

/** The icon sits in a pill that fills in for the current page, as an installed app's tab bar does. */
function TabIcon({ active, Icon }: { active: boolean; Icon: LucideIcon }) {
  return (
    <span className={cn("flex h-8 w-14 items-center justify-center rounded-full transition-colors", active ? "bg-brand text-on-brand" : "")}>
      <Icon aria-hidden className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
    </span>
  );
}
