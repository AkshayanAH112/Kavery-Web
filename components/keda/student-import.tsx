"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileSpreadsheet, Upload } from "lucide-react";
import { baminiToUnicode, looksLikeBamini } from "@/lib/keda/bamini";
import { findStudents } from "@/lib/keda/import-sheet";
import { BaminiInput } from "@/components/keda/bamini-input";

type Batch = { _id: string; name: string; year: number; grades: number[] };
type Row = { registrationNumber: string; original: string; name: string; grade: number; include: boolean };

export default function StudentImportScreen() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [leftOut, setLeftOut] = useState(0);
  const [convert, setConvert] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ imported: number; skipped: number } | null>(null);

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

  async function readFile(file: File) {
    setError(null);
    setDone(null);
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.read(await file.arrayBuffer());
      const cells = book.SheetNames.flatMap((name) => XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], { header: 1, raw: false, defval: "" }));
      const { students, unnamed } = findStudents(cells);
      setLeftOut(unnamed);
      if (students.length === 0) {
        setRows([]);
        setError(unnamed > 0 ? "That file has index numbers but no names beside them, so there is nobody to import." : "No index numbers like KEDA/27/1000 were found in that file.");
        return;
      }
      // Decide once for the whole file: a list is typed in Bamini or it is not.
      const bamini = students.some((s) => looksLikeBamini(s.original));
      setConvert(bamini);
      setFileName(file.name);
      setRows(students.map((s) => ({ ...s, name: bamini ? baminiToUnicode(s.original) : s.original, grade: grades[grades.length - 1] ?? 5, include: true })));
    } catch {
      setError("That file could not be read. Save it as .xlsx and try again.");
    }
  }

  function toggleConvert(on: boolean) {
    setConvert(on);
    setRows((prev) => prev.map((r) => ({ ...r, name: on ? baminiToUnicode(r.original) : r.original })));
  }

  const update = (index: number, change: Partial<Row>) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...change } : r)));

  async function submit() {
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
      setDone({ imported: data.imported ?? 0, skipped: data.skipped ?? 0 });
      setRows([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The import failed. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/console/students" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} aria-hidden /> Students
      </Link>
      <div>
        <h1 className="text-2xl text-foreground">Import students from Excel</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          For students who already have an index number on paper. The file is read in your browser; nothing is saved until you press Import. Guardian
          details are not in the list, so they stay empty and can be filled in on each student&apos;s page.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
      {done && (
        <div role="status" className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success">
          {done.imported} student{done.imported === 1 ? "" : "s"} imported.
          {done.skipped > 0 && ` ${done.skipped} already existed and ${done.skipped === 1 ? "was" : "were"} left as ${done.skipped === 1 ? "it was" : "they were"}.`}{" "}
          <Link href="/console/students" className="font-semibold underline underline-offset-4">
            See the students
          </Link>
        </div>
      )}

      <div className="grid gap-4 rounded-[var(--card-radius)] border border-border bg-card p-6 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="import-batch">
            Batch
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
            <input type="file" accept=".xlsx,.xls" className="sr-only" disabled={!batch} onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
          </label>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-[var(--card-radius)] border border-border bg-card">
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
                <select className="field !h-10 !w-auto" value="" onChange={(e) => e.target.value && setRows((prev) => prev.map((r) => ({ ...r, grade: Number(e.target.value) })))}>
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
            <table className="w-full min-w-[40rem] text-left text-sm">
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
                      <select className="field !w-auto" aria-label={`Grade for ${row.registrationNumber}`} value={row.grade} onChange={(e) => update(i, { grade: Number(e.target.value) })}>
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
              onClick={submit}
              disabled={busy || included.length === 0 || unnamed > 0}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[var(--field-radius)] bg-primary px-5 font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Importing…" : `Import ${included.length} student${included.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
