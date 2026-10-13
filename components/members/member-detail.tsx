"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, FileText, Loader2, Pencil, RefreshCw, Trash2, UserRound, XCircle } from "lucide-react";
import { ConfirmDialog } from "@/components/console/confirm-dialog";
import { GENDERS, isExpired, MEMBER_INTERESTS, MEMBER_TYPES } from "@/lib/membership/rules";
import { MembershipCard, type CardContact } from "./membership-card";

type Member = {
  _id: string;
  fullName: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  dateOfBirth?: string;
  age?: number;
  gender?: string;
  address?: string;
  nic?: string;
  memberType?: string;
  memberCode?: string;
  photoUrl?: string;
  guardianName?: string;
  guardianPhone?: string;
  previousClub?: string;
  interest?: string;
  message?: string;
  job?: string;
  annualFee?: number;
  paymentSlipUrl?: string;
  validFrom?: string;
  validUntil?: string;
  renewalStatus?: "none" | "pending";
  renewalJob?: string;
  renewalAnnualFee?: number;
  renewalPaymentSlipUrl?: string;
  renewalSubmittedAt?: string;
  status: "pending" | "approved" | "rejected";
  reviewNotes?: string;
  reviewedBy?: { email: string } | null;
  reviewedAt?: string;
  createdAt: string;
};

const STATUS_STYLES: Record<Member["status"], string> = {
  pending: "bg-warning/15 text-warning",
  approved: "bg-success/10 text-success",
  rejected: "bg-destructive/10 text-destructive",
};
const STATUS_LABELS: Record<Member["status"], string> = { pending: "Waiting", approved: "Approved", rejected: "Rejected" };

const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString("en-GB", { timeZone: "Asia/Colombo", day: "numeric", month: "short", year: "numeric" }) : undefined);
const money = (currency: string, amount?: number) => (amount != null ? `${currency} ${amount.toLocaleString("en-LK")}` : undefined);

/** The personal details an administrator may correct, as the form holds them. */
function toDraft(m: Member) {
  return {
    fullName: m.fullName,
    dateOfBirth: m.dateOfBirth?.slice(0, 10) ?? "",
    gender: m.gender ?? "",
    nic: m.nic ?? "",
    phone: m.phone,
    whatsapp: m.whatsapp ?? "",
    email: m.email ?? "",
    address: m.address ?? "",
    guardianName: m.guardianName ?? "",
    guardianPhone: m.guardianPhone ?? "",
    memberType: m.memberType ?? "",
    interest: m.interest ?? "",
    previousClub: m.previousClub ?? "",
    message: m.message ?? "",
  };
}

