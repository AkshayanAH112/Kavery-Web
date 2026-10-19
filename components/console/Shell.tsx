"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ExternalLink, LogOut, Moon, PanelLeft, Search, Sun } from "lucide-react";
import { moduleIcon } from "@/components/console/icons";
import { MobileNav } from "@/components/console/MobileNav";
import type { ConsoleGroup } from "@/lib/console-nav";
import { cn } from "@/lib/utils";

/**
 * A boolean kept in localStorage and read through useSyncExternalStore, so the
 * server render and the first client render agree (both see `false`) and the
 * saved value is applied straight after hydration without an effect.
 */
function createFlag(key: string, onChange?: (value: boolean) => void) {
  const listeners = new Set<() => void>();
  let memory: boolean | null = null;
  const get = () => {
    if (memory !== null) return memory;
    try {
      memory = localStorage.getItem(key) === "1";
    } catch {
      memory = false;
    }
    return memory;
  };
  return {
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    get,
    set: (value: boolean) => {
      memory = value;
      try {
        localStorage.setItem(key, value ? "1" : "0");
      } catch {}
      onChange?.(value);
      listeners.forEach((fn) => fn());
    },
  };
}

const collapsedFlag = createFlag("kavery.console.collapsed");
// The inline script in app/(console)/layout.tsx applies the saved theme before first paint.
const darkFlag = createFlag("kavery.console.dark", (dark) => {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
});
const useFlag = (flag: typeof collapsedFlag) => useSyncExternalStore(flag.subscribe, flag.get, () => false);

type User = { name: string; email: string; roleLabel: string };

