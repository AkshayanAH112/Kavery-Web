import { childView, getParentChildren, kedaAnnouncements } from "@/lib/keda/parent";

/** What the signed-in parent sees: each of their children, and KEDA's announcements. */
export async function GET() {
  const students = await getParentChildren();
  if (students.length === 0) return Response.json({ error: "Sign in with the student card first." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const [children, announcements] = await Promise.all([Promise.all(students.map(childView)), kedaAnnouncements()]);
  return Response.json({ children, announcements }, { headers: { "Cache-Control": "private, no-store" } });
}
