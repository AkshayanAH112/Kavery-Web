"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { usePrefersReducedMotion } from "./motion";

type Labels = {
  eyebrow: string;
  /** The opening's date and time, already formatted in Sri Lankan time. */
  when: string;
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
  open: string;
};

type Props = {
  /** Epoch ms of the opening. */
  at: number;
  /** The server's clock when the page was rendered, so the first client render matches its HTML. */
  now: number;
  labels: Labels;
};

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

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
 * The countdown band at the foot of the hero. Each digit rolls up when it
 * changes; at zero the digits give way to the "we are open" line. With reduced
 * motion the digits simply change in place.
 */
export function OpeningCountdown({ at, now, labels }: Props) {
  const reduce = usePrefersReducedMotion();
  const [clock, setClock] = useState(now);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = Date.now();
      setClock(t);
      if (t >= at) return;
      // Wake just after the next whole second of the countdown, not on a drifting interval.
      timer = setTimeout(tick, ((at - t) % SECOND) + 20);
    };
    tick();
    return () => clearTimeout(timer);
  }, [at]);

  const open = clock >= at;
  const parts = split(at - clock);
  const units = [
    ...(parts.days > 0 ? [{ key: "days", value: parts.days, label: labels.days }] : []),
    { key: "hours", value: parts.hours, label: labels.hours },
    { key: "minutes", value: parts.minutes, label: labels.minutes },
    { key: "seconds", value: parts.seconds, label: labels.seconds },
  ];

  return (
    <div role="timer" aria-label={`${labels.eyebrow}: ${labels.when}`} className="relative overflow-hidden bg-brand text-on-brand">
      <div aria-hidden className="countdown-sheen pointer-events-none absolute inset-0" />
      <div className="container-x relative flex flex-wrap items-center justify-between gap-x-10 gap-y-4 py-5 sm:py-6">
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-2.5">
            <span aria-hidden className="live-dot h-2 w-2 rounded-full bg-accent" />
            {labels.eyebrow}
          </p>
          <p className="mt-1.5 text-lg font-semibold leading-snug sm:text-xl">{labels.when}</p>
        </div>

        {open ? (
          <motion.p
            initial={reduce ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 14 }}
            role="status"
            className="display text-4xl text-accent sm:text-5xl"
          >
            {labels.open}
          </motion.p>
        ) : (
          <div aria-hidden className="flex items-start gap-2 sm:gap-3">
            {units.map((unit, i) => (
              <div key={unit.key} className="flex items-start gap-2 sm:gap-3">
                {i > 0 && <span className="countdown-colon display pt-1.5 text-3xl text-accent sm:pt-2 sm:text-4xl">:</span>}
                <div className="flex flex-col items-center">
                  <div className="flex gap-1">
                    {String(unit.value)
                      .padStart(2, "0")
                      .split("")
                      .map((digit, d) => (
                        <Digit key={d} digit={digit} reduce={reduce} />
                      ))}
                  </div>
                  <span className="mt-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.16em] opacity-85">{unit.label}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One digit in its own tile: the new value rolls up from below as the old one leaves through the top. */
function Digit({ digit, reduce }: { digit: string; reduce: boolean }) {
  return (
    <span className="relative flex h-12 w-9 items-center justify-center overflow-hidden rounded-md bg-bg/90 shadow-[inset_0_-10px_14px_-12px_rgb(0_0_0/0.9)] ring-1 ring-white/10 sm:h-14 sm:w-11">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={digit}
          initial={reduce ? false : { y: "100%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={reduce ? undefined : { y: "-100%", opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="display block text-3xl tabular-nums text-fg sm:text-4xl"
        >
          {digit}
        </motion.span>
      </AnimatePresence>
      {/* the hinge line of a flip clock */}
      <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-black/50" />
    </span>
  );
}
