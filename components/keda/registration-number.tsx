"use client";

import { Lock } from "lucide-react";

/** The same pattern the server checks (`isRegistrationNumber`): KEDA, the exam year's last two digits, then 1000 upwards. */
const PATTERN = /^KEDA\/\d{2}\/\d{4,}$/;

/** As the server stores it: no spaces, upper case. */
export const tidyRegistrationNumber = (value: string) => value.replace(/\s+/g, "").toUpperCase();

/** Null when the number is acceptable, otherwise what is wrong with it. */
export function registrationNumberProblem(value: string, year?: number | null): string | null {
  const number = tidyRegistrationNumber(value);
  if (!number) return "Enter an index number.";
  if (!PATTERN.test(number)) return "Use the format KEDA/27/1000.";
  if (year != null && number.slice(5, 7) !== String(year % 100).padStart(2, "0")) {
    return `This batch sits its exam in ${year}, so its numbers start KEDA/${String(year % 100).padStart(2, "0")}/.`;
  }
  return null;
}

/**
 * The index number box on the Register and Edit Student forms. Monospace, upper case
 * as typed, checked against the format as it is typed. `locked` shows it read-only with
 * the reason, for staff who may see the number but not change it.
 */
export function RegistrationNumberInput({
  value,
  onChange,
  hint,
  problem,
  locked,
  id = "registration-number",
}: {
  value: string;
  onChange: (value: string) => void;
  hint?: React.ReactNode;
  problem?: string | null;
  locked?: string;
  id?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        Registration (index) number
      </label>
      <div className="relative">
        <input
          id={id}
          className={`field font-mono tracking-wide ${problem ? "border-destructive focus:ring-destructive" : ""} ${locked ? "pr-10 text-muted-foreground" : ""}`}
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          readOnly={!!locked}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="KEDA/27/1000"
          aria-invalid={problem ? true : undefined}
          aria-describedby={`${id}-hint`}
        />
        {locked && <Lock size={15} aria-hidden className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />}
      </div>
      <p id={`${id}-hint`} className={`mt-1 text-xs ${problem ? "text-destructive" : "text-muted-foreground"}`} role={problem ? "alert" : undefined}>
        {problem ?? locked ?? hint}
      </p>
    </div>
  );
}
