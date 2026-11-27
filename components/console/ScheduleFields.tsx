"use client";

import { colomboToday, describeRule, nextRun, REPEAT_LABELS, REPEATS, WEEKDAYS, type Repeat, type ScheduleRule } from "@/lib/push-schedule";
import { Field, fieldClass } from "./ui";

/** The schedule as the form holds it: every field a string or list, so inputs stay controlled. */
export type ScheduleDraft = { repeat: Repeat; startDate: string; time: string; days: number[]; dayOfMonth: string; endDate: string };

export function newDraft(): ScheduleDraft {
  const today = colomboToday();
  return { repeat: "once", startDate: today, time: "", days: [new Date(`${today}T00:00:00Z`).getUTCDay()], dayOfMonth: String(Number(today.slice(8))), endDate: "" };
}

export function draftFrom(rule: ScheduleRule): ScheduleDraft {
  return { ...rule, dayOfMonth: rule.dayOfMonth ? String(rule.dayOfMonth) : String(Number(rule.startDate.slice(8))), endDate: rule.endDate ?? "" };
}

/** What the API takes, or null while the form is incomplete. */
export function ruleFrom(draft: ScheduleDraft): ScheduleRule | null {
  if (!draft.startDate || !draft.time) return null;
  if (draft.repeat === "weekly" && draft.days.length === 0) return null;
  return {
    repeat: draft.repeat,
    startDate: draft.startDate,
    time: draft.time,
    days: draft.repeat === "weekly" ? [...draft.days].sort() : [],
    dayOfMonth: draft.repeat === "monthly" ? Number(draft.dayOfMonth) : null,
    endDate: draft.repeat !== "once" && draft.endDate ? draft.endDate : null,
  };
}

const whenFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
export const formatWhen = (at: number) => whenFormat.format(at);

/** Date, time and repeat for a scheduled notification, with the next send spelled out under it. */
export function ScheduleFields({ value, onChange }: { value: ScheduleDraft; onChange: (draft: ScheduleDraft) => void }) {
  const set = (patch: Partial<ScheduleDraft>) => onChange({ ...value, ...patch });
  const rule = ruleFrom(value);
  const next = rule ? nextRun(rule) : null;
  const once = value.repeat === "once";

  return (
    <div className="space-y-4 rounded-[var(--field-radius)] border border-line bg-muted/40 p-4">
      <fieldset>
        <legend className="mb-1.5 block text-sm font-semibold">Repeat</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {REPEATS.map((r) => (
            <label key={r} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-[var(--field-radius)] border px-3 text-center text-[0.9375rem] font-semibold transition-colors has-[:focus-visible]:outline-2 ${value.repeat === r ? "border-fg bg-surface text-fg" : "border-line bg-surface text-muted-foreground hover:bg-muted"}`}>
              <input type="radio" name="repeat" value={r} checked={value.repeat === r} onChange={() => set({ repeat: r })} className="sr-only" />
              {REPEAT_LABELS[r]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={once ? "Date" : "Starting from"}>
          <input type="date" required value={value.startDate} min={colomboToday()} onChange={(e) => set({ startDate: e.target.value })} className={fieldClass} />
        </Field>
        <Field label="Time (Sri Lanka)">
          <input type="time" required value={value.time} onChange={(e) => set({ time: e.target.value })} className={fieldClass} />
        </Field>
      </div>

      {value.repeat === "weekly" && (
        <fieldset>
          <legend className="mb-1.5 block text-sm font-semibold">On these days</legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((name, day) => {
              const on = value.days.includes(day);
              return (
                <label key={name} className={`flex h-11 w-14 cursor-pointer items-center justify-center rounded-[var(--field-radius)] border text-sm font-semibold transition-colors has-[:focus-visible]:outline-2 ${on ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-fg hover:bg-muted"}`}>
                  <input type="checkbox" checked={on} onChange={() => set({ days: on ? value.days.filter((d) => d !== day) : [...value.days, day] })} className="sr-only" />
                  {name}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {value.repeat === "monthly" && (
        <Field label="Day of the month" hint={Number(value.dayOfMonth) > 28 ? "In months without this day, it goes out on the last day." : undefined}>
          <select value={value.dayOfMonth} onChange={(e) => set({ dayOfMonth: e.target.value })} className={fieldClass}>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </Field>
      )}

      {!once && (
        <Field label="Stop after (optional)" hint="The last date it can go out. Leave empty to keep repeating until you pause or delete it.">
          <input type="date" value={value.endDate} min={value.startDate} onChange={(e) => set({ endDate: e.target.value })} className={fieldClass} />
        </Field>
      )}

      <p className="text-sm" aria-live="polite">
        {!rule ? (
          <span className="text-muted-foreground">Choose a {value.repeat === "weekly" && value.days.length === 0 ? "day" : "time"} to see when it goes out.</span>
        ) : next ? (
          <>
            <span className="font-semibold">{describeRule(rule)}.</span> <span className="text-muted-foreground">{once ? "Goes out" : "First one goes out"} {formatWhen(next)}.</span>
          </>
        ) : (
          <span className="font-semibold text-danger">That time has already passed{once ? "" : ", or it ends before it would go out"}. Choose a later time.</span>
        )}
      </p>
    </div>
  );
}
