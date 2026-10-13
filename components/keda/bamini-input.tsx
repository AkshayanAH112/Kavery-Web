"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { backspaceBamini, baminiToUnicode, looksLikeBamini, typeBamini, type BaminiRun, type BaminiTyped } from "@/lib/keda/bamini";

/**
 * Typing Tamil the Bamini way into an ordinary text box.
 *
 * KEDA's staff type Tamil with the Bamini font's key positions ("juk;" for
 * தரம்). In a web form those keys would arrive, and be saved, as the Latin
 * letters they really are — so each key is converted as it is typed and the box
 * only ever holds real (Unicode) Tamil. The rules live in lib/keda/bamini.ts.
 */

const STORAGE_KEY = "ksc-bamini-typing";

/** Whether this device types Tamil with Bamini keys. On until someone turns it off: KEDA's records are kept in Tamil. */
export function useBaminiTyping() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const change = (next: boolean) => {
    setOn(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      // Private browsing: the choice lasts until the page is closed.
    }
  };
  return [on, change] as const;
}

/** The switch for it. English, or a phone's own Tamil keyboard, needs it off — with it on, a comma is the letter இ. */
export function BaminiToggle({ on, onChange, className = "" }: { on: boolean; onChange: (on: boolean) => void; className?: string }) {
  return (
    <label className={`flex cursor-pointer items-center gap-2 text-sm text-muted-foreground ${className}`}>
      <input type="checkbox" className="h-4 w-4" checked={on} onChange={(e) => onChange(e.target.checked)} />
      Type Tamil with Bamini keys
    </label>
  );
}

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: string;
  onValueChange: (value: string) => void;
  bamini: boolean;
};

export function BaminiInput({ value, onValueChange, bamini, onBlur, ...rest }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const run = useRef<BaminiRun | null>(null);
  const caret = useRef<number | null>(null);

  const apply = (typed: BaminiTyped) => {
    run.current = typed.run;
    caret.current = typed.caret;
    onValueChange(typed.value);
  };

  // Setting the value from here sends the caret to the end; put it back where the typing was.
  useLayoutEffect(() => {
    if (caret.current === null) return;
    input.current?.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  // React's own onBeforeInput does not say what kind of edit is coming, so this listens to the browser's.
  useEffect(() => {
    const el = input.current;
    if (!el || !bamini) return;
    const onBeforeInput = (e: InputEvent) => {
      if (e.isComposing) return; // a Tamil keyboard, or a phone composing a whole word — see onBlur
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      const typed =
        e.inputType === "insertText" && e.data
          ? typeBamini(el.value, start, end, e.data, run.current)
          : e.inputType === "deleteContentBackward"
            ? backspaceBamini(el.value, start, end, run.current)
            : null;
      if (!typed) {
        run.current = null;
        return;
      }
      e.preventDefault();
      apply(typed);
    };
    el.addEventListener("beforeinput", onBeforeInput);
    return () => el.removeEventListener("beforeinput", onBeforeInput);
  });

  return (
    <input
      {...rest}
      ref={input}
      type="text"
      lang={bamini ? "ta" : undefined}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      onPaste={(e) => {
        const text = e.clipboardData.getData("text/plain").replace(/\s*[\r\n]+\s*/g, " ");
        // Text that is already Tamil goes in as it is: converting it would turn its commas into இ.
        if (!bamini || !text || /[஀-௿]/.test(text)) return;
        e.preventDefault();
        const el = e.currentTarget;
        const start = el.selectionStart ?? el.value.length;
        apply(typeBamini(el.value, start, el.selectionEnd ?? start, text, null));
      }}
      onBlur={(e) => {
        // Keys that were not caught one by one (a phone keyboard composing words, autofill) are converted on leaving the box.
        if (bamini && looksLikeBamini(value)) onValueChange(baminiToUnicode(value));
        onBlur?.(e);
      }}
    />
  );
}
