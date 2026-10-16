"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import {
  Loader2,
  Search,
  Download,
  FileSpreadsheet,
  UserX,
  Users,
  CheckCircle2,
  Phone,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { searchText } from "@/lib/keda/bamini";

const STATUS_LABEL: Record<string, string> = {
  present: "Present",
  leave: "Leave",
  not_recorded: "—",
  not_eligible: "N/A",
};

export default function AttendanceExportPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [grade, setGrade] = useState("");
  const [batchId, setBatchId] = useState("");
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"all" | "absentees">("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetch("/api/batches").then((r) => r.json() as any).then((d) => setBatches(d.batches || []));
  }, []);

  const generate = async () => {
    if (!from || !to) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (grade) params.set("grade", grade);
      if (batchId) params.set("batchId", batchId);
      const res = await fetch(`/api/attendance/export?${params}`);
      const data = await res.json() as any;
      setResult(data);
    } finally {
      setLoading(false);
    }
  };

  const absenteeRows = (result?.rows || []).filter(
    (row: any) => row.totalLeaves > 0 || (row.eligibleCount > 0 && row.totalPresent < row.eligibleCount)
  );

  const downloadExcel = () => {
    if (!result) return;
    const header = [
      "Registration Number",
      "Student Name",
      "Batch",
      ...result.sessions.map((s: any) =>
        `${new Date(s.date).toLocaleDateString()}${s.subject ? ` (${s.subject})` : ""}`
      ),
      "Total Present",
      "Total Leaves",
      "Attendance %",
    ];

    const sheetRows = result.rows.map((row: any) => {
      const dailyCells = result.sessions.map((s: any) => STATUS_LABEL[row.byClassId[s._id]] ?? "N/A");
      return [
        row.registrationNumber,
        row.name,
        row.batchName,
        ...dailyCells,
        row.totalPresent,
        row.totalLeaves,
        row.attendancePercent !== null ? `${row.attendancePercent}%` : "—",
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...sheetRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, `KEDA_Attendance_${from}_to_${to}.xlsx`);
  };

  const downloadAbsenteesExcel = () => {
    if (!result || absenteeRows.length === 0) return;

    const header = [
      "Registration Number",
      "Student Name",
      "Batch",
      "Total Present",
      "Total Leaves",
      "Missed Sessions",
      "Attendance %",
      "Missed Dates & Sessions",
      "Guardian Name",
      "Guardian Phone",
    ];

    const sheetRows = absenteeRows.map((row: any) => {
      const missedDates = result.sessions
        .filter((s: any) => row.byClassId[s._id] === "leave" || row.byClassId[s._id] === "not_recorded")
        .map((s: any) => {
          const status = row.byClassId[s._id] === "leave" ? "Leave" : "Unmarked";
          const d = new Date(s.date).toLocaleDateString();
          return `${d}${s.subject ? ` (${s.subject})` : ""} [${status}]`;
        })
        .join("; ");

      return [
        row.registrationNumber,
        row.name,
        row.batchName,
        row.totalPresent,
        row.totalLeaves,
        row.eligibleCount - row.totalPresent,
        row.attendancePercent !== null ? `${row.attendancePercent}%` : "—",
        missedDates || "None",
        row.guardianName || "—",
        row.guardianPhone || "—",
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...sheetRows]);
    ws["!cols"] = [
      { wch: 18 },
      { wch: 25 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 14 },
      { wch: 45 },
      { wch: 22 },
      { wch: 18 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Absentees");
    XLSX.writeFile(wb, `KEDA_Absentees_${from}_to_${to}.xlsx`);
  };

  const query = searchText(searchQuery.trim());
  const currentList = activeTab === "absentees" ? absenteeRows : result?.rows || [];
  const filteredRows = currentList.filter(
    (row: any) =>
      searchText(row.name).includes(query) ||
      (row.registrationNumber ?? "").toLowerCase().includes(query) ||
      (row.guardianPhone ?? "").toLowerCase().includes(query)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Attendance Report</h1>
        <p className="text-muted-foreground">Select a date range to generate attendance and absentees reports.</p>
      </div>

      <div className="grid gap-4 rounded-lg border border-border bg-card p-6 shadow-xs sm:grid-cols-4">
        <div>
          <label className="field-label">From Date</label>
          <input type="date" required className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="field-label">To Date</label>
          <input type="date" required className="field" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Grade</label>
          <select className="field cursor-pointer" value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">All Grades</option>
            <option value="3">Grade 3</option>
            <option value="4">Grade 4</option>
            <option value="5">Grade 5</option>
          </select>
        </div>
        <div>
          <label className="field-label">Batch</label>
          <select className="field cursor-pointer" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">All Batches</option>
            {batches.map((b) => (
              <option key={b._id} value={b._id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-4 flex flex-wrap items-center gap-3">
          <button
            onClick={generate}
            disabled={loading || !from || !to}
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
            Generate
          </button>
          {result && result.rows.length > 0 && (
            <>
              <button
                onClick={downloadExcel}
                className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-primary px-4 py-2 font-semibold text-primary transition-colors hover:bg-primary/10"
              >
                <Download size={18} /> Download Excel (All)
              </button>
              <button
                onClick={downloadAbsenteesExcel}
                disabled={absenteeRows.length === 0}
                className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-destructive/80 px-4 py-2 font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                title={absenteeRows.length === 0 ? "No absentees found in this date range" : "Download absentees details as Excel"}
              >
                <UserX size={18} /> Download Absentees Excel ({absenteeRows.length})
              </button>
            </>
          )}
        </div>
      </div>

      {result && (
        result.rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-16 text-center">
            <FileSpreadsheet size={40} className="text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No class sessions found for this range.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Quick Summary Cards */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-xs">
                <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                  <Calendar size={20} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Classes in Period</p>
                  <p className="text-xl font-bold text-foreground">{result.sessions.length}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-xs">
                <div className="rounded-lg bg-secondary p-2.5 text-secondary-foreground">
                  <Users size={20} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Students</p>
                  <p className="text-xl font-bold text-foreground">{result.rows.length}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-xs">
                <div className={`rounded-lg p-2.5 ${absenteeRows.length > 0 ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
                  <UserX size={20} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Absentees / Leaves</p>
                  <p className="text-xl font-bold text-foreground">
                    {absenteeRows.length}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({result.rows.length > 0 ? Math.round((absenteeRows.length / result.rows.length) * 100) : 0}%)
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Controls Bar: Tabs and Search */}
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab("all")}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                    activeTab === "all"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  <Users size={16} /> All Students ({result.rows.length})
                </button>
                <button
                  onClick={() => setActiveTab("absentees")}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                    activeTab === "absentees"
                      ? "bg-destructive text-destructive-foreground shadow-xs"
                      : "bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  }`}
                >
                  <UserX size={16} /> Absentees Only ({absenteeRows.length})
                </button>
              </div>

              <div className="relative sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <input
                  type="text"
                  placeholder="Search name, index or phone..."
                  className="field pl-9 py-1.5 text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Table Area */}
            {activeTab === "absentees" && absenteeRows.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-success/30 bg-success/5 p-12 text-center">
                <CheckCircle2 size={40} className="text-success" />
                <div>
                  <p className="font-bold text-foreground">No Absentees!</p>
                  <p className="text-sm text-muted-foreground">
                    All students had 100% attendance during this date range.
                  </p>
                </div>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground shadow-xs">
                No students found matching &quot;{searchQuery}&quot;.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-secondary font-medium text-secondary-foreground">
                      <tr>
                        <th className="px-4 py-3">Reg. Number</th>
                        <th className="px-4 py-3">Student Name</th>
                        <th className="px-4 py-3">Batch</th>
                        {activeTab === "all" ? (
                          <>
                            <th className="px-4 py-3 text-center">Present</th>
                            <th className="px-4 py-3 text-center">Leaves</th>
                            <th className="px-4 py-3 text-center">Attendance %</th>
                          </>
                        ) : (
                          <>
                            <th className="px-4 py-3 text-center">Leaves / Missed</th>
                            <th className="px-4 py-3 text-center">Attendance %</th>
                            <th className="px-4 py-3">Missed Dates</th>
                            <th className="px-4 py-3">Guardian</th>
                            <th className="px-4 py-3">Guardian Phone</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredRows.map((row: any) => {
                        const missedSessions = result.sessions.filter(
                          (s: any) => row.byClassId[s._id] === "leave" || row.byClassId[s._id] === "not_recorded"
                        );
                        const isAbsentee =
                          row.totalLeaves > 0 || (row.eligibleCount > 0 && row.totalPresent < row.eligibleCount);

                        return (
                          <tr
                            key={row.studentId}
                            className={`transition-colors duration-150 hover:bg-muted/50 ${
                              activeTab === "all" && isAbsentee ? "bg-destructive/2" : ""
                            }`}
                          >
                            <td className="px-4 py-2.5 font-mono text-xs font-semibold text-muted-foreground">
                              {row.registrationNumber}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="font-semibold text-foreground">{row.name}</span>
                              {activeTab === "all" && isAbsentee && (
                                <span className="ml-2 inline-flex items-center rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                                  Absent
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">{row.batchName}</td>

                            {activeTab === "all" ? (
                              <>
                                <td className="px-4 py-2.5 text-center tabular">{row.totalPresent}</td>
                                <td className="px-4 py-2.5 text-center tabular font-semibold text-destructive">
                                  {row.totalLeaves}
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  {row.attendancePercent !== null ? (
                                    <span
                                      className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold ${
                                        row.attendancePercent < 75
                                          ? "bg-destructive/10 text-destructive"
                                          : row.attendancePercent < 90
                                          ? "bg-warning/10 text-warning"
                                          : "bg-success/10 text-success"
                                      }`}
                                    >
                                      {row.attendancePercent}%
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-4 py-2.5 text-center">
                                  <span className="inline-flex items-center gap-1 font-bold text-destructive">
                                    <AlertTriangle size={13} />
                                    {row.eligibleCount - row.totalPresent} missed
                                    {row.totalLeaves > 0 && (
                                      <span className="text-xs font-normal text-muted-foreground">
                                        ({row.totalLeaves} leave{row.totalLeaves === 1 ? "" : "s"})
                                      </span>
                                    )}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  {row.attendancePercent !== null ? (
                                    <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-bold text-destructive">
                                      {row.attendancePercent}%
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  <div className="flex flex-wrap gap-1 max-w-xs">
                                    {missedSessions.slice(0, 3).map((s: any) => (
                                      <span
                                        key={s._id}
                                        className="inline-block rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                                        title={`${new Date(s.date).toLocaleDateString()}${s.subject ? ` — ${s.subject}` : ""}`}
                                      >
                                        {new Date(s.date).toLocaleDateString("en-GB", {
                                          day: "numeric",
                                          month: "short",
                                        })}
                                        {s.subject ? ` (${s.subject})` : ""}
                                      </span>
                                    ))}
                                    {missedSessions.length > 3 && (
                                      <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                        +{missedSessions.length - 3} more
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 text-muted-foreground">
                                  {row.guardianName || "—"}
                                </td>
                                <td className="px-4 py-2.5">
                                  {row.guardianPhone && row.guardianPhone !== "—" ? (
                                    <a
                                      href={`tel:${row.guardianPhone}`}
                                      className="inline-flex items-center gap-1.5 text-primary hover:underline font-mono text-xs"
                                    >
                                      <Phone size={13} />
                                      {row.guardianPhone}
                                    </a>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                  )}
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}

