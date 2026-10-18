"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { usePrefersReducedMotion } from "./motion";

type Labels = {
  eyebrow: string;
  line1: string;
  line2: string;
  lead: string;
  /** The opening's date and time, already formatted in Sri Lankan time. */
  when: string;
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
  open: string;
  entering: string;
  /** The chief guest's button, and what it says while the press is sent or if it fails. */
  press: string;
  pressHint: string;
  opening: string;
  failed: string;
  /** What everyone else sees between zero and the press. */
  waiting: string;
  staff: string;
};

type Props = {
  /** Epoch ms of the opening. */
  at: number;
  /** The server's clock when the page was rendered: the first render matches its HTML, and the
   *  countdown runs on the server's time, so a visitor whose phone is fast is not sent in early. */
  now: number;
  /** Where to go once it opens. */
  home: string;
  /** A signed-in administrator's screen — the ceremony screen — which carries the button. */
  canOpen: boolean;
  founded: number;
  language: { href: string; label: string; lang: string };
  labels: Labels;
};

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** How long "we are open" holds the screen before the site loads. */
const CELEBRATE_MS = 4000;
/** How often a waiting screen asks whether the chief guest has opened the site. */
const POLL_MS = 3000;
const API = "/api/opening";

function split(ms: number) {
  const left = Math.max(0, ms);
  return {
    days: Math.floor(left / DAY),
    hours: Math.floor((left % DAY) / HOUR),
    minutes: Math.floor((left % HOUR) / MINUTE),
    seconds: Math.floor((left % MINUTE) / SECOND),
  };
}

/**
 * Stands in for the whole public site until the chief guest opens it (the site layout decides).
 * The flip clock ticks down; at zero the ceremony screen shows "Open the website" and every other
 * screen waits. The press opens the site on the server, every screen shows "we are open", and
 * then the home page loads — by now the server serves the real site to everyone.
 */
