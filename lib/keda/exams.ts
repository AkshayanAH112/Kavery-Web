import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getBatch, isGrade, isId, parseDate, text, type BatchRow } from "./server";

const { exams: E } = schema;

export type ExamRow = typeof E.$inferSelect;
export type MarkRow = typeof schema.marks.$inferSelect;

export const examDoc = (e: ExamRow, batch?: BatchRow | null) => ({
  _id: e.id,
  name: e.name ?? undefined,
  subject: e.subject,
  grade: e.grade,
  batchId: batch ? { _id: batch.id, name: batch.name } : e.batchId,
  examDate: e.examDate.toISOString(),
  maxMarks: e.maxMarks,
  isPublished: e.isPublished,
  publishedAt: e.publishedAt?.toISOString() ?? null,
  createdAt: e.createdAt.toISOString(),
  updatedAt: e.updatedAt.toISOString(),
});

/**
 * A mark in the flat shape the screens read: subject, date, maximum, grade and
 * batch are copied down from the exam. `marks` is stored as 0 for an absent
 * student — `isAbsent` is the signal, never the zero.
 */
export const markDoc = (m: MarkRow, exam: ExamRow) => ({
  _id: m.id,
  studentId: m.studentId,
  examId: exam.id,
  subject: exam.subject,
  examName: exam.name ?? undefined,
  examDate: exam.examDate.toISOString(),
  marks: m.marks,
  isAbsent: m.isAbsent,
  maxMarks: exam.maxMarks,
  grade: exam.grade,
  batchId: exam.batchId,
});

export async function getExam(id: unknown) {
  if (!isId(id)) return null;
  return (await getDb().query.exams.findFirst({ where: eq(E.id, id) })) ?? null;
}

type ExamInput = Partial<{ subject: string; name: string | null; grade: number; batchId: string; examDate: Date; maxMarks: number; isPublished: boolean; publishedAt: Date | null }>;

/**
 * Validates an exam form body. With `partial`, only the fields present are
 * checked (an edit). A string is a message for the person filling in the form.
 */
export async function parseExam(data: Record<string, unknown> | null, partial = false): Promise<ExamInput | string> {
  if (!data) return "Invalid request";
  const out: ExamInput = {};
  if (data.subject !== undefined || !partial) {
    const subject = text(data.subject, 80);
    if (!subject) return "Subject is required";
    out.subject = subject;
  }
  if (data.name !== undefined) out.name = text(data.name, 80) || null;
  if (data.grade !== undefined || !partial) {
    if (!isGrade(Number(data.grade))) return "Choose the grade this exam is for";
    out.grade = Number(data.grade);
  }
  if (data.batchId !== undefined || !partial) {
    const batch = await getBatch(data.batchId);
    if (!batch) return "Choose a batch for this exam";
    out.batchId = batch.id;
  }
  if (data.examDate !== undefined || !partial) {
    const date = parseDate(data.examDate);
    if (!date) return "Choose the date of the exam";
    out.examDate = date;
  }
  if (data.maxMarks !== undefined || !partial) {
    const max = Number(data.maxMarks);
    if (!Number.isFinite(max) || max <= 0 || max > 1000) return "Maximum marks must be a number above 0";
    out.maxMarks = max;
  }
  // Publishing is what makes an exam visible to the public results lookup. It is never implied.
  if (data.isPublished !== undefined) {
    out.isPublished = Boolean(data.isPublished);
    out.publishedAt = data.isPublished ? new Date() : null;
  }
  return out;
}
