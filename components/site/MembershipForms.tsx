"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { computeAge, isMinor, isNicRequired, isValidNic, JOB_CATEGORIES, MIN_MEMBER_AGE, nicBirthDate, nicGender, OCCUPATIONS, type JobCategory, type MembershipSettings, type Occupation as OccupationValue } from "@/lib/membership/rules";
import { shrinkImage } from "@/lib/upload-client";

/** What the forms need to know about money. Null while the club charges nothing. */
export type FeeInfo = Pick<MembershipSettings, "currency" | "fees" | "bank"> | null;

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const PHONE_PATTERN = "\\+?[0-9 \\-]{7,18}";
const NIC_PATTERN = "([0-9]{9}[VvXx]|[0-9]{12})";

const inputClass =
  "w-full min-h-12 rounded-(--field-radius) border border-line bg-surface-2/60 px-4 py-3 text-base text-fg outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-accent";
const fileClass = `${inputClass} text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-on-accent`;

function Field({ label, note, hint, children }: { label: string; note?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-fg">
        {label} {note && <span className="font-normal text-muted-foreground">{note}</span>}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-sm leading-relaxed text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-5">
      <legend className="eyebrow mb-1 w-full border-b border-line pb-3 text-accent">{title}</legend>
      {children}
    </fieldset>
  );
}

function Done({ title, body }: { title: string; body: string }) {
  return (
    <div role="status" className="live-card flex flex-col items-center gap-4 p-10 text-center">
      <CheckCircle2 size={56} className="text-accent" aria-hidden />
      <h2 className="display text-3xl">{title}</h2>
      <p className="max-w-md text-lg leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

/** A photo is shrunk in the browser; a PDF goes as it is. Throws "large" when still over the limit. */
async function prepare(file: File): Promise<File> {
  const ready = file.type.startsWith("image/") ? await shrinkImage(file) : file;
  if (ready.size > MAX_FILE_BYTES) throw new Error("large");
  return ready;
}

/** Sends a form and reports the outcome in the visitor's language where the refusal is a known one. */
function useSubmit(url: string) {
  const t = useTranslations("Membership");
  const [state, setState] = useState<{ sending: boolean; done: boolean; error: string | null }>({ sending: false, done: false, error: null });

  const submit = async (build: () => Promise<FormData>) => {
    setState({ sending: true, done: false, error: null });
    try {
      const res = await fetch(url, { method: "POST", body: await build() });
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok) {
        const key = data.code ? `error_${data.code}` : "";
        throw new Error(key && t.has(key) ? t(key) : data.error || t("error_generic"));
      }
      setState({ sending: false, done: true, error: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setState({ sending: false, done: false, error: message === "large" ? t("error_file_large") : message && message !== "Failed to fetch" ? message : t("error_generic") });
    }
  };
  return { ...state, submit };
}

/** School student, undergraduate or working — and a working member's occupation from the list, or typed in. */
function Occupation({ category, onCategory, other, onOther }: { category: JobCategory; onCategory: (c: JobCategory) => void; other: string; onOther: (v: string) => void }) {
  const t = useTranslations("Membership");
  const [occupation, setOccupation] = useState<OccupationValue | "">("");
  return (
    <>
      <Field label={t("occupation")}>
        <select name="jobCategory" value={category} onChange={(e) => onCategory(e.target.value as JobCategory)} className={inputClass}>
          {JOB_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {t(`job_${c.value}`)}
            </option>
          ))}
        </select>
      </Field>
      {category === "other" && (
        <Field label={t("job_which")}>
          <select name="occupation" required value={occupation} onChange={(e) => setOccupation(e.target.value as OccupationValue)} className={inputClass}>
            <option value="" disabled>
              {t("job_select")}
            </option>
            {OCCUPATIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(`occupation_${o.value}`)}
              </option>
            ))}
          </select>
        </Field>
      )}
      {category === "other" && occupation === "other" && (
        <Field label={t("job_specify")}>
          <input name="jobOther" required maxLength={80} value={other} onChange={(e) => onOther(e.target.value)} className={inputClass} />
        </Field>
      )}
    </>
  );
}

