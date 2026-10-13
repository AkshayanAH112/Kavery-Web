/**
 * Shapes shared by the analysis screen and `/api/analysis`.
 *
 * The report is saved as a PDF through the browser's own Print dialog rather
 * than a PDF library: KEDA's student names are in Tamil, and the client-side PDF
 * libraries neither embed a Tamil font nor shape the script, so names came out
 * as boxes. The browser prints them exactly as they appear on screen.
 */

/** An exam held in the report period — one column in the table. */
export type AnalysisExam = {
  key: string;
  label: string;
  subject: string;
  examDate: string;
  maxMarks: number;
  grade: number;
};

/** One student's result on one exam they were expected to sit. */
export type AnalysisStudentExam = {
  examKey: string;
  status: "sat" | "absent" | "missing";
  marks: number | null;
  maxMarks: number;
};

/** The filters a report was produced with, so its printed header matches the table. */
export type AnalysisReportFilters = {
  start: string; // yyyy-mm-dd
  end: string;
  gradeLabel: string;
  batchLabel: string;
};

export function examDateLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Colombo" });
}

export function reportDateLabel(yyyyMmDd: string) {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
