"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import {
  Loader2,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Download,
  Search,
  Phone,
  Filter,
  UserX,
  Trash2,
} from "lucide-react";
import { ConfirmDialog, AlertModal } from "@/components/console/confirm-dialog";
import { useCurrentUser } from "@/components/console/current-user";
import { searchText } from "@/lib/keda/bamini";

type NotificationStatus = "pending" | "acknowledged" | "resolved" | "all";
type NotificationType = "all" | "parent_warning" | "admin_critical";
type StudentAction = { notificationId: string; studentId: string; studentName: string };

const STATUS_TABS: { key: NotificationStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All Statuses" },
];

const TYPE_FILTERS: { key: NotificationType; label: string; icon: typeof AlertTriangle }[] = [
  { key: "all", label: "All Leaves", icon: Filter },
  { key: "parent_warning", label: "At 2 Leaves (Parent Warning)", icon: AlertTriangle },
  { key: "admin_critical", label: "At 3 Leaves (Admin Action)", icon: ShieldAlert },
];

export default function NotificationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center p-12">
          <Loader2 className="animate-spin text-primary" size={40} />
        </div>
      }
    >
      <NotificationsContent />
    </Suspense>
  );
}

function NotificationsContent() {
  const searchParams = useSearchParams();
  const initialType = (searchParams.get("type") as NotificationType) || "all";
  const initialStatus = (searchParams.get("status") as NotificationStatus) || "pending";

  const [statusTab, setStatusTab] = useState<NotificationStatus>(initialStatus);
  const [typeFilter, setTypeFilter] = useState<NotificationType>(initialType);
  const [searchQuery, setSearchQuery] = useState("");
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useCurrentUser();
  // The student a 3-leave card is about to act on. `notificationId` rides along
  // so deactivating can close the alert in the same step.
  const [deactivateTarget, setDeactivateTarget] = useState<StudentAction | null>(null);
  const [removeTarget, setRemoveTarget] = useState<StudentAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchData = async (status: NotificationStatus, type: NotificationType) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ expand: "student" });
      if (status !== "all") params.set("status", status);
      if (type !== "all") params.set("type", type);
      const res = await fetch(`/api/notifications?${params}`);
      const data = await res.json() as any;
      setNotifications(data.notifications || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(statusTab, typeFilter);
  }, [statusTab, typeFilter]);

  const updateStatus = async (id: string, status: "pending" | "acknowledged" | "resolved") => {
    await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchData(statusTab, typeFilter);
  };

  // Deactivating is the answer to a 3-leave alert, so the alert is resolved
  // with it rather than left pending for a second tap.
  const deactivateStudent = async () => {
    if (!deactivateTarget) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/students/${deactivateTarget.studentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      if (!res.ok) throw new Error((await res.json() as any).error ?? "Failed to deactivate");
      await fetch(`/api/notifications/${deactivateTarget.notificationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      });
      setDeactivateTarget(null);
      fetchData(statusTab, typeFilter);
    } catch (e: any) {
      setDeactivateTarget(null);
      setActionError(e.message);
    } finally {
      setActionBusy(false);
    }
  };

  // A student at 3 leaves always has attendance rows, so a plain DELETE would
  // only ever come back 409 — this goes straight to the admin-only force delete,
  // which also erases the student's notifications (this card included).
  const removeStudent = async () => {
    if (!removeTarget) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/students/${removeTarget.studentId}?force=true`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json() as any).error ?? "Failed to remove");
      setRemoveTarget(null);
      fetchData(statusTab, typeFilter);
    } catch (e: any) {
      setRemoveTarget(null);
      setActionError(e.message);
    } finally {
      setActionBusy(false);
    }
  };

  const query = searchText(searchQuery.trim());
  const filtered = notifications.filter((n) => {
    const studentObj = typeof n.studentId === "object" ? n.studentId : null;
    const phone = studentObj?.guardianPhone ?? "";
    return (
      searchText(n.studentName ?? "").includes(query) ||
      (n.registrationNumber ?? "").toLowerCase().includes(query) ||
      phone.toLowerCase().includes(query)
    );
  });

  const downloadExcel = () => {
    if (filtered.length === 0) return;

    const header = [
      "Registration Number",
      "Student Name",
      "Batch",
      "Grade",
      "Leave Count",
      "Alert Type",
      "Status",
      "Leave Dates",
      "Guardian Name",
      "Guardian Phone",
      "Alert Date",
    ];

    const sheetRows = filtered.map((n) => {
      const studentObj = typeof n.studentId === "object" ? n.studentId : null;
      const guardianName = studentObj?.guardianName || "—";
      const guardianPhone = studentObj?.guardianPhone || "—";
      const batchName = studentObj?.batchId?.name || "—";
      const grade = studentObj?.grade ? `Grade ${studentObj.grade}` : "—";
      const alertType =
        n.type === "admin_critical" ? "Admin Action Required (3 Leaves)" : "Parent Notification Pending (2 Leaves)";
      const statusLabel = n.status ? n.status.charAt(0).toUpperCase() + n.status.slice(1) : "—";
      const dates = (n.leaveDates || []).map((d: string) => new Date(d).toLocaleDateString()).join(", ");

      return [
        n.registrationNumber || "—",
        n.studentName || "—",
        batchName,
        grade,
        n.leaveCount,
        alertType,
        statusLabel,
        dates || "—",
        guardianName,
        guardianPhone,
        new Date(n.createdAt).toLocaleString(),
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...sheetRows]);
    ws["!cols"] = [
      { wch: 18 },
      { wch: 25 },
      { wch: 18 },
      { wch: 12 },
      { wch: 12 },
      { wch: 32 },
      { wch: 15 },
      { wch: 30 },
      { wch: 22 },
      { wch: 18 },
      { wch: 22 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leave Alerts");
    const safeType = typeFilter === "all" ? "All_Leaves" : typeFilter === "parent_warning" ? "At_2_Leaves" : "At_3_Leaves";
    XLSX.writeFile(wb, `KEDA_Leave_Notifications_${safeType}_${statusTab}.xlsx`);
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Attendance Notifications</h1>
          <p className="text-muted-foreground">Parent-warning and administrative alerts from the leave-tracking system.</p>
        </div>
        <button
          onClick={downloadExcel}
          disabled={filtered.length === 0}
          className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-primary px-4 py-2 font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
          title={filtered.length === 0 ? "No records to download" : "Download current list as Excel"}
        >
          <Download size={18} /> Download Excel ({filtered.length})
        </button>
      </div>

      {/* Leave Type Filters: All, At 2 Leaves, At 3 Leaves */}
      <div className="flex flex-wrap gap-2">
        {TYPE_FILTERS.map((f) => {
          const Icon = f.icon;
          const isActive = typeFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setTypeFilter(f.key)}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                isActive
                  ? f.key === "admin_critical"
                    ? "bg-destructive text-destructive-foreground shadow-xs"
                    : f.key === "parent_warning"
                    ? "bg-warning text-warning-foreground shadow-xs"
                    : "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              <Icon size={14} />
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Status Tabs and Search Bar */}
      <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatusTab(t.key)}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                statusTab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            type="text"
            placeholder="Search student or phone..."
            className="field pl-9 py-1.5 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="animate-spin text-primary" size={40} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-16 text-center">
          <CheckCircle2 size={40} className="text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">
            No {statusTab === "all" ? "" : statusTab} notifications
            {typeFilter !== "all" ? ` for ${typeFilter === "parent_warning" ? "2 leaves" : "3 leaves"}` : ""}.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => {
            const studentObj = typeof n.studentId === "object" ? n.studentId : null;
            const studentIdStr = studentObj?._id ?? n.studentId;
            const guardianName = studentObj?.guardianName;
            const guardianPhone = studentObj?.guardianPhone;
            const batchName = studentObj?.batchId?.name;

            return (
              <div key={n._id} className="rounded-lg border border-border bg-card p-5 shadow-xs">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 rounded-lg p-2 ${
                        n.type === "admin_critical"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-warning/15 text-warning"
                      }`}
                    >
                      {n.type === "admin_critical" ? <ShieldAlert size={18} /> : <AlertTriangle size={18} />}
                    </span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-foreground">
                          {n.type === "admin_critical"
                            ? "Administrative action required"
                            : "Parent notification required"}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                            n.status === "pending"
                              ? "bg-warning/15 text-warning"
                              : n.status === "acknowledged"
                              ? "bg-primary/10 text-primary"
                              : "bg-success/15 text-success"
                          }`}
                        >
                          {n.status}
                        </span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Link
                          href={`/console/students/${studentIdStr}`}
                          className="text-sm font-bold text-primary hover:underline"
                        >
                          {n.registrationNumber || "—"} — {n.studentName}
                        </Link>
                        {studentObj?.isActive === false && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                            Deactivated
                          </span>
                        )}
                        {batchName && (
                          <span className="text-xs text-muted-foreground">({batchName})</span>
                        )}
                      </div>

                      <p className="mt-1 text-sm text-muted-foreground">
                        Reached <strong className="text-foreground">{n.leaveCount} leaves</strong>. Dates:{" "}
                        {(n.leaveDates || []).map((d: string) => new Date(d).toLocaleDateString()).join(", ")}
                      </p>

                      {(guardianName || guardianPhone) && (
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          {guardianName && <span>Guardian: <strong className="text-foreground">{guardianName}</strong></span>}
                          {guardianPhone && (
                            <a
                              href={`tel:${guardianPhone}`}
                              className="inline-flex items-center gap-1 font-mono font-medium text-primary hover:underline"
                            >
                              <Phone size={12} />
                              {guardianPhone}
                            </a>
                          )}
                        </div>
                      )}

                      <p className="mt-2 text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
                    {n.status === "pending" && (
                      <button
                        onClick={() => updateStatus(n._id, "acknowledged")}
                        className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                      >
                        Acknowledge
                      </button>
                    )}
                    {n.status !== "resolved" && (
                      <button
                        onClick={() => updateStatus(n._id, "resolved")}
                        className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        Resolve
                      </button>
                    )}
                    {/* Only the 3-leave alert asks for a decision about the student
                        themselves; studentObj is null once the student is deleted. */}
                    {n.type === "admin_critical" && studentObj && (
                      <>
                        {studentObj.isActive !== false && (
                          <button
                            onClick={() =>
                              setDeactivateTarget({ notificationId: n._id, studentId: studentObj._id, studentName: n.studentName })
                            }
                            className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                          >
                            <UserX size={13} aria-hidden /> Deactivate
                          </button>
                        )}
                        {user?.isAdmin && (
                          <button
                            onClick={() =>
                              setRemoveTarget({ notificationId: n._id, studentId: studentObj._id, studentName: n.studentName })
                            }
                            className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 size={13} aria-hidden /> Remove
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={deactivateTarget !== null}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={deactivateStudent}
        title={`Deactivate ${deactivateTarget?.studentName ?? "this student"}?`}
        description="They leave every class register but keep their attendance and marks history. This alert is marked resolved. You can reactivate them from the student page."
        confirmLabel={actionBusy ? "Deactivating…" : "Deactivate"}
      />

      <ConfirmDialog
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        onConfirm={removeStudent}
        title={`Remove ${removeTarget?.studentName ?? "this student"} permanently?`}
        description="This erases the student together with all of their attendance records, marks and alerts. It cannot be undone. Deactivate instead if the history should be kept."
        confirmLabel={actionBusy ? "Removing…" : "Remove permanently"}
        tone="danger"
      />

      <AlertModal
        open={actionError !== null}
        onClose={() => setActionError(null)}
        title="That didn't work"
        description={actionError ?? undefined}
        tone="danger"
      />
    </div>
  );
}