function Payment({ fee, category }: { fee: NonNullable<FeeInfo>; category: JobCategory }) {
  const t = useTranslations("Membership");
  const rows: [string, string][] = [
    [t("acc_name"), fee.bank.accountName],
    [t("bank"), fee.bank.bankName],
    [t("branch"), fee.bank.branch],
    [t("acc_num"), fee.bank.accountNumber],
  ];
  return (
    <Section title={t("section_payment")}>
      <div className="rounded-(--card-radius) border border-line bg-surface-2/60 p-5">
        <p className="text-sm text-muted-foreground">{t("fee_for", { category: t(`job_${category}`) })}</p>
        <p className="display mt-1 text-4xl text-accent tabular">
          {fee.currency} {fee.fees[category].toLocaleString("en-LK")}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t("pay_transfer")}</p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[0.9375rem]">
          {rows
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold text-fg">{value}</dd>
              </div>
            ))}
        </dl>
      </div>
      <Field label={t("payment_slip")} hint={t("payment_slip_hint")}>
        <input name="paymentSlip" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" className={fileClass} />
      </Field>
    </Section>
  );
}

function Submit({ sending, error, label, sendingLabel }: { sending: boolean; error: string | null; label: string; sendingLabel: string }) {
  return (
    <>
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-(--field-radius) border border-danger/50 bg-danger/10 px-4 py-3 font-medium text-fg">
          <AlertCircle size={20} className="mt-0.5 shrink-0 text-danger" aria-hidden /> {error}
        </p>
      )}
      <button type="submit" disabled={sending} className="btn btn-brand w-full sm:w-auto">
        <span>
          {sending && <Loader2 className="animate-spin" size={18} aria-hidden />}
          {sending ? sendingLabel : label}
        </span>
      </button>
    </>
  );
}

/** A field no person sees or tabs to; a bot that fills it in is quietly ignored by the server. */
const Honeypot = () => <input type="text" name="ksc_check" tabIndex={-1} autoComplete="off" aria-hidden className="absolute left-[-9999px] h-px w-px opacity-0" />;

export function JoinForm({ fee }: { fee: FeeInfo }) {
  const t = useTranslations("Membership");
  const { sending, done, error, submit } = useSubmit("/api/public/members");
  const [typedDob, setTypedDob] = useState("");
  const [nic, setNic] = useState("");
  const [gender, setGender] = useState("");
  const [category, setCategory] = useState<JobCategory>(JOB_CATEGORIES[0].value);
  const [jobOther, setJobOther] = useState("");

  // The NIC carries the date of birth (and male or female), so with one there is nothing to type.
  // Only someone under 16, who has no card yet, enters the date themselves.
  const fromNic = isValidNic(nic) ? nicBirthDate(nic) : null;
  const dob = fromNic ?? typedDob;
  const age = /^\d{4}-\d{2}-\d{2}$/.test(dob) ? computeAge(`${dob}T00:00:00Z`) : null;
  const minor = isMinor(age);
  const nicRequired = isNicRequired(age);
  const today = new Date();
  const latestBirthday = `${today.getUTCFullYear() - MIN_MEMBER_AGE}${today.toISOString().slice(4, 10)}`;
  const onNic = (value: string) => {
    setNic(value);
    const sex = nicGender(value);
    if (sex && !gender) setGender(sex);
  };

  if (done) return <Done title={t("success_title")} body={t("success_body")} />;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    submit(async () => {
      const data = new FormData(form);
      for (const name of ["photo", "paymentSlip"]) {
        const file = data.get(name);
        if (file instanceof File && file.size > 0) data.set(name, await prepare(file));
        else data.delete(name);
      }
      return data;
    });
  };

  return (
    <form onSubmit={onSubmit} className="live-card relative flex flex-col gap-10 p-6 md:p-10">
      <Honeypot />
      <Section title={t("section_personal")}>
        <Field label={t("full_name")}>
          <input name="fullName" required maxLength={120} autoComplete="name" className={inputClass} />
        </Field>
        <Field label={t("nic")} note={t("nic_optional")} hint={t("nic_hint")}>
          <input name="nic" required={nicRequired} pattern={NIC_PATTERN} maxLength={12} autoCapitalize="characters" spellCheck={false} value={nic} onChange={(e) => onNic(e.target.value)} className={inputClass} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("dob")} hint={fromNic ? t("dob_from_nic") : undefined}>
            <input
              name="dateOfBirth"
              type="date"
              required
              readOnly={!!fromNic}
              max={latestBirthday}
              value={dob}
              onChange={(e) => setTypedDob(e.target.value)}
              className={`${inputClass} read-only:cursor-default read-only:text-muted-foreground`}
            />
          </Field>
          <Field label={t("gender")}>
            <select name="gender" required value={gender} onChange={(e) => setGender(e.target.value)} className={inputClass}>
              <option value="" disabled>
                {t("gender_select")}
              </option>
              <option value="Male">{t("gender_male")}</option>
              <option value="Female">{t("gender_female")}</option>
              <option value="Other">{t("gender_other")}</option>
            </select>
          </Field>
        </div>
        <Occupation category={category} onCategory={setCategory} other={jobOther} onOther={setJobOther} />
        <Field label={t("photo")} hint={t("photo_hint")}>
          <input name="photo" type="file" required accept="image/jpeg,image/png,image/webp" className={fileClass} />
        </Field>
      </Section>

      <Section title={t("section_contact")}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("phone")} hint={t("phone_hint")}>
            <input name="phone" type="tel" required pattern={PHONE_PATTERN} autoComplete="tel" className={inputClass} />
          </Field>
          <Field label={t("whatsapp")} note={t("optional")}>
            <input name="whatsapp" type="tel" pattern={PHONE_PATTERN} className={inputClass} />
          </Field>
        </div>
        <Field label={t("email")} note={t("optional")}>
          <input name="email" type="email" maxLength={254} autoComplete="email" className={inputClass} />
        </Field>
        <Field label={t("address")}>
          <input name="address" required maxLength={300} autoComplete="street-address" className={inputClass} />
        </Field>
      </Section>

      {minor && (
        <Section title={t("section_guardian")}>
          <p className="text-sm text-muted-foreground">{t("guardian_hint")}</p>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("guardian_name")}>
              <input name="guardianName" required maxLength={120} className={inputClass} />
            </Field>
            <Field label={t("guardian_phone")}>
              <input name="guardianPhone" type="tel" required pattern={PHONE_PATTERN} className={inputClass} />
            </Field>
          </div>
        </Section>
      )}

      <Section title={t("section_membership")}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("member_type")}>
            <select name="memberType" className={inputClass}>
              <option value="Playing Member">{t("type_playing")}</option>
              <option value="Non-Playing Member">{t("type_non_playing")}</option>
              <option value="Junior Member">{t("type_junior")}</option>
              <option value="Coach / Staff">{t("type_coach")}</option>
            </select>
          </Field>
          <Field label={t("role")}>
            <select name="interest" defaultValue="" className={inputClass}>
              <option value="">{t("role_na")}</option>
              <option value="Batsman">{t("role_batsman")}</option>
              <option value="Bowler">{t("role_bowler")}</option>
              <option value="All-Rounder">{t("role_allrounder")}</option>
              <option value="Wicket Keeper">{t("role_wicketkeeper")}</option>
            </select>
          </Field>
        </div>
        <Field label={t("prev_club")} note={t("optional")}>
          <input name="previousClub" maxLength={120} className={inputClass} />
        </Field>
        <Field label={t("message")} note={t("optional")}>
          <textarea name="message" maxLength={1000} rows={4} placeholder={t("message_placeholder")} className={inputClass} />
        </Field>
      </Section>

      {fee && <Payment fee={fee} category={category} />}

      <label className="flex items-start gap-3 text-[0.9375rem] leading-relaxed text-muted-foreground">
        <input type="checkbox" name="consent" value="yes" required className="mt-1 h-5 w-5 shrink-0 accent-accent" />
        <span>{t("consent")}</span>
      </label>

      <Submit sending={sending} error={error} label={t("submit")} sendingLabel={t("submitting")} />
    </form>
  );
}