export function Shell({ groups, user, children }: { groups: ConsoleGroup[]; user: User; children: ReactNode }) {
  const pathname = usePathname();
  const collapsed = useFlag(collapsedFlag);
  const dark = useFlag(darkFlag);
  // The deepest matching link wins, so /console/cricket/teams lights up "Teams" and not also "Matches".
  const activeHref = groups
    .flatMap((g) => g.items.map((m) => m.href))
    .filter((href) => pathname === href || (href !== "/console" && pathname.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === activeHref;


  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop only: below 1024px the floating bottom bar (MobileNav) takes over. */}
      <aside className={cn("sticky top-0 hidden h-screen w-[17rem] shrink-0 flex-col bg-bg transition-[width] duration-200 lg:flex print:hidden", collapsed && "w-[4.5rem]")}>
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
          <Link href="/console" className="flex min-w-0 items-center gap-2.5">
            <Image src="/brand/ksc-crest.png" alt="Kavery Sports Club crest" width={40} height={40} className="h-10 w-10 shrink-0" />
            <span className={cn("truncate text-lg font-bold tracking-tight", collapsed && "hidden")}>
              Kavery<span className="text-brand-text">.</span>
            </span>
          </Link>
        </div>

        <nav aria-label="Console" className="flex-1 overflow-y-auto px-3 pb-4">
          {groups.map((group) => (
            <div key={group.label} className="mt-4 first:mt-1">
              <p className={cn("px-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground", collapsed && "sr-only")}>{group.label}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = moduleIcon(item.icon);
                  const inner = (
                    <>
                      <Icon aria-hidden className="h-4.5 w-4.5 shrink-0" strokeWidth={1.75} />
                      <span className={cn("flex-1 truncate", collapsed && "hidden")}>{item.label}</span>
                      {!item.ready && <span className={cn("rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-semibold text-muted-foreground", collapsed && "hidden")}>Soon</span>}
                    </>
                  );
                  const base = "flex h-10 items-center gap-3 rounded-lg px-3 text-[0.9375rem] font-medium";
                  return (
                    <li key={item.key}>
                      {item.ready ? (
                        <Link
                          href={item.href}
                          title={collapsed ? item.label : undefined}
                          aria-current={isActive(item.href) ? "page" : undefined}
                          className={cn(base, "transition-colors", isActive(item.href) ? "bg-brand text-on-brand" : "hover:bg-muted", collapsed && "justify-center px-0")}
                        >
                          {inner}
                        </Link>
                      ) : (
                        // Not built yet: shown so the shape of the console is visible, but not a link.
                        <span aria-disabled="true" title={collapsed ? `${item.label} (not built yet)` : undefined} className={cn(base, "text-muted-foreground", collapsed && "justify-center px-0")}>
                          {inner}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className={cn("m-3 rounded-[var(--card-radius)] bg-muted p-4 text-center", collapsed && "hidden")}>
          <p className="text-sm font-semibold">Public site</p>
          <p className="mt-0.5 text-sm text-muted-foreground">See what visitors see.</p>
          <Link href="/" target="_blank" className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-3.5 text-sm font-semibold text-on-brand">
            Open site <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1 lg:py-2 lg:pr-2 print:p-0">
        <div className="flex min-h-screen flex-col border-line bg-surface-2/50 lg:min-h-[calc(100vh-1rem)] lg:rounded-2xl lg:border print:min-h-0 print:border-0 print:bg-transparent">
          <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-line bg-bg/85 px-3 backdrop-blur-md print:hidden sm:px-4 lg:rounded-t-2xl">
            <IconButton label="Toggle sidebar" onClick={() => collapsedFlag.set(!collapsed)} className="hidden lg:inline-flex">
              <PanelLeft aria-hidden className="h-4.5 w-4.5" />
            </IconButton>
            <Link href="/console" aria-label="Dashboard" className="shrink-0 lg:hidden">
              <Image src="/brand/ksc-crest.png" alt="" width={36} height={36} className="h-9 w-9" />
            </Link>
            <span aria-hidden className="mx-1 hidden h-5 w-px bg-line sm:block" />
            <ModuleSearch groups={groups} />
            <div className="ml-auto flex items-center gap-1">
              <IconButton label={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={() => darkFlag.set(!dark)}>
                {dark ? <Sun aria-hidden className="h-4.5 w-4.5" /> : <Moon aria-hidden className="h-4.5 w-4.5" />}
              </IconButton>
              <UserMenu user={user} />
            </div>
          </header>
          <main className="min-w-0 flex-1 p-4 sm:p-6 print:p-0">{children}</main>
          {/* Room under the last thing on a page, so the floating bar never sits on top of it. */}
          <div aria-hidden className="h-[calc(6.5rem+env(safe-area-inset-bottom))] shrink-0 lg:hidden print:hidden" />
        </div>
      </div>

      <MobileNav groups={groups} activeHref={activeHref} />
    </div>
  );
}

function IconButton({ label, onClick, className, children }: { label: string; onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={cn("inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-muted", className)}>
      {children}
    </button>
  );
}

/** Jump to a console page by name. Only pages that exist are offered. */
function ModuleSearch({ groups }: { groups: ConsoleGroup[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const term = query.trim().toLowerCase();
  const results = groups.flatMap((g) => g.items.filter((m) => m.ready && (!term || m.label.toLowerCase().includes(term) || g.label.toLowerCase().includes(term))));

  const go = (href: string) => {
    setQuery("");
    setOpen(false);
    router.push(href);
  };

  return (
    <div className="relative w-full max-w-xs">
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls="console-search-results"
        aria-label="Search the console"
        placeholder="Search…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) go(results[0].href);
          if (e.key === "Escape") setOpen(false);
        }}
        className="h-10 w-full rounded-[var(--field-radius)] border border-line bg-surface pl-9 pr-3 text-[0.9375rem] placeholder:text-muted-foreground"
      />
      {open && (
        <ul id="console-search-results" role="listbox" className="absolute inset-x-0 top-12 z-40 overflow-hidden rounded-[var(--field-radius)] border border-line bg-surface p-1 shadow-lg">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No page matches “{query}”.</li>}
          {results.map((m) => (
            <li key={m.key} role="option" aria-selected={false}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(m.href)} className="flex h-10 w-full cursor-pointer items-center rounded-md px-3 text-left text-[0.9375rem] hover:bg-muted">
                {m.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UserMenu({ user }: { user: User }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }

  return (
    <div ref={ref} className="relative ml-1">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${user.name}`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-brand text-sm font-bold text-on-brand"
      >
        {initials}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-40 w-64 rounded-[var(--card-radius)] border border-line bg-surface p-1.5 shadow-lg">
          <div className="px-3 py-2.5">
            <p className="truncate font-semibold">{user.name}</p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            <p className="mt-1 text-sm text-muted-foreground">{user.roleLabel}</p>
          </div>
          <button type="button" role="menuitem" onClick={signOut} className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 text-[0.9375rem] font-medium hover:bg-muted">
            <LogOut aria-hidden className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
