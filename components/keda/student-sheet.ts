import { DETAIL_FIELDS, detailsSheetRows } from "@/lib/keda/details-sheet";

type SheetStudent = {
  registrationNumber?: string | null;
  name: string;
  grade: number;
  batchId?: { name?: string } | string;
  school?: string | null;
  address?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  whatsapp?: string | null;
  notes?: string | null;
};

const WIDTHS: Record<(typeof DETAIL_FIELDS)[number], number> = {
  registrationNumber: 14,
  name: 30,
  grade: 7,
  batch: 22,
  school: 28,
  address: 36,
  guardianName: 26,
  guardianPhone: 15,
  whatsapp: 15,
  notes: 30,
};

/**
 * Downloads students as the detailed sheet the import page reads back. Phone
 * numbers are written as text so Excel keeps their leading 0. An empty list
 * gives a blank sheet with just the headings, for registering new students.
 */
export async function downloadStudentSheet(students: SheetStudent[], fileName: string) {
  const XLSX = await import("xlsx");
  const sorted = [...students].sort((a, b) => (a.registrationNumber ?? "~").localeCompare(b.registrationNumber ?? "~", undefined, { numeric: true }));
  const rows = detailsSheetRows(
    sorted.map((s) => ({
      ...s,
      registrationNumber: s.registrationNumber ?? "",
      batchName: typeof s.batchId === "object" ? s.batchId?.name : undefined,
    })),
  );
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = DETAIL_FIELDS.map((f) => ({ wch: WIDTHS[f] }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Students");
  XLSX.writeFile(book, fileName);
}