export function RenewForm({ fee }: { fee: FeeInfo }) {
  const t = useTranslations("Membership");
  const { sending, done, error, submit } = useSubmit("/api/public/members/renew");
  const [category, setCategory] = useState<JobCategory>(JOB_CATEGORIES[0].value);
  const [jobOther, setJobOther] = useState("");

  if (done) return <Done title={t("renew_success_title")} body={t("renew_success_body")} />;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    submit(async () => {
      const data = new FormData(form);
      const slip = data.get("paymentSlip");
      if (slip instanceof File && slip.size > 0) data.set("paymentSlip", await prepare(slip));
      else data.delete("paymentSlip");
      return data;
    });
  };

  return (
    <form onSubmit={onSubmit} className="live-card relative flex flex-col gap-10 p-6 md:p-10">
      <Honeypot />
      <Section title={t("section_membership")}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("phone")} hint={t("phone_hint")}>
            <input name="phone" type="tel" required pattern={PHONE_PATTERN} autoComplete="tel" className={inputClass} />
          </Field>
          <Field label={t("nic")} hint={t("renew_nic_hint")}>
            <input name="nic" pattern={NIC_PATTERN} maxLength={12} autoCapitalize="characters" spellCheck={false} className={inputClass} />
          </Field>
        </div>
        <Occupation category={category} onCategory={setCategory} other={jobOther} onOther={setJobOther} />
      </Section>
      {fee && <Payment fee={fee} category={category} />}
      <Submit sending={sending} error={error} label={t("renew_submit")} sendingLabel={t("submitting")} />
    </form>
  );
}
