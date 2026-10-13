"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { GENDERS, JOB_CATEGORIES, MEMBER_INTERESTS, MEMBER_TYPES, type MembershipSettings } from "@/lib/membership/rules";
import { shrinkImage } from "@/lib/upload-client";

/**
 * For someone who joined on paper. They are approved the moment they are saved:
 * member id issued, valid for a year. Only the name and a phone number are
 * needed; the rest can be filled in later from the member's page.
 */
export default function NewMemberPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<MembershipSettings | null>(null);
  const [jobCategory, setJobCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/membership-settings")
      .then((r) => r.json() as any)
      .then((d) => setSettings(d.settings ?? null))
      .catch(() => {});
  }, []);

  const feeNote = (category: (typeof JOB_CATEGORIES)[number]["value"]) => (settings?.feeEnabled ? ` — ${settings.currency} ${settings.fees[category].toLocaleString("en-LK")} a year` : "");

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const data = new FormData(e.currentTarget);
      const photo = data.get("photo");
      if (photo instanceof File && photo.size > 0) data.set("photo", await shrinkImage(photo));
      else data.delete("photo");
      const res = await fetch("/api/members", { method: "POST", body: data });
      const d = (await res.json()) as any;
      if (!res.ok) throw new Error(d.error);
      router.push(`/console/members/${d.member._id}`);
    } catch (e: any) {
      setError(e.message || "Could not save the member.");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button type="button" onClick={() => router.push("/console/members")} className="flex min-h-11 cursor-pointer items-center gap-2 text-muted-foreground transition-colors duration-200 hover:text-foreground">
        <ArrowLeft size={20} aria-hidden /> Back to members
      </button>
      <div>
        <h1 className="text-3xl text-foreground">Add a member</h1>
        <p className="text-muted-foreground">For someone who joined on paper. They are approved straight away, with a member ID and a year&apos;s validity.</p>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangle size={18} aria-hidden /> {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-card p-6 shadow-xs sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="fullName" className="field-label">Full name</label>
          <input id="fullName" name="fullName" required maxLength={120} className="field" />
        </div>
        <div>
          <label htmlFor="phone" className="field-label">Phone</label>
          <input id="phone" name="phone" type="tel" required className="field" placeholder="0771234567" />
        </div>
        <div>
          <label htmlFor="whatsapp" className="field-label">WhatsApp</label>
          <input id="whatsapp" name="whatsapp" type="tel" className="field" />
        </div>
        <div>
          <label htmlFor="dob" className="field-label">Date of birth</label>
          <input id="dob" name="dateOfBirth" type="date" max={new Date().toISOString().slice(0, 10)} className="field" />
        </div>
        <div>
          <label htmlFor="gender" className="field-label">Gender</label>
          <select id="gender" name="gender" defaultValue="" className="field">
            <option value="">Not given</option>
            {GENDERS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="nic" className="field-label">NIC number</label>
          <input id="nic" name="nic" maxLength={30} className="field" />
        </div>
        <div>
          <label htmlFor="email" className="field-label">Email</label>
          <input id="email" name="email" type="email" className="field" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="address" className="field-label">Address</label>
          <input id="address" name="address" maxLength={300} className="field" />
        </div>
        <div>
          <label htmlFor="guardianName" className="field-label">Guardian name (if under 18)</label>
          <input id="guardianName" name="guardianName" maxLength={120} className="field" />
        </div>
        <div>
          <label htmlFor="guardianPhone" className="field-label">Guardian phone</label>
          <input id="guardianPhone" name="guardianPhone" type="tel" className="field" />
        </div>
        <div>
          <label htmlFor="memberType" className="field-label">Member type</label>
          <select id="memberType" name="memberType" defaultValue="" className="field">
            <option value="">Not given</option>
            {MEMBER_TYPES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="interest" className="field-label">Playing role</label>
          <select id="interest" name="interest" defaultValue="" className="field">
            <option value="">Does not apply</option>
            {MEMBER_INTERESTS.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="jobCategory" className="field-label">Occupation</label>
          <select id="jobCategory" name="jobCategory" value={jobCategory} onChange={(e) => setJobCategory(e.target.value)} className="field">
            <option value="">Not given</option>
            {JOB_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
                {feeNote(c.value)}
              </option>
            ))}
          </select>
        </div>
        {jobCategory === "other" && (
          <div>
            <label htmlFor="jobOther" className="field-label">Which occupation?</label>
            <input id="jobOther" name="jobOther" required maxLength={80} className="field" />
          </div>
        )}
        <div className="sm:col-span-2">
          <label htmlFor="photo" className="field-label">Photo</label>
          <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="field h-auto py-2 text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:font-semibold" />
          <p className="mt-1.5 text-sm text-muted-foreground">Printed on the membership card. It can be left out, but the card will then show an initial.</p>
        </div>
        <div className="sm:col-span-2">
          <button type="submit" disabled={saving} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {saving && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {saving ? "Saving…" : "Add member"}
          </button>
        </div>
      </form>
    </div>
  );
}