export default function MemberDetailPage({ contact, currency }: { contact: CardContact; currency: string }) {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [member, setMember] = useState<Member | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReturnType<typeof toDraft> | null>(null);
  const [renewalError, setRenewalError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const fetchMember = useCallback(async () => {
    try {
      const res = await fetch(`/api/members/${id}`);
      const d = (await res.json()) as any;
      if (!res.ok) throw new Error(d.error);
      setMember(d.member);
      setNotes(d.member.reviewNotes ?? "");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMember();
  }, [fetchMember]);

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/members/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = (await res.json()) as any;
      if (!res.ok) throw new Error(d.error);
      setMember(d.member);
      setNotes(d.member.reviewNotes ?? "");
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveDetails = async (e: FormEvent) => {
    e.preventDefault();
    if (draft && (await patch({ details: draft }))) setDraft(null);
  };

  const decideRenewal = async (action: "approve" | "reject") => {
    setSaving(true);
    setRenewalError(null);
    try {
      const res = await fetch(`/api/members/${id}/renewal`, { method: action === "approve" ? "POST" : "DELETE" });
      const d = (await res.json()) as any;
      if (!res.ok) throw new Error(d.error);
      setMember(d.member);
    } catch (e: any) {
      setRenewalError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setConfirmDeleteOpen(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/members/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(((await res.json()) as any).error);
      router.push("/console/members");
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin text-primary" size={40} aria-label="Loading" />
      </div>
    );
  if (!member) return <div className="p-12 text-center text-muted-foreground">{error ?? "Member not found"}</div>;

  const expired = member.status === "approved" && isExpired(member.validUntil);
  const rows: [string, string | undefined][] = [
    ["Member ID", member.memberCode],
    ["Phone", member.phone],
    ["WhatsApp", member.whatsapp],
    ["Email", member.email],
    ["NIC", member.nic],
    ["Date of birth", member.dateOfBirth ? `${formatDate(member.dateOfBirth)}${member.age != null ? ` (age ${member.age})` : ""}` : undefined],
    ["Gender", member.gender],
    ["Address", member.address],
    ["Guardian", member.guardianName],
    ["Guardian phone", member.guardianPhone],
    ["Member type", member.memberType],
    ["Playing role", member.interest],
    ["Previous club", member.previousClub],
    ["Occupation", member.job],
    ["Annual fee", money(currency, member.annualFee)],
    ["Valid from", formatDate(member.validFrom)],
    ["Valid until", formatDate(member.validUntil)],
  ];
  const set = (name: keyof NonNullable<typeof draft>) => (e: { target: { value: string } }) => setDraft((d) => (d ? { ...d, [name]: e.target.value } : d));

  return (
    <div className="space-y-6">
      <button type="button" onClick={() => router.push("/console/members")} className="flex min-h-11 cursor-pointer items-center gap-2 text-muted-foreground transition-colors duration-200 hover:text-foreground print:hidden">
        <ArrowLeft size={20} aria-hidden /> Back to members
      </button>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive print:hidden">
          <AlertTriangle size={18} aria-hidden /> {error}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div className="flex items-start gap-4">
          {member.photoUrl ? (
            <a href={member.photoUrl} target="_blank" rel="noopener noreferrer" aria-label="Open the photo">
              {/* eslint-disable-next-line @next/next/no-img-element -- a private file behind the signed-in route */}
              <img src={member.photoUrl} alt="" className="size-20 rounded-lg object-cover" />
            </a>
          ) : (
            <div className="flex size-20 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <UserRound size={32} aria-hidden />
            </div>
          )}
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl text-foreground">{member.fullName}</h1>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLES[member.status]}`}>{STATUS_LABELS[member.status]}</span>
              {expired && <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">Expired</span>}
            </div>
            <p className="text-muted-foreground">
              Applied {formatDate(member.createdAt)}
              {member.reviewedBy && member.reviewedAt ? ` · Reviewed by ${member.reviewedBy.email} on ${formatDate(member.reviewedAt)}` : ""}
            </p>
          </div>
        </div>
        <button type="button" onClick={() => setConfirmDeleteOpen(true)} disabled={saving} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-destructive/30 px-4 font-medium text-destructive transition-colors duration-200 hover:bg-destructive/10 disabled:opacity-60">
          <Trash2 size={16} aria-hidden /> Delete
        </button>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={remove}
        title="Delete this member?"
        description={`${member.fullName}'s record, photo and payment slips will be removed. This can't be undone.`}
        confirmLabel="Delete"
        tone="danger"
      />

      {member.renewalStatus === "pending" && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-6 shadow-xs print:hidden">
          <div className="mb-3 flex items-center gap-2">
            <RefreshCw size={18} className="text-warning" aria-hidden />
            <h2 className="text-lg text-foreground">Renewal waiting</h2>
          </div>
          {renewalError && (
            <div role="alert" className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle size={16} aria-hidden /> {renewalError}
            </div>
          )}
          <dl className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(
              [
                ["Occupation", member.renewalJob],
                ["Fee", money(currency, member.renewalAnnualFee) ?? "No fee"],
                ["Sent", formatDate(member.renewalSubmittedAt)],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
                <dd className="mt-0.5 text-foreground">{value ?? "—"}</dd>
              </div>
            ))}
          </dl>
          {member.renewalPaymentSlipUrl && (
            <a href={member.renewalPaymentSlipUrl} target="_blank" rel="noopener noreferrer" className="mb-4 inline-flex min-h-11 items-center gap-1.5 font-medium text-foreground underline underline-offset-4">
              <FileText size={14} aria-hidden /> View the renewal payment slip
            </a>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => decideRenewal("approve")} disabled={saving} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-success px-4 font-semibold text-on-danger transition-colors duration-200 hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-50">
              <CheckCircle2 size={16} aria-hidden /> Approve renewal
            </button>
            <button type="button" onClick={() => decideRenewal("reject")} disabled={saving} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-destructive/30 bg-card px-4 font-semibold text-destructive transition-colors duration-200 hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50">
              <XCircle size={16} aria-hidden /> Reject renewal
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3 print:hidden">
        <div className="rounded-lg border border-border bg-card p-6 shadow-xs lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg text-foreground">Details</h2>
            {!draft && (
              <button type="button" onClick={() => setDraft(toDraft(member))} className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted">
                <Pencil size={14} aria-hidden /> Edit
              </button>
            )}
          </div>

          {draft ? (
            <form onSubmit={saveDetails} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="fullName" className="field-label">Full name</label>
                <input id="fullName" required maxLength={120} className="field" value={draft.fullName} onChange={set("fullName")} />
              </div>
              <div>
                <label htmlFor="dob" className="field-label">Date of birth</label>
                <input id="dob" type="date" className="field" value={draft.dateOfBirth} onChange={set("dateOfBirth")} />
              </div>
              <div>
                <label htmlFor="gender" className="field-label">Gender</label>
                <select id="gender" className="field" value={draft.gender} onChange={set("gender")}>
                  <option value="">Not given</option>
                  {GENDERS.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="nic" className="field-label">NIC number</label>
                <input id="nic" maxLength={30} className="field" value={draft.nic} onChange={set("nic")} />
              </div>
              <div>
                <label htmlFor="phone" className="field-label">Phone</label>
                <input id="phone" type="tel" required className="field" value={draft.phone} onChange={set("phone")} />
              </div>
              <div>
                <label htmlFor="whatsapp" className="field-label">WhatsApp</label>
                <input id="whatsapp" type="tel" className="field" value={draft.whatsapp} onChange={set("whatsapp")} />
              </div>
              <div>
                <label htmlFor="email" className="field-label">Email</label>
                <input id="email" type="email" className="field" value={draft.email} onChange={set("email")} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="address" className="field-label">Address</label>
                <input id="address" maxLength={300} className="field" value={draft.address} onChange={set("address")} />
              </div>
              <div>
                <label htmlFor="guardianName" className="field-label">Guardian name</label>
                <input id="guardianName" maxLength={120} className="field" value={draft.guardianName} onChange={set("guardianName")} />
              </div>
              <div>
                <label htmlFor="guardianPhone" className="field-label">Guardian phone</label>
                <input id="guardianPhone" type="tel" className="field" value={draft.guardianPhone} onChange={set("guardianPhone")} />
              </div>
              <div>
                <label htmlFor="memberType" className="field-label">Member type</label>
                <select id="memberType" className="field" value={draft.memberType} onChange={set("memberType")}>
                  <option value="">Not given</option>
                  {MEMBER_TYPES.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="interest" className="field-label">Playing role</label>
                <select id="interest" className="field" value={draft.interest} onChange={set("interest")}>
                  <option value="">Does not apply</option>
                  {MEMBER_INTERESTS.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="previousClub" className="field-label">Previous club</label>
                <input id="previousClub" maxLength={120} className="field" value={draft.previousClub} onChange={set("previousClub")} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="message" className="field-label">Message</label>
                <textarea id="message" maxLength={1000} className="field" value={draft.message} onChange={set("message")} />
              </div>
              <div className="flex gap-3 sm:col-span-2">
                <button type="submit" disabled={saving} className="min-h-11 cursor-pointer rounded-lg bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                  {saving ? "Saving…" : "Save details"}
                </button>
                <button type="button" onClick={() => setDraft(null)} className="min-h-11 cursor-pointer rounded-lg border border-border px-5 font-semibold hover:bg-muted">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {rows
                  .filter(([, v]) => v)
                  .map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
                      <dd className="mt-0.5 break-words text-foreground">{value}</dd>
                    </div>
                  ))}
              </dl>
              {member.message && (
                <div className="mt-4">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Message</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-foreground">{member.message}</p>
                </div>
              )}
              {member.paymentSlipUrl && (
                <a href={member.paymentSlipUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-1.5 font-medium text-foreground underline underline-offset-4">
                  <FileText size={14} aria-hidden /> View the payment slip
                </a>
              )}
            </>
          )}
        </div>

        <div className="space-y-4 self-start rounded-lg border border-border bg-card p-6 shadow-xs">
          <div>
            <label htmlFor="notes" className="field-label">Review notes</label>
            <textarea id="notes" maxLength={1000} className="field min-h-24" placeholder="Optional. Only administrators see this." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <button type="button" onClick={() => patch({ status: "approved", reviewNotes: notes })} disabled={saving || member.status === "approved"} className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-success font-semibold text-on-danger transition-colors duration-200 hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-50">
            <CheckCircle2 size={18} aria-hidden /> Approve
          </button>
          <button type="button" onClick={() => patch({ status: "rejected", reviewNotes: notes })} disabled={saving || member.status === "rejected"} className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-destructive/30 font-semibold text-destructive transition-colors duration-200 hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50">
            <XCircle size={18} aria-hidden /> Reject
          </button>
          {notes !== (member.reviewNotes ?? "") && (
            <button type="button" onClick={() => patch({ reviewNotes: notes })} disabled={saving} className="min-h-11 w-full cursor-pointer rounded-lg border border-border font-semibold hover:bg-muted disabled:opacity-50">
              Save notes only
            </button>
          )}
          {member.status !== "pending" && (
            <button type="button" onClick={() => patch({ status: "pending", reviewNotes: notes })} disabled={saving} className="min-h-10 w-full cursor-pointer rounded-lg text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground disabled:opacity-50">
              Put back to waiting
            </button>
          )}
        </div>
      </div>

      {member.status === "approved" && <MembershipCard member={member} contact={contact} />}
    </div>
  );
}