export function OpeningCountdown({ at, now, home, canOpen, founded, language, labels }: Props) {
  const reduce = usePrefersReducedMotion();
  const [clock, setClock] = useState(now);
  const [open, setOpen] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // `now` was read on the server just before the page was sent, so compare it with when the
    // response arrived, not with this moment: loading and hydrating can take seconds, and the
    // clock would run that far behind.
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const skew = now - (nav ? performance.timeOrigin + nav.responseStart : Date.now());
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = Date.now() + skew;
      setClock(t);
      if (t >= at) return;
      // Wake just after the next whole second of the countdown, not on a drifting interval.
      timer = setTimeout(tick, ((at - t) % SECOND) + 20);
    };
    tick();
    return () => clearTimeout(timer);
  }, [at, now]);

  const due = clock >= at;

  // From zero until the press, every screen (the ceremony screen too, in case it is opened from
  // another) asks the server whether the site is open yet.
  useEffect(() => {
    if (!due || open) return;
    let stopped = false;
    const check = async () => {
      try {
        const res = await fetch(API, { cache: "no-store" });
        const body = (await res.json()) as { open?: boolean };
        if (!stopped && body.open) setOpen(true);
      } catch {
        // offline for a moment: the next check will catch up
      }
    };
    const id = setInterval(check, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [due, open]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => window.location.replace(home), CELEBRATE_MS);
    return () => clearTimeout(timer);
  }, [open, home]);

  async function press() {
    setPressing(true);
    setFailed(false);
    try {
      const res = await fetch(API, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      setOpen(true);
    } catch {
      setFailed(true);
      setPressing(false);
    }
  }
  const parts = split(at - clock);
  const units = [
    ...(parts.days > 0 ? [{ key: "days", value: parts.days, label: labels.days }] : []),
    { key: "hours", value: parts.hours, label: labels.hours },
    { key: "minutes", value: parts.minutes, label: labels.minutes },
    { key: "seconds", value: parts.seconds, label: labels.seconds },
  ];

  return (
    <div className="grain relative isolate flex min-h-svh flex-col overflow-hidden bg-bg">
      {/* The hero's backdrop: floodlight, the two sashes and the founding year. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="hero-glow absolute right-[-20%] top-[-30%] h-[90vh] w-[90vh] rounded-full bg-brand opacity-30 blur-[140px]" />
        <div className="hero-sash-red absolute right-[-38vw] top-[4vh] h-[24vh] w-[105vw] rotate-[-24deg] bg-brand opacity-90 lg:right-[-30vw] lg:w-[80vw]" />
        {/* Only where there is room beside the clock: on a phone it would cut through the date. */}
        <div className="hero-sash-yellow absolute bottom-[14vh] left-[-30vw] hidden h-[1.4vh] w-[60vw] rotate-[-24deg] bg-accent lg:block" />
        <span
          className="hero-year display absolute bottom-[-4vh] left-[-2vw] block select-none text-[42vw] leading-none text-transparent lg:text-[26vw]"
          style={{ WebkitTextStroke: "1.5px rgb(255 255 255 / 0.08)" }}
        >
          {founded}
        </span>
        <motion.div
          initial={false}
          animate={open && !reduce ? { opacity: 0.6, scale: 1.6 } : { opacity: 0, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          className="absolute left-1/2 top-1/2 h-[80vmin] w-[80vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent blur-[120px]"
        />
      </div>

      <header className="container-x flex h-(--nav-h) items-center justify-end">
        <a href={language.href} lang={language.lang} className="inline-flex min-h-11 items-center px-2 text-[0.9375rem] font-semibold text-fg hover:text-accent">
          {language.label}
        </a>
      </header>

      <main className="container-x flex flex-1 flex-col items-center justify-center pb-16 pt-4 text-center">
        <motion.div
          animate={open && !reduce ? { scale: [1, 1.25, 1.1], rotate: [0, -8, 0] } : undefined}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          className="hero-crest w-32 sm:w-40 lg:w-48"
        >
          <div className="hero-float">
            <Image
              src="/brand/ksc-crest.webp"
              alt="Kavery Sports Club crest"
              width={900}
              height={890}
              loading="eager"
              fetchPriority="high"
              className="h-auto w-full drop-shadow-[0_30px_60px_rgb(0_0_0/0.55)]"
            />
          </div>
        </motion.div>

        <p className="hero-in eyebrow mt-8 text-accent [--d:200ms]">{labels.eyebrow}</p>
        <h1 className="hero-in display mt-3 [--d:320ms]">
          <span className="block text-6xl sm:text-7xl lg:text-8xl">{labels.line1}</span>{" "}
          <span className="block text-3xl text-accent sm:text-4xl lg:text-5xl">{labels.line2}</span>
        </h1>

        <div role="timer" aria-label={labels.when} className="hero-in mt-10 flex min-h-36 flex-col items-center justify-center [--d:460ms] sm:min-h-44">
          <AnimatePresence mode="wait" initial={false}>
            {open ? (
              <motion.div
                key="open"
                initial={reduce ? false : { scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 240, damping: 12 }}
                role="status"
              >
                <p className="display text-[min(12vw,6rem)] leading-none text-accent [:lang(ta)_&]:text-[min(10vw,5rem)]">{labels.open}</p>
                <p className="mt-4 text-lg text-muted-foreground">{labels.entering}</p>
              </motion.div>
            ) : due && canOpen ? (
              <motion.div
                key="press"
                initial={reduce ? false : { scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={reduce ? undefined : { scale: 1.15, opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 18 }}
                className="flex flex-col items-center"
              >
                <p className="eyebrow text-muted-foreground">{labels.pressHint}</p>
                <div className="relative mt-5">
                  {!reduce && !pressing && <span aria-hidden className="opening-ring absolute inset-0 rounded-sm bg-accent" />}
                  <button
                    type="button"
                    onClick={press}
                    disabled={pressing}
                    autoFocus
                    className="btn btn-accent relative px-10! text-xl! shadow-[0_20px_60px_-10px_rgb(250_204_21/0.55)] sm:min-h-20! sm:px-14! sm:text-2xl! [:lang(ta)_&]:text-lg! sm:[:lang(ta)_&]:text-xl!"
                  >
                    <span>{pressing ? labels.opening : labels.press}</span>
                  </button>
                </div>
                <p role="alert" className="mt-4 min-h-6 text-destructive">{failed ? labels.failed : ""}</p>
              </motion.div>
            ) : due ? (
              <motion.div
                key="waiting"
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.5 }}
                role="status"
              >
                <p className="opening-waiting display max-w-xl text-2xl leading-snug text-accent sm:text-4xl [:lang(ta)_&]:text-xl sm:[:lang(ta)_&]:text-3xl">{labels.waiting}</p>
              </motion.div>
            ) : (
              <motion.div key="clock" exit={reduce ? undefined : { scale: 0.8, opacity: 0 }} transition={{ duration: 0.35 }}>
                <p className="text-lg text-muted-foreground">{labels.lead}</p>
                <div aria-hidden className="mt-5 flex flex-wrap items-start justify-center gap-2 sm:gap-4">
                  {units.map((unit, i) => (
                    <div key={unit.key} className="flex items-start gap-2 sm:gap-4">
                      {i > 0 && <span className="countdown-colon display pt-3 text-4xl text-accent sm:pt-5 sm:text-6xl">:</span>}
                      <div className="flex flex-col items-center">
                        <div className="flex gap-1 sm:gap-1.5">
                          {String(unit.value)
                            .padStart(2, "0")
                            .split("")
                            .map((digit, d) => (
                              <Digit key={d} digit={digit} reduce={reduce} />
                            ))}
                        </div>
                        <span className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{unit.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="hero-in mt-8 text-lg font-semibold sm:text-xl [--d:600ms]">{labels.when}</p>
      </main>

      <footer className="container-x flex justify-center pb-6">
        {/* The console is not localised — this must never get a locale prefix. */}
        <Link href="/login" className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-fg">
          {labels.staff}
        </Link>
      </footer>
    </div>
  );
}

/** One digit in its own tile: the new value rolls up from below as the old one leaves through the top. */
function Digit({ digit, reduce }: { digit: string; reduce: boolean }) {
  return (
    <span className="relative flex h-16 w-11 items-center justify-center overflow-hidden rounded-lg bg-surface shadow-[inset_0_-14px_18px_-14px_rgb(0_0_0/0.9),0_14px_30px_-12px_rgb(0_0_0/0.8)] ring-1 ring-white/10 sm:h-24 sm:w-16 lg:h-28 lg:w-20">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={digit}
          initial={reduce ? false : { y: "100%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={reduce ? undefined : { y: "-100%", opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="display block text-4xl tabular-nums text-fg sm:text-6xl lg:text-7xl"
        >
          {digit}
        </motion.span>
      </AnimatePresence>
      {/* the hinge line of a flip clock */}
      <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-black/60" />
    </span>
  );
}
