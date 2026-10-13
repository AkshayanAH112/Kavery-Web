"use client";

import Image from "next/image";
import { useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { usePrefersReducedMotion } from "./motion";

type Props = {
  eyebrow: string;
  line1: string;
  line2: string;
  lead: string;
  founded: number;
  actions: ReactNode;
  /** The match ticker, rendered on the server and pinned to the hero's bottom edge. */
  children: ReactNode;
};

/**
 * Four layers that travel at different speeds as the hero scrolls away:
 * the founding year (slowest), the two crest-coloured sashes, the crest, and
 * the headline (which also fades). With reduced motion everything stays put.
 */
export function Hero({ eyebrow, line1, line2, lead, founded, actions, children }: Props) {
  const ref = useRef<HTMLElement>(null);
  const reduce = usePrefersReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });

  const yearY = useTransform(scrollYProgress, [0, 1], [0, 260]);
  const sashRedY = useTransform(scrollYProgress, [0, 1], [0, 150]);
  const sashYellowY = useTransform(scrollYProgress, [0, 1], [0, 40]);
  const crestY = useTransform(scrollYProgress, [0, 1], [0, -110]);
  const crestRotate = useTransform(scrollYProgress, [0, 1], [0, -7]);
  const copyY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0.15]);

  return (
    <section ref={ref} className="grain relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-bg">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {/* floodlight */}
        <div className="absolute -right-[20%] -top-[30%] h-[90vh] w-[90vh] rounded-full bg-brand opacity-30 blur-[140px]" />
        <motion.div style={{ y: reduce ? 0 : yearY }} className="absolute -left-[2vw] top-[9vh] select-none">
          <span
            className="display block text-[42vw] leading-none text-transparent lg:text-[30vw]"
            style={{ WebkitTextStroke: "1.5px rgb(255 255 255 / 0.07)" }}
          >
            {founded}
          </span>
        </motion.div>
        <motion.div style={{ y: reduce ? 0 : sashRedY }} className="absolute -right-[38vw] top-[4vh] h-[30vh] w-[105vw] -rotate-[24deg] bg-brand lg:-right-[30vw] lg:w-[80vw]" />
        <motion.div style={{ y: reduce ? 0 : sashYellowY }} className="absolute -right-[38vw] top-[41vh] h-[1.6vh] w-[64vw] -rotate-[24deg] bg-accent sm:w-[105vw] lg:-right-[30vw] lg:top-[45vh] lg:w-[80vw]" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-bg to-transparent" />
      </div>

      <motion.div
        style={{ y: reduce ? 0 : crestY, rotate: reduce ? 0 : crestRotate }}
        className="pointer-events-none absolute right-[6vw] top-[calc(var(--nav-h)+1.5rem)] z-0 w-[34vw] max-w-[9.5rem] sm:max-w-[13rem] lg:right-[7vw] lg:top-[15vh] lg:w-[30vw] lg:max-w-[27rem]"
      >
        <Image
          src="/brand/ksc-crest.webp"
          alt=""
          width={900}
          height={890}
          loading="eager"
          fetchPriority="high"
          className="h-auto w-full drop-shadow-[0_30px_60px_rgb(0_0_0/0.55)]"
        />
      </motion.div>

      <div className="container-x relative z-10 flex flex-1 flex-col justify-end pb-10 pt-[calc(var(--nav-h)+11rem)] lg:pb-14 lg:pt-[calc(var(--nav-h)+4rem)]">
        <motion.div style={{ y: reduce ? 0 : copyY, opacity: reduce ? 1 : copyOpacity }}>
          <p className="eyebrow text-accent">{eyebrow}</p>
          <h1 className="display mt-4">
            <span className="hero-line1 block">{line1}</span>
            <span className="hero-line2 block text-accent">{line2}</span>
          </h1>
          <p className="mt-7 max-w-[34rem] text-lg leading-relaxed text-muted-foreground">{lead}</p>
          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-4 pl-1">{actions}</div>
        </motion.div>
      </div>

      <div className="relative z-10">{children}</div>
    </section>
  );
}
