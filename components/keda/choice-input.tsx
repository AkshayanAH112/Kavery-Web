"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { BaminiInput } from "@/components/keda/bamini-input";
import { searchText } from "@/lib/keda/bamini";

export type StudentChoices = { schools: string[]; addresses: string[] };

/** The schools and addresses already used on students, for the forms' dropdowns. `reload` after saving one. */
export function useStudentChoices() {
  const [choices, setChoices] = useState<StudentChoices>({ schools: [], addresses: [] });
  const reload = useCallback(() => {
    fetch("/api/students/choices")
      .then((r) => (r.ok ? (r.json() as Promise<StudentChoices>) : null))
      .then((d) => d && setChoices(d))
      .catch(() => {}); // Without the list the boxes still take typing.
  }, []);
  useEffect(reload, [reload]);
  return [choices, reload] as const;
}

type Props = Omit<React.ComponentProps<typeof BaminiInput>, "onKeyDown" | "onFocus" | "role"> & { options: string[] };

/**
 * A Bamini text box with a dropdown of earlier answers. Pick one, or type a
 * new one — it is saved as typed and appears in the list from then on.
 */
export function ChoiceInput({ options, value, onValueChange, onBlur, className = "", ...rest }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const list = useRef<HTMLUListElement>(null);

  const needle = searchText(value.trim());
  // While the box holds one of the choices exactly (or nothing), the whole list is shown.
  const shown = !needle || options.some((o) => searchText(o) === needle) ? options : options.filter((o) => searchText(o).includes(needle));
  const expanded = open && shown.length > 0;

  useEffect(() => {
    if (active >= 0) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (option: string) => {
    onValueChange(option);
    setOpen(false);
    setActive(-1);
  };

  return (
    <div className="relative">
      <BaminiInput
        {...rest}
        value={value}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className={`${className} pr-10`}
        onValueChange={(v) => {
          onValueChange(v);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          setOpen(false);
          setActive(-1);
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!expanded) return setOpen(true);
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((i) => (i + step + shown.length) % shown.length);
          } else if (e.key === "Enter" && expanded && active >= 0) {
            e.preventDefault(); // pick the highlighted choice rather than submit the form
            choose(shown[active]);
          } else if (e.key === "Escape" && expanded) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {options.length > 0 && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Show choices"
          className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
          // Keep the focus in the box; the button only opens or closes the list.
          onMouseDown={(e) => {
            e.preventDefault();
            const input = e.currentTarget.previousElementSibling as HTMLInputElement | null;
            if (document.activeElement !== input) input?.focus();
            else setOpen((o) => !o);
          }}
        >
          <ChevronDown size={18} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      )}
      {expanded && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-[var(--field-radius)] border border-border bg-card py-1 shadow-lg"
        >
          {shown.map((option, i) => (
            <li
              key={option}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`cursor-pointer px-3.5 py-2 text-base text-foreground ${i === active ? "bg-muted" : "hover:bg-muted"}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(option)}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
