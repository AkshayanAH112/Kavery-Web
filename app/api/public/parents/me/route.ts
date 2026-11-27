import { childView, getParentChildren, kedaAnnouncements } from "@/lib/keda/parent";
import { recentNotices } from "@/lib/notices";

/** What the signed-in parent sees: each of their children, KEDA's announcements, and KEDA's latest posters. */
export async function GET() {
  const students = await getParentChildren();
  if (students.length === 0) return Response.json({ error: "Sign in with the student card first." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const [children, announcements, notices] = await Promise.all([Promise.all(students.map(childView)), kedaAnnouncements(), recentNotices({ topics: ["keda"], limit: 3 })]);
  const posters = notices.map((n) => ({ id: n.id, title: n.title, image: n.image, sentAt: n.sentAt.toISOString() }));
  return Response.json({ children, announcements, posters }, { headers: { "Cache-Control": "private, no-store" } });
}
