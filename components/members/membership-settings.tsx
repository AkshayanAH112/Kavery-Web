"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { JOB_CATEGORIES, type MembershipSettings } from "@/lib/membership/rules";

function Toggle({ id, checked, onChange, title, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; title: string; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand)]" />
      <span>
        <span className="block font-semibold text-foreground">{title}</span>
        <span className="block text-sm text-muted-foreground">{children}</span>
      </span>
    </label>
  );
}

/** Whether the club takes applications online, whether it charges, how much, and where the money goes. */
export default function MembershipSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<MembershipSettings | null>(null);
  // Fees are typed as text so a box can be emptied while a new amount is entered.
  const [fees, setFees] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = (s: MembershipSettings) => {
    setSettings(s);
    setFees(Object.fromEntries(JOB_CATEGORIES.map((c) => [c.value, String(s.fees[c.value])])));
  };

  useEffect(() => {
    fetch("/api/membership-settings")
      .then((r) => r.json() as any)
      .then((d) => {
        if (d.error) throw new Error(d.error);
        load(d.settings);
      })
      .catch((e) => setError(e.message));
  }, []);

  const update = (change: Partial<MembershipSettings>) => {
    setSaved(false);
    setSettings((s) => (s ? { ...s, ...change } : s));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/membership-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...settings, fees: Object.fromEntries(JOB_CATEGORIES.map((c) => [c.value, Number(fees[c.value])])) }) });
      const d = (await res.json()) as any;
      if (!res.ok) throw new Error(d.error);
      load(d.settings);
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button type="button" onClick={() => router.push("/console/members")} className="flex min-h-11 cursor-pointer items-center gap-2 text-muted-foreground transition-colors duration-200 hover:text-foreground">
        <ArrowLeft size={20} aria-hidden /> Back to members
      </button>
      <div>
        <h1 className="text-3xl text-foreground">Fees and settings</h1>
        <p className="text-muted-foreground">What the join and renew forms on the website ask for. Changes apply to the next person who opens them.</p>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangle size={18} aria-hidden /> {error}
        </div>
      )}

      {!settings ? (
        !error && (
          <div className="flex justify-center p-12">
            <Loader2 className="animate-spin text-primary" size={40} aria-label="Loading" />
          </div>
        )
      ) : (
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="space-y-5 rounded-lg border border-border bg-card p-6 shadow-xs">
            <Toggle id="open" checked={settings.open} onChange={(open) => update({ open })} title="Take applications and renewals on the website">
              When this is off, the join and renew pages ask people to contact the club instead.
            </Toggle>
            <Toggle id="feeEnabled" checked={settings.feeEnabled} onChange={(feeEnabled) => update({ feeEnabled })} title="Charge an annual membership fee">
              When this is on, applicants are shown the fee and the bank account below, and must upload their payment slip. When it is off, joining is free and no slip is asked for.
            </Toggle>
          </div>

          <fieldset disabled={!settings.feeEnabled} className="space-y-6 disabled:opacity-60">
            <div className="rounded-lg border border-border bg-card p-6 shadow-xs">
              <h2 className="text-lg text-foreground">Annual fee</h2>
              <p className="mb-4 text-sm text-muted-foreground">Set by the applicant&apos;s occupation. The amount is always worked out here, never taken from what the form sends.</p>
              <div className="grid gap-4 sm:grid-cols-4">
                <div>
                  <label htmlFor="currency" className="field-label">Currency</label>
                  <input id="currency" maxLength={8} className="field" value={settings.currency} onChange={(e) => update({ currency: e.target.value })} />
                </div>
                {JOB_CATEGORIES.map((c) => (
                  <div key={c.value}>
                    <label htmlFor={`fee-${c.value}`} className="field-label">{c.label}</label>
                    <input
                      id={`fee-${c.value}`}
                      type="number"
                      min={0}
                      max={1000000}
                      step={1}
                      required
                      className="field tabular"
                      value={fees[c.value] ?? ""}
                      onChange={(e) => {
                        setSaved(false);
                        setFees((f) => ({ ...f, [c.value]: e.target.value }));
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-6 shadow-xs">
              <h2 className="text-lg text-foreground">Bank account for payments</h2>
              <p className="mb-4 text-sm text-muted-foreground">Shown to anyone who opens the join form, so enter only the club&apos;s own account.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["accountName", "Account name", true],
                    ["accountNumber", "Account number", true],
                    ["bankName", "Bank", true],
                    ["branch", "Branch", false],
                  ] as const
                ).map(([name, label, required]) => (
                  <div key={name}>
                    <label htmlFor={name} className="field-label">{label}</label>
                    <input id={name} required={required && settings.feeEnabled} maxLength={120} className="field" value={settings.bank[name]} onChange={(e) => update({ bank: { ...settings.bank, [name]: e.target.value } })} />
                  </div>
                ))}
              </div>
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" disabled={saving} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {saving && <Loader2 size={16} className="animate-spin" aria-hidden />}
              {saving ? "Saving…" : "Save settings"}
            </button>
            {saved && (
              <p role="status" className="flex items-center gap-1.5 text-sm font-semibold text-success">
                <CheckCircle2 size={16} aria-hidden /> Saved
              </p>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
