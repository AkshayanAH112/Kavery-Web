"use client";

import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Bilingual, Contact, Officer, SiteSettings } from "@/lib/site-settings";
import { Button, Card, CardHeader, Field, Note, fieldClass } from "./ui";

const textareaClass = `${fieldClass} min-h-32 py-2.5`;

function BilingualText({ label, hint, value, onChange, rows = 5 }: { label: string; hint?: string; value: Bilingual; onChange: (v: Bilingual) => void; rows?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label={`${label} — English`} hint={hint}>
        <textarea className={textareaClass} rows={rows} value={value.en} onChange={(e) => onChange({ ...value, en: e.target.value })} />
      </Field>
      <Field label={`${label} — தமிழ்`}>
        <textarea lang="ta" className={textareaClass} rows={rows} value={value.ta} onChange={(e) => onChange({ ...value, ta: e.target.value })} />
      </Field>
    </div>
  );
}

/** Everything on the public site that only the club can supply: contact lines, About text, office bearers. */
export function SiteSettingsForm({ initial }: { initial: SiteSettings }) {
  const [settings, setSettings] = useState(initial);
  const [grades, setGrades] = useState(initial.kedaGrades.join(", "));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const update = (change: Partial<SiteSettings>) => {
    setMessage(null);
    setSettings((s) => ({ ...s, ...change }));
  };
  const setOfficer = (index: number, change: Partial<Officer>) => update({ officers: settings.officers.map((o, i) => (i === index ? { ...o, ...change } : o)) });
  const setContact = (index: number, change: Partial<Contact>) => update({ contacts: settings.contacts.map((c, i) => (i === index ? { ...c, ...change } : c)) });

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/site-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...settings, kedaGrades: grades.split(/[\s,]+/).filter(Boolean).map(Number) }),
      });
      const data = (await res.json()) as { error?: string; settings?: SiteSettings };
      if (!res.ok || !data.settings) throw new Error(data.error ?? "Could not save. Try again.");
      setSettings(data.settings);
      setGrades(data.settings.kedaGrades.join(", "));
      setMessage({ tone: "success", text: "Saved. The public site shows the new details straight away." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not save. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <Card className="space-y-5 p-6">
        <CardHeader title="Contact" description="Shown in the footer of every page and on the About page. Leave a line empty to hide it." />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Email">
            <input type="email" className={fieldClass} value={settings.contactEmail} onChange={(e) => update({ contactEmail: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input type="tel" className={fieldClass} value={settings.contactPhone} onChange={(e) => update({ contactPhone: e.target.value })} />
          </Field>
          <Field label="Address">
            <input className={fieldClass} value={settings.address} onChange={(e) => update({ address: e.target.value })} />
          </Field>
          <Field label="Facebook page" hint="The full link, starting with https://">
            <input type="url" className={fieldClass} value={settings.facebookUrl} onChange={(e) => update({ facebookUrl: e.target.value })} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-5 p-6">
        <CardHeader title="About the club" description="The club's story in its own words, for the About page. A blank line starts a new paragraph. Left empty, the page uses the short standard wording." />
        <BilingualText label="About Kavery Sports Club" value={settings.aboutClub} onChange={(aboutClub) => update({ aboutClub })} />
      </Card>

      <Card className="space-y-5 p-6">
        <CardHeader title="About KEDA" description="The education wing's section of the About page." />
        <BilingualText label="About KEDA" value={settings.aboutKeda} onChange={(aboutKeda) => update({ aboutKeda })} />
        <BilingualText label="Class days, times and place" hint="For example: Saturdays and Sundays, 8.30 am, at the school hall." value={settings.classInfo} onChange={(classInfo) => update({ classInfo })} rows={2} />
        <Field label="Grades taught" hint="Numbers separated by commas, for example 4, 5">
          <input className={`${fieldClass} max-w-xs`} inputMode="numeric" value={grades} onChange={(e) => setGrades(e.target.value)} />
        </Field>
      </Card>

      <Card className="space-y-5 p-6">
        <CardHeader
          title="Office bearers"
          description="Listed on the About page in this order. Add only people who have agreed to be named on the website."
          action={
            <Button variant="secondary" onClick={() => update({ officers: [...settings.officers, { org: "ksc", role: "", name: "" }] })}>
              <Plus size={16} aria-hidden /> Add
            </Button>
          }
        />
        {settings.officers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody is listed yet, so the About page shows no office bearers.</p>
        ) : (
          <ul className="space-y-3">
            {settings.officers.map((officer, i) => (
              <li key={i} className="grid gap-3 sm:grid-cols-[9rem_1fr_1fr_auto] sm:items-end">
                <Field label="Belongs to">
                  <select className={fieldClass} value={officer.org} onChange={(e) => setOfficer(i, { org: e.target.value === "keda" ? "keda" : "ksc" })}>
                    <option value="ksc">Club</option>
                    <option value="keda">KEDA</option>
                  </select>
                </Field>
                <Field label="Role">
                  <input className={fieldClass} maxLength={80} placeholder="President" value={officer.role} onChange={(e) => setOfficer(i, { role: e.target.value })} />
                </Field>
                <Field label="Name">
                  <input className={fieldClass} maxLength={80} value={officer.name} onChange={(e) => setOfficer(i, { name: e.target.value })} />
                </Field>
                <Button variant="danger" aria-label={`Remove ${officer.name || "this person"}`} onClick={() => update({ officers: settings.officers.filter((_, j) => j !== i) })}>
                  <Trash2 size={16} aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-5 p-6">
        <CardHeader
          title="Contact people"
          description="Shown in the Contact section of the About page, under the club or KEDA, with buttons to call and to message on WhatsApp. Add only people who have agreed to have their number on the website."
          action={
            <Button variant="secondary" onClick={() => update({ contacts: [...settings.contacts, { org: "ksc", name: "", phone: "" }] })}>
              <Plus size={16} aria-hidden /> Add
            </Button>
          }
        />
        {settings.contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody is listed yet, so the About page shows only the phone number above.</p>
        ) : (
          <ul className="space-y-3">
            {settings.contacts.map((contact, i) => (
              <li key={i} className="grid gap-3 sm:grid-cols-[9rem_1fr_1fr_auto] sm:items-end">
                <Field label="For">
                  <select className={fieldClass} value={contact.org} onChange={(e) => setContact(i, { org: e.target.value === "keda" ? "keda" : "ksc" })}>
                    <option value="ksc">Club</option>
                    <option value="keda">KEDA</option>
                  </select>
                </Field>
                <Field label="Name">
                  <input className={fieldClass} maxLength={80} value={contact.name} onChange={(e) => setContact(i, { name: e.target.value })} />
                </Field>
                <Field label="Phone">
                  <input type="tel" className={fieldClass} maxLength={24} placeholder="+94 77 123 4567" value={contact.phone} onChange={(e) => setContact(i, { phone: e.target.value })} />
                </Field>
                <Button variant="danger" aria-label={`Remove ${contact.name || "this person"}`} onClick={() => update({ contacts: settings.contacts.filter((_, j) => j !== i) })}>
                  <Trash2 size={16} aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {message && <Note tone={message.tone}>{message.text}</Note>}
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save details"}
      </Button>
    </form>
  );
}
