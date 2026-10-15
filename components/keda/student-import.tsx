"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, FileSpreadsheet, Upload } from "lucide-react";
import { baminiToUnicode, looksLikeBamini } from "@/lib/keda/bamini";
import { findStudents } from "@/lib/keda/import-sheet";
import { DETAIL_HEADERS, TAMIL_FIELDS, planSheet, readDetailsSheet, type PlanStudent, type PlannedRow, type SheetRow } from "@/lib/keda/details-sheet";
import { BaminiInput } from "@/components/keda/bamini-input";
import { downloadStudentSheet } from "@/components/keda/student-sheet";

type Batch = { _id: string; name: string; year: number; grades: number[] };
type Row = { registrationNumber: string; original: string; name: string; grade: number; include: boolean };
type StudentDoc = Omit<PlanStudent, "id" | "batchId"> & { _id: string; batchId?: { _id: string; name?: string } | string };
type Done = { text: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function StudentImportScreen() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState("");
  const [fileName, setFileName] = useState("");
  const [convert, setConvert] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<{ line: number; error: string }[]>([]);
  const [done, setDone] = useState<Done | null>(null);

  // A paper class list: index numbers with a name beside each.
  const [rows, setRows] = useState<Row[]>([]);
  const [leftOut, setLeftOut] = useState(0);

  // A detailed sheet: one row per student, one column per field.
  const [sheet, setSheet] = useState<SheetRow[] | null>(null);
  const [students, setStudents] = useState<StudentDoc[] | null>(null);

  useEffect(() => {
    fetch("/api/batches")
      .then((r) => r.json() as Promise<{ batches?: Batch[] }>)
      .then((d) => {
        setBatches(d.batches ?? []);
        if (d.batches?.[0]) setBatchId(d.batches[0]._id);
      })
      .catch(() => setError("Could not load the batches. Refresh and try again."));
  }, []);

  const batch = batches.find((b) => b._id === batchId);
  const grades = useMemo(() => batch?.grades ?? [], [batch]);
  const included = rows.filter((r) => r.include);
  const unnamed = included.filter((r) => !r.name.trim()).length;

  async function loadStudents() {
    const res = await fetch("/api/students");
    if (!res.ok) throw new Error("Could not load the students. Refresh and try again.");
    const data = (await res.json()) as { students?: StudentDoc[] };
    setStudents(data.students ?? []);
    return data.students ?? [];
  }

  async function readFile(file: File) {
    setError(null);
    setProblems([]);
    setDone(null);
    setRows([]);
    setSheet(null);
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.read(await file.arrayBuffer());
      const sheets = book.SheetNames.map((name) => XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], { header: 1, raw: false, defval: "" }));

      const detailed = sheets.map(readDetailsSheet).find((found) => found !== null);
      if (detailed) {
        if (detailed.length === 0) return setError("That sheet has the headings but no students under them.");
        await loadStudents();
        setConvert(detailed.some((r) => TAMIL_FIELDS.some((f) => looksLikeBamini(r.values[f] ?? ""))));
        setFileName(file.name);
        setSheet(detailed);
        return;
      }

      const { students, unnamed } = findStudents(sheets.flat());
      setLeftOut(unnamed);
      if (students.length === 0) {
        setError(
          unnamed > 0
            ? "That file has index numbers but no names beside them, so there is nobody to import."
            : "No students were found. Use a sheet with an “Index number” and a “Name” heading, or a class list with index numbers like KEDA/27/1000.",
        );
        return;
      }
      // Decide once for the whole file: a list is typed in Bamini or it is not.
      const bamini = students.some((s) => looksLikeBamini(s.original));
      setConvert(bamini);
      setFileName(file.name);
      setRows(students.map((s) => ({ ...s, name: bamini ? baminiToUnicode(s.original) : s.original, grade: grades[grades.length - 1] ?? 5, include: true })));
    } catch (e) {
      setError(e instanceof Error && e.message.startsWith("Could not") ? e.message : "That file could not be read. Save it as .xlsx and try again.");
    }
  }

  function toggleConvert(on: boolean) {
    setConvert(on);
    setRows((prev) => prev.map((r) => ({ ...r, name: on ? baminiToUnicode(r.original) : r.original })));
  }

  const update = (index: number, change: Partial<Row>) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...change } : r)));

  async function submitList() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/students/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ batchId, students: included.map((r) => ({ registrationNumber: r.registrationNumber, name: r.name.trim(), grade: r.grade })) }),
      });
      const data = (await res.json()) as { error?: string; imported?: number; skipped?: number };
      if (!res.ok) throw new Error(data.error ?? "The import failed. Nothing was saved.");
      const skipped = data.skipped ?? 0;
      setDone({
        text: `${plural(data.imported ?? 0, "student")} imported.${skipped > 0 ? ` ${skipped} already existed and ${skipped === 1 ? "was" : "were"} left as ${skipped === 1 ? "it was" : "they were"}.` : ""}`,
      });
      setRows([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The import failed. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  // Bamini cells are converted before planning, so the preview shows what will be stored.
  const converted = useMemo(
    () =>
      sheet?.map((row) => ({
        ...row,
        values: Object.fromEntries(Object.entries(row.values).map(([f, v]) => [f, convert && (TAMIL_FIELDS as string[]).includes(f) && looksLikeBamini(v ?? "") ? baminiToUnicode(v!) : v])),
      })) ?? [],
    [sheet, convert],
  );
  const plan = useMemo(() => {
    if (!sheet || !students) return [];
    const known: PlanStudent[] = students.map((s) => ({ ...s, id: s._id, batchId: typeof s.batchId === "object" ? s.batchId._id : s.batchId }));
    return planSheet(
      converted,
      known,
      batches.map((b) => ({ id: b._id, name: b.name, year: b.year, grades: b.grades })),
      batchId,
    );
  }, [sheet, students, converted, batches, batchId]);
  const count = (action: PlannedRow["action"]) => plan.filter((p) => p.action === action).length;
  const toSave = plan.filter((p) => p.action === "create" || p.action === "update");

  async function submitSheet() {
    setBusy(true);
    setError(null);
    setProblems([]);
    try {
      const lines = new Set(toSave.map((p) => p.line));
      const res = await fetch("/api/students/sheet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ defaultBatchId: batchId, rows: converted.filter((r) => lines.has(r.line)) }),
      });
      const data = (await res.json()) as { error?: string; problems?: { line: number; error: string }[]; created?: number; updated?: number };
      if (!res.ok) {
        setProblems(data.problems ?? []);
        throw new Error(data.error ?? "Saving failed. Nothing was saved.");
      }
      setDone({ text: `${plural(data.created ?? 0, "new student")} registered and ${plural(data.updated ?? 0, "student")} updated.` });
      setSheet(null);
      setStudents(null);
      setFileName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saving failed. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadCurrent() {
    setError(null);
    try {
      const all = students ?? (await loadStudents());
      await downloadStudentSheet(all, `KEDA students ${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The sheet could not be made.");
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/console/students" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} aria-hidden /> Students
      </Link>
      <div>
        <h1 className="text-2xl text-foreground">Import students from Excel</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          Register new students or update the details of existing ones from a spreadsheet. The file is read in your browser; nothing is saved until you
          press Save.
        </p>
      </div>

      <div className="grid gap-4 rounded-(--card-radius) border border-border bg-card p-6 md:grid-cols-2">
        <div>
          <h2 className="font-semibold text-foreground">Add or update with the detailed sheet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Download the current students, fill in or correct their details in Excel, and choose the file below. A row with an index number that is
            already registered updates that student; any other row registers a new one (leave the index number empty to have one given). A blank cell
            leaves the saved value as it is.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={downloadCurrent} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-(--field-radius) border border-border px-4 text-sm font-semibold hover:bg-muted">
              <Download size={16} aria-hidden /> Current students
            </button>
            <button
              type="button"
              onClick={() => downloadStudentSheet([], "KEDA new students.xlsx")}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-(--field-radius) border border-border px-4 text-sm font-semibold hover:bg-muted"
            >
              <Download size={16} aria-hidden /> Blank sheet
            </button>
          </div>
        </div>
        <div>
          <h2 className="font-semibold text-foreground">A class list on paper</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            KEDA&apos;s own list, with index numbers and names side by side, can be chosen as it is. Only the index number and name are read; guardian
            details stay empty until they are added.
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
          {problems.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {problems.map((p) => (
                <li key={p.line}>
                  Row {p.line}: {p.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {done && (
        <div role="status" className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success">
          {done.text}{" "}
          <Link href="/console/students" className="font-semibold underline underline-offset-4">
            See the students
          </Link>
        </div>
      )}

      <div className="grid gap-4 rounded-(--card-radius) border border-border bg-card p-6 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="import-batch">
            {sheet ? "Batch for new students without one" : "Batch"}
          </label>
          <select id="import-batch" className="field" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            {batches.length === 0 && <option value="">Create a batch first</option>}
            {batches.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="field-label">Excel file</span>
          <label className="field flex cursor-pointer items-center gap-2 text-muted-foreground">
            <Upload size={16} aria-hidden />
            <span className="truncate">{fileName || "Choose an .xlsx file"}</span>
            {/* The value is cleared so choosing the same file again, after fixing it, reads it again. */}
            <input
              type="file"
              accept=".xlsx,.xls"
              className="sr-only"
              disabled={!batch}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) readFile(file);
              }}
            />
          </label>
        </div>
      </div>

      {sheet && students && (
        <div className="overflow-hidden rounded-(--card-radius) border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-4">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold">
              <FileSpreadsheet size={18} aria-hidden /> {plural(plan.length, "row")}
              <span className="text-sm font-normal text-muted-foreground">
                {count("create")} new · {count("update")} to update · {count("same")} unchanged
                {count("error") > 0 && <span className="text-destructive"> · {plural(count("error"), "problem")}</span>}
              </span>
            </p>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={convert} onChange={(e) => setConvert(e.target.checked)} />
              Tamil text is typed in the Bamini font
            </label>
          </div>
          <p className="border-b border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
            Check the changes before saving. Rows with a problem are left out; correct them in the file and choose it again.
            {count("same") > 0 && ` ${plural(count("same"), "row")} already match${count("same") === 1 ? "es" : ""} what is saved and ${count("same") === 1 ? "is" : "are"} not shown.`}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-176 text-left text-sm">
              <thead className="bg-secondary text-secondary-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Row</th>
                  <th scope="col" className="px-4 py-3 font-medium">Index number</th>
                  <th scope="col" className="px-4 py-3 font-medium">Name</th>
                  <th scope="col" className="px-4 py-3 font-medium">What will happen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {plan
                  .filter((p) => p.action !== "same")
                  .map((p) => (
                    <tr key={p.line} className={p.action === "error" ? "bg-destructive/5" : ""}>
                      <td className="tabular px-4 py-2 align-top text-muted-foreground">{p.line}</td>
                      <td className="tabular whitespace-nowrap px-4 py-2 align-top font-mono text-xs">{p.registrationNumber ?? (p.action === "create" ? "Given on save" : "—")}</td>
                      <td className="px-4 py-2 align-top">{p.name || "—"}</td>
                      <td className="px-4 py-2 align-top">
                        {p.action === "error" && <span className="text-destructive">{p.error}</span>}
                        {p.action === "create" && (
                          <span>
                            <span className="font-semibold text-success">New student</span>
                            <span className="text-muted-foreground">
                              {" "}
                              · Grade {p.changes.grade} · {batches.find((b) => b._id === p.changes.batch)?.name}
                              {!p.changes.guardianPhone && " · no guardian phone yet"}
                            </span>
                          </span>
                        )}
                        {p.action === "update" && (
                          <ul className="space-y-0.5">
                            {p.shown.map((c) => (
                              <li key={c.field}>
                                <span className="text-muted-foreground">{DETAIL_HEADERS[c.field]}:</span> <span className="text-muted-foreground line-through decoration-muted-foreground/60">{c.from}</span> → <span className="font-medium">{c.to}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border p-4">
            <p className="text-sm text-muted-foreground">
              {toSave.length === 0 ? "There is nothing to save." : `${count("create")} new, ${count("update")} updated.`}
              {count("error") > 0 && ` ${plural(count("error"), "row")} with a problem will be left out.`}
            </p>
            <button
              type="button"
              onClick={submitSheet}
              disabled={busy || toSave.length === 0}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-(--field-radius) bg-primary px-5 font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Saving…" : `Save ${plural(toSave.length, "student")}`}
            </button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-(--card-radius) border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-4">
            <p className="flex items-center gap-2 font-semibold">
              <FileSpreadsheet size={18} aria-hidden /> {rows.length} found · {included.length} selected
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <label className="flex min-h-11 cursor-pointer items-center gap-2">
                <input type="checkbox" className="h-4 w-4" checked={convert} onChange={(e) => toggleConvert(e.target.checked)} />
                Names are typed in the Bamini font
              </label>
              <label className="flex items-center gap-2">
                Set every grade to
                <select className="field h-10! w-auto!" value="" onChange={(e) => e.target.value && setRows((prev) => prev.map((r) => ({ ...r, grade: Number(e.target.value) })))}>
                  <option value="">Choose</option>
                  {grades.map((g) => (
                    <option key={g} value={g}>
                      Grade {g}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <p className="border-b border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
            Read each name before importing. The conversion is automatic and a rare letter can come out wrong; type over any name to correct it.
            {leftOut > 0 && ` ${leftOut} index number${leftOut === 1 ? "" : "s"} in the file had no name beside ${leftOut === 1 ? "it" : "them"} and ${leftOut === 1 ? "was" : "were"} left out.`}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 text-left text-sm">
              <thead className="bg-secondary text-secondary-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Import</th>
                  <th scope="col" className="px-4 py-3 font-medium">Index number</th>
                  <th scope="col" className="px-4 py-3 font-medium">Name</th>
                  <th scope="col" className="px-4 py-3 font-medium">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row, i) => (
                  <tr key={row.registrationNumber} className={row.include ? "" : "opacity-50"}>
                    <td className="px-4 py-2">
                      <input type="checkbox" className="h-4 w-4" aria-label={`Import ${row.registrationNumber}`} checked={row.include} onChange={(e) => update(i, { include: e.target.checked })} />
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-2 font-mono text-xs">{row.registrationNumber}</td>
                    <td className="px-4 py-2">
                      {/* A correction is typed the way the list was: with Bamini keys when the file is in Bamini. */}
                      <BaminiInput bamini={convert} className="field" aria-label={`Name for ${row.registrationNumber}`} value={row.name} onValueChange={(name) => update(i, { name })} />
                    </td>
                    <td className="px-4 py-2">
                      <select className="field w-auto!" aria-label={`Grade for ${row.registrationNumber}`} value={row.grade} onChange={(e) => update(i, { grade: Number(e.target.value) })}>
                        {grades.map((g) => (
                          <option key={g} value={g}>
                            Grade {g}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border p-4">
            <p className="text-sm text-muted-foreground">
              {unnamed > 0 ? `${unnamed} selected row${unnamed === 1 ? " has" : "s have"} no name. Add one or untick ${unnamed === 1 ? "it" : "them"}.` : `Importing into ${batch?.name}.`}
            </p>
            <button
              type="button"
              onClick={submitList}
              disabled={busy || included.length === 0 || unnamed > 0}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-(--field-radius) bg-primary px-5 font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Importing…" : `Import ${included.length} student${included.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
