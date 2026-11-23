"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

/**
 * Every KEDA console screen, loaded in the browser only.
 *
 * These screens fetch their data after mounting, so rendering them on the
 * server produced nothing but a spinner — while dragging the spreadsheet, chart
 * and QR-scanner libraries they import into the Worker bundle, which has a hard
 * size limit (3 MB compressed on Cloudflare's free plan). `ssr: false` keeps
 * those libraries in browser chunks, where they belong.
 *
 * Pages import screens from here, never from the screen files directly.
 */
const loading = () => (
  <div className="flex justify-center p-12">
    <Loader2 className="animate-spin text-muted-foreground" size={32} aria-label="Loading" />
  </div>
);
// next/dynamic needs its options written out as a literal at each call.

export const StudentsScreen = dynamic(() => import("./students"), { ssr: false, loading });
export const StudentImportScreen = dynamic(() => import("./student-import"), { ssr: false, loading });
export const StudentDetailScreen = dynamic(() => import("./student-detail"), { ssr: false, loading });
export const BatchesScreen = dynamic(() => import("./batches"), { ssr: false, loading });
export const BatchDetailScreen = dynamic(() => import("./batch-detail"), { ssr: false, loading });
export const ClassDetailScreen = dynamic(() => import("./class-detail"), { ssr: false, loading });
export const AttendanceReportScreen = dynamic(() => import("./attendance-report"), { ssr: false, loading });
export const AttendanceTodayScreen = dynamic(() => import("./attendance-today"), { ssr: false, loading });
export const ScannerScreen = dynamic(() => import("./scanner"), { ssr: false, loading });
export const AlertsScreen = dynamic(() => import("./alerts"), { ssr: false, loading });
export const ExamsScreen = dynamic(() => import("./exams"), { ssr: false, loading });
export const TestDetailScreen = dynamic(() => import("./test-detail"), { ssr: false, loading });
export const ExamDetailScreen = dynamic(() => import("./exam-detail"), { ssr: false, loading });
export const OnlinePapersScreen = dynamic(() => import("./online-papers"), { ssr: false, loading });
export const OnlinePaperScreen = dynamic(() => import("./online-paper"), { ssr: false, loading });
export const OnlineResultsScreen = dynamic(() => import("./online-results"), { ssr: false, loading });
export const AnalysisScreen = dynamic(() => import("./analysis"), { ssr: false, loading });
