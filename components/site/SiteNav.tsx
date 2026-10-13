"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string };
type Props = {
  home: string;
  links: NavLink[];
  app: NavLink;
  language: { href: string; label: string; ariaLabel: string; lang: string };
  labels: { menu: string; close: string; brand: string };
};

export function SiteNav({ home, links, app, language, labels }: Props) {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 h-[var(--nav-h)] transition-[background-color,border-color] duration-300",
          solid || open ? "border-b border-line bg-bg/90 backdrop-blur-md" : "border-b border-transparent",
        )}
      >
        <div className="container-x flex h-full items-center justify-between gap-6">
          <Link href={home} className="flex items-center gap-3" onClick={() => setOpen(false)}>
            <Image src="/brand/ksc-crest.png" alt="Kavery Sports Club crest" width={44} height={44} className="h-11 w-11" />
            <span className="display text-xl leading-none tracking-wide">{labels.brand}</span>
          </Link>

          {/* Six items stop fitting at tablet width (sooner in Tamil), so the inline links start at xl. */}
          <nav className="hidden items-center gap-8 xl:flex">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="text-[0.9375rem] font-medium text-muted-foreground transition-colors hover:text-fg">
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href={language.href}
              lang={language.lang}
              aria-label={language.ariaLabel}
              className="hidden min-h-11 items-center px-2 text-[0.9375rem] font-semibold text-fg hover:text-accent sm:inline-flex"
            >
              {language.label}
            </Link>
            <a href={app.href} className="btn btn-accent hidden !min-h-11 !px-5 !text-[0.9375rem] sm:inline-flex">
              <span>{app.label}</span>
            </a>
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center text-fg xl:hidden"
              aria-expanded={open}
              aria-controls="site-menu"
              aria-label={open ? labels.close : labels.menu}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X aria-hidden /> : <Menu aria-hidden />}
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div id="site-menu" className="fixed inset-x-0 bottom-0 top-[var(--nav-h)] z-40 overflow-y-auto bg-bg text-fg xl:hidden">
          <nav className="container-x flex flex-col py-6">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="display border-b border-line py-5 text-4xl text-fg transition-colors hover:text-accent"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-8 flex flex-wrap items-center gap-5 pl-1">
              <a href={app.href} onClick={() => setOpen(false)} className="btn btn-accent">
                <span>{app.label}</span>
              </a>
              <Link
                href={language.href}
                lang={language.lang}
                aria-label={language.ariaLabel}
                className="inline-flex min-h-11 items-center px-2 font-semibold text-fg hover:text-accent"
              >
                {language.label}
              </Link>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
