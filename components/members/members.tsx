"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RefreshCw, Search, Settings, UserCog } from "lucide-react";
import { isExpired } from "@/lib/membership/rules";

type Member = {
  _id: string;
  fullName: string;
  phone: string;
  memberCode?: string;
  memberType?: string;
  photoUrl?: string;
  status: "pending" | "approved" | "rejected";
  renewalStatus: "none" | "pending";
  validUntil?: string;
  createdAt: string;
};

const FILTERS = [
  { value: "status=pending", label: "Waiting" },
  { value: "renewal=pending", label: "Renewals" },
  { value: "status=approved", label: "Approved" },
  { value: "status=rejected", label: "Rejected" },
  { value: "", label: "All" },
];

const STATUS_STYLES: Record<Member["status"] | "expired", string> = {
  pending: "bg-warning/15 text-warning",
  approved: "bg-success/10 text-success",
  rejected: "bg-destructive/10 text-destructive",
  expired: "bg-muted text-muted-foreground",
};

const formatDate = (value: string) => new Date(value).toLocaleDateString("en-GB", { timeZone: "Asia/Colombo", day: "numeric", month: "short", year: "numeric" });

export default function MembersListPage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState(FILTERS[0].value);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/members${filter ? `?${filter}` : ""}`)
      .then((r) => r.json() as any)
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setMembers(d.members ?? []);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filter]);

  const term = searchQuery.trim().toLowerCase();
  const filteredMembers = term ? members.filter((m) => m.fullName.toLowerCase().includes(term) || m.phone.includes(term) || (m.memberCode ?? "").toLowerCase().includes(term)) : members;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl text-foreground">Club members</h1>
          <p className="text-muted-foreground">Applications sent from the website, and anyone added here directly.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/console/members/settings" className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-4 font-semibold text-foreground transition-colors duration-200 hover:bg-muted">
            <Settings size={18} aria-hidden /> Fees and settings
          </Link>
          <Link href="/console/members/new" className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary/90">
            <Plus size={18} aria-hidden /> Add member
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={`min-h-10 cursor-pointer rounded-lg px-4 text-sm font-medium transition-colors duration-200 ${filter === f.value ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:bg-muted"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative lg:w-72">
          <Search className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" size={16} aria-hidden />
          <input type="search" aria-label="Search members" placeholder="Name, phone or member ID" className="field pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="animate-spin text-primary" size={40} aria-label="Loading" />
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-16 text-center">
          <UserCog size={40} className="text-muted-foreground opacity-50" aria-hidden />
          <p className="text-muted-foreground">{term ? `No members match "${searchQuery}".` : "Nothing here at the moment."}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary font-medium text-secondary-foreground">
                <tr>
                  <th className="px-4 py-3">
                    <span className="sr-only">Photo</span>
                  </th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Member ID</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Applied</th>
                  <th className="px-4 py-3">Valid until</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredMembers.map((m) => {
                  const expired = m.status === "approved" && isExpired(m.validUntil);
                  return (
                    <tr key={m._id} className="cursor-pointer transition-colors duration-200 hover:bg-muted" onClick={() => router.push(`/console/members/${m._id}`)}>
                      <td className="px-4 py-2.5">
                        {m.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- a private file behind the signed-in route
                          <img src={m.photoUrl} alt="" loading="lazy" className="size-9 rounded-full object-cover" />
                        ) : (
                          <div className="size-9 rounded-full bg-muted" />
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-foreground">
                        <Link href={`/console/members/${m._id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                          {m.fullName}
                        </Link>
                        {m.memberType && <span className="block text-xs font-normal text-muted-foreground">{m.memberType}</span>}
                      </td>
                      <td className="tabular px-4 py-2.5 text-muted-foreground">{m.memberCode ?? "—"}</td>
                      <td className="tabular px-4 py-2.5 text-muted-foreground">{m.phone}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{formatDate(m.createdAt)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{m.validUntil ? formatDate(m.validUntil) : "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${STATUS_STYLES[expired ? "expired" : m.status]}`}>{expired ? "Expired" : m.status === "pending" ? "Waiting" : m.status}</span>
                          {m.renewalStatus === "pending" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-bold text-warning">
                              <RefreshCw size={11} aria-hidden /> Renewal
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
